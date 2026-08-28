package main

import (
	"strings"
	"testing"
)

func TestRunRejectsUnknownCommands(t *testing.T) {
	app := &cli{}
	for _, args := range [][]string{{"unknown"}, {"migrate", "unknown"}} {
		err := app.run(args)
		if err == nil || !strings.Contains(err.Error(), "unknown") {
			t.Fatalf("run(%q) error = %v", args, err)
		}
	}
}
