package management

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
)

type routingPreviewCandidate struct {
	coreauth.QuotaResetCandidate
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
}

type routingPreviewResponse struct {
	Strategy   string                    `json:"strategy"`
	QuotaAware bool                      `json:"quota_aware"`
	NextAuthID string                    `json:"next_auth_id,omitempty"`
	DecidedBy  string                    `json:"decided_by,omitempty"`
	Candidates []routingPreviewCandidate `json:"candidates"`
}

// GetRoutingPreview reports which Claude account the configured quota-aware
// strategy would pick for a new session, and why. It runs the same ranking as
// the live selector; other strategies report quota_aware=false.
func (h *Handler) GetRoutingPreview(c *gin.Context) {
	strategy, ok := config.NormalizeRoutingStrategy(h.cfg.Routing.Strategy)
	if !ok {
		strategy = strings.TrimSpace(h.cfg.Routing.Strategy)
	}
	response := routingPreviewResponse{Strategy: strategy, Candidates: []routingPreviewCandidate{}}
	selector, quotaAware := coreauth.NewQuotaResetSelectorForStrategy(strategy)
	if !quotaAware || h.authManager == nil {
		c.JSON(http.StatusOK, response)
		return
	}

	var claudeAuths []*coreauth.Auth
	byID := make(map[string]*coreauth.Auth)
	for _, auth := range h.authManager.List() {
		if auth == nil || !strings.EqualFold(strings.TrimSpace(auth.Provider), "claude") {
			continue
		}
		claudeAuths = append(claudeAuths, auth)
		byID[auth.ID] = auth
	}

	preview := selector.Preview(claudeAuths)
	response.QuotaAware = true
	response.NextAuthID = preview.NextAuthID
	response.DecidedBy = preview.DecidedBy
	for _, candidate := range preview.Candidates {
		auth := byID[candidate.AuthID]
		name := strings.TrimSpace(auth.FileName)
		if name == "" {
			name = auth.ID
		}
		_, email := auth.AccountInfo()
		if auth.AuthKind() != coreauth.AuthKindOAuth {
			email = ""
		}
		response.Candidates = append(response.Candidates, routingPreviewCandidate{
			QuotaResetCandidate: candidate,
			Name:                name,
			Email:               email,
		})
	}
	c.JSON(http.StatusOK, response)
}
