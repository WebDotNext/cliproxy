package config

import "strings"

// Canonical routing strategy names accepted by routing.strategy.
const (
	RoutingStrategyRoundRobin         = "round-robin"
	RoutingStrategyWeightedRoundRobin = "weighted-round-robin"
	RoutingStrategyFillFirst          = "fill-first"
	RoutingStrategySoonestReset       = "soonest-reset"
	RoutingStrategyBurnRate           = "burn-rate"
)

// NormalizeRoutingStrategy maps a configured strategy (including short aliases)
// to its canonical name. An empty value selects round-robin. The boolean is
// false when the value is not a known strategy.
func NormalizeRoutingStrategy(strategy string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(strategy)) {
	case "", "round-robin", "roundrobin", "rr":
		return RoutingStrategyRoundRobin, true
	case "weighted-round-robin", "weightedroundrobin", "wrr":
		return RoutingStrategyWeightedRoundRobin, true
	case "fill-first", "fillfirst", "ff":
		return RoutingStrategyFillFirst, true
	case "soonest-reset", "soonestreset":
		return RoutingStrategySoonestReset, true
	case "burn-rate", "burnrate":
		return RoutingStrategyBurnRate, true
	default:
		return "", false
	}
}
