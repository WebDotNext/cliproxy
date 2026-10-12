package auth

import (
	"context"
	"strconv"
	"testing"
	"time"

	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/executor"
)

var quotaTestNow = time.Unix(1_800_000_000, 0)

type quotaFixture struct {
	fiveHourUtil  float64
	fiveHourReset time.Duration
	weeklyUtil    float64
	weeklyReset   time.Duration
	weeklyStatus  string
}

func claudeOAuthAuth(id string, quota *quotaFixture) *Auth {
	auth := &Auth{ID: id, Provider: "claude", Attributes: map[string]string{AttributeAuthKind: AuthKindOAuth}}
	if quota == nil {
		return auth
	}
	status := quota.weeklyStatus
	if status == "" {
		status = "allowed"
	}
	auth.Quota.Signals = map[string]string{
		"Anthropic-Ratelimit-Unified-5h-Utilization": strconv.FormatFloat(quota.fiveHourUtil, 'f', -1, 64),
		"Anthropic-Ratelimit-Unified-5h-Reset":       strconv.FormatInt(quotaTestNow.Add(quota.fiveHourReset).Unix(), 10),
		"Anthropic-Ratelimit-Unified-5h-Status":      "allowed",
		"Anthropic-Ratelimit-Unified-7d-Utilization": strconv.FormatFloat(quota.weeklyUtil, 'f', -1, 64),
		"Anthropic-Ratelimit-Unified-7d-Reset":       strconv.FormatInt(quotaTestNow.Add(quota.weeklyReset).Unix(), 10),
		"Anthropic-Ratelimit-Unified-7d-Status":      status,
	}
	return auth
}

func TestQuotaResetSelectorPick(t *testing.T) {
	t.Parallel()

	// "expiring" resets first but is nearly spent; "fresh" resets later with everything left.
	expiring := &quotaFixture{fiveHourReset: 4 * time.Hour, weeklyUtil: 0.9, weeklyReset: 24 * time.Hour}
	fresh := &quotaFixture{fiveHourReset: 4 * time.Hour, weeklyUtil: 0, weeklyReset: 72 * time.Hour}

	cases := []struct {
		name  string
		mode  QuotaResetMode
		auths []*Auth
		want  string
	}{
		{
			name:  "soonest-reset drains the account whose week ends first",
			mode:  QuotaResetSoonestReset,
			auths: []*Auth{claudeOAuthAuth("fresh", fresh), claudeOAuthAuth("expiring", expiring)},
			want:  "expiring",
		},
		{
			name:  "burn-rate picks the account that needs the fastest use",
			mode:  QuotaResetBurnRate,
			auths: []*Auth{claudeOAuthAuth("expiring", expiring), claudeOAuthAuth("fresh", fresh)},
			want:  "fresh",
		},
		{
			name: "burn-rate breaks near-equal rates by the sooner 5-hour reset",
			mode: QuotaResetBurnRate,
			auths: []*Auth{
				claudeOAuthAuth("a", &quotaFixture{fiveHourReset: 4 * time.Hour, weeklyUtil: 0.43, weeklyReset: 59 * time.Hour}),
				claudeOAuthAuth("b", &quotaFixture{fiveHourReset: 1 * time.Hour, weeklyUtil: 0, weeklyReset: 104 * time.Hour}),
			},
			want: "b",
		},
		{
			name: "accounts near a limit are skipped",
			mode: QuotaResetSoonestReset,
			auths: []*Auth{
				claudeOAuthAuth("five-hour-spent", &quotaFixture{fiveHourUtil: 0.97, fiveHourReset: time.Hour, weeklyReset: time.Hour}),
				claudeOAuthAuth("weekly-rejected", &quotaFixture{fiveHourReset: time.Hour, weeklyReset: 2 * time.Hour, weeklyStatus: "rejected"}),
				claudeOAuthAuth("ok", fresh),
			},
			want: "ok",
		},
		{
			name: "a window whose reset has passed counts as unused",
			mode: QuotaResetSoonestReset,
			auths: []*Auth{
				// Without the roll-over this account looks spent and the API key would win.
				{ID: "api-key", Provider: "claude", Attributes: map[string]string{AttributeAPIKey: "sk-test"}},
				claudeOAuthAuth("rolled-over", &quotaFixture{fiveHourUtil: 0.99, fiveHourReset: -time.Hour, weeklyUtil: 0.99, weeklyReset: -time.Hour}),
			},
			want: "rolled-over",
		},
		{
			name:  "unmeasured Claude accounts are probed before ranked ones",
			mode:  QuotaResetBurnRate,
			auths: []*Auth{claudeOAuthAuth("measured", fresh), claudeOAuthAuth("unmeasured", nil)},
			want:  "unmeasured",
		},
		{
			name: "API keys are used only after every measured account is near its limit",
			mode: QuotaResetBurnRate,
			auths: []*Auth{
				{ID: "api-key", Provider: "claude", Attributes: map[string]string{AttributeAPIKey: "sk-test"}},
				claudeOAuthAuth("spent", &quotaFixture{fiveHourUtil: 1, fiveHourReset: time.Hour, weeklyReset: time.Hour}),
			},
			want: "api-key",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			selector := NewQuotaResetSelector(tc.mode)
			selector.now = func() time.Time { return quotaTestNow }
			got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, tc.auths)
			if err != nil {
				t.Fatalf("Pick() error = %v", err)
			}
			if got.ID != tc.want {
				t.Fatalf("Pick() = %q, want %q", got.ID, tc.want)
			}
		})
	}
}

func TestQuotaResetSelectorPreviewMatchesPick(t *testing.T) {
	t.Parallel()

	tie := []*Auth{
		claudeOAuthAuth("idexx", &quotaFixture{fiveHourUtil: 0.15, fiveHourReset: 2 * time.Hour, weeklyUtil: 0.44, weeklyReset: 59 * time.Hour}),
		claudeOAuthAuth("ezyvet", &quotaFixture{fiveHourReset: 4 * time.Hour, weeklyReset: 103 * time.Hour}),
		claudeOAuthAuth("spent", &quotaFixture{fiveHourUtil: 1, fiveHourReset: time.Hour, weeklyReset: time.Hour}),
	}
	cases := []struct {
		name      string
		mode      QuotaResetMode
		auths     []*Auth
		next      string
		decidedBy string
		tiers     map[string]string
	}{
		{
			name: "burn-rate tie", mode: QuotaResetBurnRate, auths: tie,
			next: "idexx", decidedBy: QuotaDecidedByFiveHourReset,
			tiers: map[string]string{"idexx": QuotaTierRanked, "ezyvet": QuotaTierRanked, "spent": QuotaTierExhausted},
		},
		{
			name: "soonest-reset", mode: QuotaResetSoonestReset, auths: tie,
			next: "idexx", decidedBy: QuotaDecidedByWeeklyReset,
		},
		{
			name: "unmeasured account", mode: QuotaResetBurnRate,
			auths: []*Auth{claudeOAuthAuth("measured", &quotaFixture{weeklyReset: time.Hour, fiveHourReset: time.Hour}), claudeOAuthAuth("new", nil)},
			next:  "new", decidedBy: QuotaDecidedByUnmeasured,
			tiers: map[string]string{"measured": QuotaTierRanked, "new": QuotaTierUnmeasured},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			selector := NewQuotaResetSelector(tc.mode)
			selector.now = func() time.Time { return quotaTestNow }

			preview := selector.Preview(tc.auths)
			if preview.NextAuthID != tc.next || preview.DecidedBy != tc.decidedBy {
				t.Fatalf("Preview() next=%q decided_by=%q, want %q %q", preview.NextAuthID, preview.DecidedBy, tc.next, tc.decidedBy)
			}
			for _, candidate := range preview.Candidates {
				if want, ok := tc.tiers[candidate.AuthID]; ok && candidate.Tier != want {
					t.Errorf("candidate %q tier=%q, want %q", candidate.AuthID, candidate.Tier, want)
				}
			}
			picked, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, tc.auths)
			if err != nil {
				t.Fatalf("Pick() error = %v", err)
			}
			if picked.ID != preview.NextAuthID {
				t.Fatalf("Pick() = %q but Preview() predicted %q", picked.ID, preview.NextAuthID)
			}
		})
	}
}
