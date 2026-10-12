// Package antigravity provides OAuth2 authentication functionality for the Antigravity provider.
package antigravity

import "os"

// ClientID returns the Antigravity OAuth client ID. It is read from the
// environment so the credential stays out of the repository.
func ClientID() string { return os.Getenv("ANTIGRAVITY_OAUTH_CLIENT_ID") }

// ClientSecret returns the Antigravity OAuth client secret from the environment.
func ClientSecret() string { return os.Getenv("ANTIGRAVITY_OAUTH_CLIENT_SECRET") }

// OAuth configuration
const (
	CallbackPort = 51121
)

// Scopes defines the OAuth scopes required for Antigravity authentication
var Scopes = []string{
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs",
}

// OAuth2 endpoints for Google authentication
const (
	TokenEndpoint    = "https://oauth2.googleapis.com/token"
	AuthEndpoint     = "https://accounts.google.com/o/oauth2/v2/auth"
	UserInfoEndpoint = "https://www.googleapis.com/oauth2/v2/userinfo?alt=json"
)

// Antigravity API configuration
const (
	APIEndpoint      = "https://cloudcode-pa.googleapis.com"
	DailyAPIEndpoint = "https://daily-cloudcode-pa.googleapis.com"
	APIVersion       = "v1internal"
)
