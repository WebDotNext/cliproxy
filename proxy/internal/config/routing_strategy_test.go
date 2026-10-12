package config

import "testing"

func TestNormalizeRoutingStrategy(t *testing.T) {
	cases := map[string]string{
		"":                     RoutingStrategyRoundRobin,
		"rr":                   RoutingStrategyRoundRobin,
		"weighted-round-robin": RoutingStrategyWeightedRoundRobin,
		"weightedroundrobin":   RoutingStrategyWeightedRoundRobin,
		"wrr":                  RoutingStrategyWeightedRoundRobin,
		"FF":                   RoutingStrategyFillFirst,
		" soonest-reset ":      RoutingStrategySoonestReset,
		"burnrate":             RoutingStrategyBurnRate,
	}
	for input, want := range cases {
		if got, ok := NormalizeRoutingStrategy(input); !ok || got != want {
			t.Errorf("NormalizeRoutingStrategy(%q) = %q, %v; want %q, true", input, got, ok, want)
		}
	}
	if _, ok := NormalizeRoutingStrategy("random"); ok {
		t.Error("NormalizeRoutingStrategy(\"random\") accepted an unknown strategy")
	}
}
