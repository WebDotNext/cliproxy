package auth

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/executor"
)

// QuotaResetMode selects how QuotaResetSelector ranks credentials that report
// subscription quota windows.
type QuotaResetMode int

const (
	// QuotaResetSoonestReset prefers the credential whose weekly window resets
	// first, draining it before moving on. The 5-hour reset breaks ties.
	QuotaResetSoonestReset QuotaResetMode = iota
	// QuotaResetBurnRate prefers the credential that must be used fastest to
	// avoid wasting weekly capacity: remaining weekly share divided by the time
	// left until that window resets. Near-equal rates prefer the sooner 5-hour reset.
	QuotaResetBurnRate
)

const (
	claudeFiveHourWindow = 5 * time.Hour
	claudeWeeklyWindow   = 7 * 24 * time.Hour

	// quotaResetExhaustedUtilization leaves headroom for a long agent turn
	// before the upstream starts rejecting requests.
	quotaResetExhaustedUtilization = 0.95
	// quotaResetBurnRateTolerance treats burn rates within 10% of the best as
	// equal so the 5-hour reset can decide between them.
	quotaResetBurnRateTolerance = 0.9
	// quotaResetMinHorizon caps the burn rate of a window that is about to reset.
	quotaResetMinHorizon = 15 * time.Minute
)

// Quota tiers, in the order Pick tries them.
const (
	QuotaTierUnmeasured   = "unmeasured"
	QuotaTierRanked       = "ranked"
	QuotaTierUnobservable = "unobservable"
	QuotaTierExhausted    = "exhausted"
	QuotaTierUnavailable  = "unavailable"
)

// Reasons reported in QuotaResetPreview.DecidedBy.
const (
	QuotaDecidedByUnmeasured    = "unmeasured"      // round-robin among unmeasured accounts
	QuotaDecidedByOnlyCandidate = "only_candidate"  // a single account has headroom
	QuotaDecidedByWeeklyReset   = "weekly_reset"    // soonest-reset: earlier weekly reset
	QuotaDecidedByBurnRate      = "burn_rate"       // burn-rate: clearly highest rate
	QuotaDecidedByFiveHourReset = "five_hour_reset" // tie broken by the sooner 5-hour reset
	QuotaDecidedByUnobservable  = "unobservable"    // round-robin among API keys / other providers
	QuotaDecidedByAllExhausted  = "all_exhausted"   // round-robin over everything still available
	QuotaDecidedByNoneAvailable = "none_available"
)

// QuotaResetSelector routes by the passive Claude subscription quota snapshot
// (anthropic-ratelimit-unified-* headers) captured from upstream responses.
//
// Candidates are tried in tiers:
//  1. Claude OAuth credentials with no snapshot yet, round-robin, so every
//     account is measured once instead of being starved behind a known one.
//  2. Credentials with headroom in both windows, ranked by Mode.
//  3. Credentials that never report a snapshot (API keys, other providers).
//  4. Everything still available, when every measured account is near its limit.
//
// With session affinity enabled this only decides where new sessions start.
type QuotaResetSelector struct {
	Mode QuotaResetMode

	fallback RoundRobinSelector
	now      func() time.Time
}

// NewQuotaResetSelector creates a QuotaResetSelector using the given ranking mode.
func NewQuotaResetSelector(mode QuotaResetMode) *QuotaResetSelector {
	return &QuotaResetSelector{Mode: mode}
}

// NewQuotaResetSelectorForStrategy returns the selector behind a quota-aware
// routing strategy name, or false for strategies that ignore quota data.
func NewQuotaResetSelectorForStrategy(strategy string) (*QuotaResetSelector, bool) {
	normalized, _ := config.NormalizeRoutingStrategy(strategy)
	switch normalized {
	case config.RoutingStrategySoonestReset:
		return NewQuotaResetSelector(QuotaResetSoonestReset), true
	case config.RoutingStrategyBurnRate:
		return NewQuotaResetSelector(QuotaResetBurnRate), true
	default:
		return nil, false
	}
}

// QuotaResetPreview explains the decision Pick would make for a new session.
type QuotaResetPreview struct {
	// NextAuthID is the account Pick would choose; empty when the choice is a
	// round-robin over several accounts (see DecidedBy).
	NextAuthID string                `json:"next_auth_id,omitempty"`
	DecidedBy  string                `json:"decided_by"`
	Candidates []QuotaResetCandidate `json:"candidates"`
}

// QuotaResetCandidate is one account as the selector sees it.
type QuotaResetCandidate struct {
	AuthID string `json:"auth_id"`
	Tier   string `json:"tier"`
	// Rank is the 1-based position among ranked accounts; 0 otherwise.
	Rank     int                    `json:"rank,omitempty"`
	FiveHour *QuotaResetWindowState `json:"five_hour,omitempty"`
	Weekly   *QuotaResetWindowState `json:"weekly,omitempty"`
	// WeeklyBurnRate is the remaining weekly share (0-1) per hour until reset.
	WeeklyBurnRate float64 `json:"weekly_burn_rate,omitempty"`
}

// QuotaResetWindowState is an observed window after roll-over adjustment.
type QuotaResetWindowState struct {
	Utilization float64   `json:"utilization"`
	ResetAt     time.Time `json:"reset_at"`
	Rejected    bool      `json:"rejected,omitempty"`
}

type quotaWindow struct {
	utilization float64
	resetAt     time.Time
	rejected    bool
}

type claudeQuotaSnapshot struct {
	fiveHour quotaWindow
	weekly   quotaWindow
}

type rankedQuotaAuth struct {
	auth  *Auth
	quota claudeQuotaSnapshot
}

// quotaResetPlan is the outcome of classifying and ranking candidates. When
// ordered is non-empty its first entry is the pick; otherwise Pick round-robins
// over pool.
type quotaResetPlan struct {
	ordered   []rankedQuotaAuth
	pool      []*Auth
	tiers     map[string]string
	quotas    map[string]claudeQuotaSnapshot
	decidedBy string
}

// Pick selects a credential according to the tiers documented on QuotaResetSelector.
func (s *QuotaResetSelector) Pick(ctx context.Context, provider, model string, opts cliproxyexecutor.Options, auths []*Auth) (*Auth, error) {
	now := s.clock()
	available, err := getSelectorAvailableAuths(ctx, auths, provider, model, now)
	if err != nil {
		return nil, err
	}
	available = preferCodexWebsocketAuths(ctx, provider, available)
	plan := s.plan(available, now)
	if len(plan.ordered) > 0 {
		return plan.ordered[0].auth, nil
	}
	return s.fallback.Pick(ctx, provider, model, opts, plan.pool)
}

// Preview reports what Pick would decide for a new session across auths,
// using the same classification and ranking.
func (s *QuotaResetSelector) Preview(auths []*Auth) QuotaResetPreview {
	now := s.clock()
	available, errAvailable := getAvailableAuths(auths, "", "", now)
	if errAvailable != nil {
		available = nil
	}
	plan := s.plan(available, now)

	preview := QuotaResetPreview{DecidedBy: plan.decidedBy}
	if len(plan.ordered) > 0 {
		preview.NextAuthID = plan.ordered[0].auth.ID
	} else if len(plan.pool) == 1 {
		preview.NextAuthID = plan.pool[0].ID
	}
	ranks := make(map[string]int, len(plan.ordered))
	for index, candidate := range plan.ordered {
		ranks[candidate.auth.ID] = index + 1
	}
	for _, auth := range auths {
		if auth == nil {
			continue
		}
		candidate := QuotaResetCandidate{AuthID: auth.ID, Tier: plan.tiers[auth.ID], Rank: ranks[auth.ID]}
		if candidate.Tier == "" {
			candidate.Tier = QuotaTierUnavailable
		}
		if quota, ok := plan.quotas[auth.ID]; ok {
			candidate.FiveHour = quota.fiveHour.state()
			candidate.Weekly = quota.weekly.state()
			candidate.WeeklyBurnRate = quota.weekly.burnRate(now)
		}
		preview.Candidates = append(preview.Candidates, candidate)
	}
	return preview
}

func (s *QuotaResetSelector) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

func (s *QuotaResetSelector) plan(available []*Auth, now time.Time) quotaResetPlan {
	plan := quotaResetPlan{tiers: map[string]string{}, quotas: map[string]claudeQuotaSnapshot{}}
	var unmeasured, unobservable []*Auth
	var ranked []rankedQuotaAuth
	for _, candidate := range available {
		if !isClaudeOAuth(candidate) {
			unobservable = append(unobservable, candidate)
			plan.tiers[candidate.ID] = QuotaTierUnobservable
			continue
		}
		quota, ok := claudeQuotaOf(candidate, now)
		if !ok {
			unmeasured = append(unmeasured, candidate)
			plan.tiers[candidate.ID] = QuotaTierUnmeasured
			continue
		}
		plan.quotas[candidate.ID] = quota
		if quota.fiveHour.exhausted() || quota.weekly.exhausted() {
			plan.tiers[candidate.ID] = QuotaTierExhausted
			continue
		}
		plan.tiers[candidate.ID] = QuotaTierRanked
		ranked = append(ranked, rankedQuotaAuth{auth: candidate, quota: quota})
	}

	switch {
	case len(unmeasured) > 0:
		plan.pool, plan.decidedBy = unmeasured, QuotaDecidedByUnmeasured
	case len(ranked) > 0:
		plan.ordered, plan.decidedBy = s.rank(ranked, now)
	case len(unobservable) > 0:
		plan.pool, plan.decidedBy = unobservable, QuotaDecidedByUnobservable
	case len(available) > 0:
		plan.pool, plan.decidedBy = available, QuotaDecidedByAllExhausted
	default:
		plan.decidedBy = QuotaDecidedByNoneAvailable
	}
	return plan
}

// rank orders accounts with headroom best first and reports what separated
// the first from the second.
func (s *QuotaResetSelector) rank(ranked []rankedQuotaAuth, now time.Time) ([]rankedQuotaAuth, string) {
	if len(ranked) == 1 {
		return ranked, QuotaDecidedByOnlyCandidate
	}
	byFiveHourReset := func(a, b rankedQuotaAuth) bool {
		if !a.quota.fiveHour.resetAt.Equal(b.quota.fiveHour.resetAt) {
			return a.quota.fiveHour.resetAt.Before(b.quota.fiveHour.resetAt)
		}
		return a.auth.ID < b.auth.ID
	}

	if s.Mode == QuotaResetBurnRate {
		bestRate := 0.0
		for _, candidate := range ranked {
			bestRate = max(bestRate, candidate.quota.weekly.burnRate(now))
		}
		isContender := func(candidate rankedQuotaAuth) bool {
			return candidate.quota.weekly.burnRate(now) >= bestRate*quotaResetBurnRateTolerance
		}
		// Contenders first, by 5-hour reset; everyone else by falling rate.
		sort.Slice(ranked, func(i, j int) bool {
			ci, cj := isContender(ranked[i]), isContender(ranked[j])
			if ci != cj {
				return ci
			}
			if ci {
				return byFiveHourReset(ranked[i], ranked[j])
			}
			return ranked[i].quota.weekly.burnRate(now) > ranked[j].quota.weekly.burnRate(now)
		})
		if isContender(ranked[1]) {
			return ranked, QuotaDecidedByFiveHourReset
		}
		return ranked, QuotaDecidedByBurnRate
	}

	sort.Slice(ranked, func(i, j int) bool {
		a, b := ranked[i].quota.weekly.resetAt, ranked[j].quota.weekly.resetAt
		if !a.Equal(b) {
			return a.Before(b)
		}
		return byFiveHourReset(ranked[i], ranked[j])
	})
	if ranked[0].quota.weekly.resetAt.Equal(ranked[1].quota.weekly.resetAt) {
		return ranked, QuotaDecidedByFiveHourReset
	}
	return ranked, QuotaDecidedByWeeklyReset
}

func (w quotaWindow) exhausted() bool {
	return w.rejected || w.utilization >= quotaResetExhaustedUtilization
}

// burnRate is the remaining share of the window per hour until it resets.
func (w quotaWindow) burnRate(now time.Time) float64 {
	horizon := max(w.resetAt.Sub(now), quotaResetMinHorizon)
	return (1 - w.utilization) / horizon.Hours()
}

func (w quotaWindow) state() *QuotaResetWindowState {
	return &QuotaResetWindowState{Utilization: w.utilization, ResetAt: w.resetAt, Rejected: w.rejected}
}

func isClaudeOAuth(auth *Auth) bool {
	return strings.EqualFold(strings.TrimSpace(auth.Provider), "claude") && auth.AuthKind() == AuthKindOAuth
}

// claudeQuotaOf reads both windows from the auth's passive quota snapshot.
func claudeQuotaOf(auth *Auth, now time.Time) (claudeQuotaSnapshot, bool) {
	fiveHour, okFiveHour := observedQuotaWindow(auth.Quota.Signals, "5h", claudeFiveHourWindow, now)
	weekly, okWeekly := observedQuotaWindow(auth.Quota.Signals, "7d", claudeWeeklyWindow, now)
	if !okFiveHour || !okWeekly {
		return claudeQuotaSnapshot{}, false
	}
	return claudeQuotaSnapshot{fiveHour: fiveHour, weekly: weekly}, true
}

// observedQuotaWindow parses one anthropic-ratelimit-unified-<name>-* window.
// A window whose reset has passed is reported as fresh: unused, with the reset
// rolled forward by whole window lengths.
func observedQuotaWindow(signals map[string]string, name string, length time.Duration, now time.Time) (quotaWindow, bool) {
	prefix := "Anthropic-Ratelimit-Unified-" + name + "-"
	utilization, errUtilization := strconv.ParseFloat(signals[http.CanonicalHeaderKey(prefix+"utilization")], 64)
	resetUnix, errReset := strconv.ParseInt(signals[http.CanonicalHeaderKey(prefix+"reset")], 10, 64)
	if errUtilization != nil || errReset != nil || resetUnix <= 0 {
		return quotaWindow{}, false
	}
	resetAt := time.Unix(resetUnix, 0)
	if !resetAt.After(now) {
		elapsedWindows := now.Sub(resetAt)/length + 1
		return quotaWindow{resetAt: resetAt.Add(elapsedWindows * length)}, true
	}
	return quotaWindow{
		utilization: utilization,
		resetAt:     resetAt,
		rejected:    strings.EqualFold(signals[http.CanonicalHeaderKey(prefix+"status")], "rejected"),
	}, true
}
