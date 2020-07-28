package main

const (
	Service = "dispatch"
)

var (
	errorPercent int
)

// Main ... entry of the action
func Main(params map[string]interface{}) map[string]interface{} {
	params["body"] = "OK"
	return params
}
