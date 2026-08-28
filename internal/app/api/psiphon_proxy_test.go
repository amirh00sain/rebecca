package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPsiphonSetupRequiresNodeTarget(t *testing.T) {
	server := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/panel/xray/psiphon/setup", bytes.NewBufferString(`{
		"target_id":"master","config":"{}","locations":["de"],"port":20888
	}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.handlePsiphonSetup(rec, req)

	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "specific node") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestPsiphonLocationsRequireNodeTarget(t *testing.T) {
	server := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/panel/xray/psiphon/locations", bytes.NewBufferString(`{
		"target_id":"master","config":"{}"
	}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.handlePsiphonLocations(rec, req)

	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "specific node") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestPsiphonProfilesUseDistinctPortsAndTags(t *testing.T) {
	profiles, err := psiphonProfilesFromPayload(map[string]any{
		"locations": []any{"de", "us"},
		"port":      float64(20888),
		"tag":       "psiphon",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 2 || profiles[0].Tag != "psiphon-de" || profiles[1].Port != 20889 {
		t.Fatalf("profiles=%#v", profiles)
	}
}

func TestPsiphonProfileAlwaysIncludesLocationInTag(t *testing.T) {
	profiles, err := psiphonProfilesFromPayload(map[string]any{
		"locations": []any{"de"},
		"port":      float64(20888),
		"tag":       "psiphon",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].Tag != "psiphon-de" {
		t.Fatalf("profiles=%#v", profiles)
	}
}
