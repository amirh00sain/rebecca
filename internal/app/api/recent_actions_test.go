//go:build cgo

package api

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rebeccapanel/rebecca/internal/app/xrayconfig"
)

func createRecentActionsTable(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE recent_actions (
		id INTEGER PRIMARY KEY, action_type TEXT NOT NULL, resource_type TEXT NOT NULL, resource_key TEXT NOT NULL,
		actor_admin_id INTEGER NULL, actor_username TEXT NOT NULL, auth_source TEXT NOT NULL, summary TEXT NOT NULL,
		snapshot BLOB NULL, after_hash TEXT NOT NULL, rollback_status TEXT NOT NULL, created_at DATETIME NOT NULL,
		snapshot_expires_at DATETIME NULL, undone_at DATETIME NULL, undone_by_admin_id INTEGER NULL
	)`); err != nil {
		t.Fatal(err)
	}
}

func TestRecordRecentActionStoresCompressedBeforeAndAfter(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	createRecentActionsTable(t, db)
	server := &Server{db: db}
	principal := adminPrincipal{ID: 9, Username: "operator"}
	ctx := context.WithValue(context.Background(), adminContextKey, principal)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	before := xrayconfig.MutationSnapshot{Version: 1}
	after := xrayconfig.MutationSnapshot{Version: 1, InboundTag: "cdn"}
	if err := server.recordRecentActionTx(ctx, tx, xrayconfig.Mutation{
		ActionType: "inbound.create", ResourceType: "inbound", ResourceKey: "cdn", Summary: "Created inbound", Before: before, After: after,
	}); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	action, err := server.loadRecentAction(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if action.ActorUsername != "operator" || action.RollbackStatus != "available" || len(action.Snapshot) == 0 {
		t.Fatalf("unexpected action: %#v", action)
	}
	snapshot, err := decodeRecentActionSnapshot(action.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Before.Version != 1 || snapshot.After.InboundTag != "cdn" {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
}

func TestRecordRecentActionEventStoresHistoryOnly(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	createRecentActionsTable(t, db)
	server := &Server{db: db}
	ctx := context.WithValue(context.Background(), adminContextKey, adminPrincipal{ID: 9, Username: "operator"})
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := server.recordRecentActionEventTx(ctx, tx, "admin.disable", "admin", "seller", "Disabled admin"); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	action, err := server.loadRecentAction(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if action.ResourceType != "admin" || action.RollbackStatus != "unsupported" || len(action.Snapshot) != 0 {
		t.Fatalf("unexpected action: %#v", action)
	}
	items, err := server.listRecentActions(ctx, 0, 10, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("non-full-access list exposed admin activity: %#v", items)
	}
}

func TestRecordRecentActionEventDetailsStoresPreviewAndResources(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	createRecentActionsTable(t, db)
	server := &Server{db: db}
	ctx := context.WithValue(context.Background(), adminContextKey, adminPrincipal{ID: 9, Username: "operator"})
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	err = server.recordRecentActionEventDetailsTx(ctx, tx, "admin.update", "admin", "seller", "Updated admin", []recentActionValueChange{{
		Field: "data_limit", Before: "100 GB", After: "200 GB", Delta: "+100 GB",
	}}, []string{"de-2", "de-1", "de-2"})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	items, err := server.listRecentActions(ctx, 0, 10, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Preview == nil || items[0].Preview.Delta != "+100 GB" {
		t.Fatalf("unexpected preview: %#v", items)
	}
	action, err := server.loadRecentAction(ctx, items[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := decodeRecentActionSnapshot(action.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Changes) != 1 || len(snapshot.AffectedResources) != 2 || snapshot.AffectedResources[0] != "de-1" {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
}

func TestRecentActionSnapshotPreviewShowsHostRename(t *testing.T) {
	preview := recentActionSnapshotPreview(recentActionSnapshot{
		Before: xrayconfig.MutationSnapshot{Hosts: []xrayconfig.HostSnapshot{{ID: 1, Remark: "name"}}},
		After:  xrayconfig.MutationSnapshot{Hosts: []xrayconfig.HostSnapshot{{ID: 1, Remark: "newname"}}},
	}, "host.bulk_update", "host")
	if preview == nil || preview.Field != "name" || preview.Before != "name" || preview.After != "newname" {
		t.Fatalf("unexpected preview: %#v", preview)
	}
}

func TestRecentActionSnapshotPreviewUsesLifecycleTemplate(t *testing.T) {
	preview := recentActionSnapshotPreview(recentActionSnapshot{
		Before: xrayconfig.MutationSnapshot{Hosts: []xrayconfig.HostSnapshot{{ID: 1, Remark: "Turkey"}}},
		After:  xrayconfig.MutationSnapshot{},
	}, "host.bulk_update", "host")
	if preview == nil || preview.Operation != "deleted" || preview.Resource != "host" {
		t.Fatalf("unexpected host preview: %#v", preview)
	}
	preview = recentActionSnapshotPreview(recentActionSnapshot{
		After: xrayconfig.MutationSnapshot{Hosts: []xrayconfig.HostSnapshot{{ID: 2, Remark: "Netherlands"}}},
	}, "host.bulk_update", "host")
	if preview == nil || preview.Operation != "created" || preview.Resource != "host" {
		t.Fatalf("unexpected created host preview: %#v", preview)
	}
	preview = recentActionSnapshotPreview(recentActionSnapshot{
		Before: xrayconfig.MutationSnapshot{Hosts: []xrayconfig.HostSnapshot{{ID: 1, Remark: "Turkey"}}},
	}, "inbound.delete", "inbound")
	if preview == nil || preview.Operation != "deleted" || preview.Resource != "inbound" {
		t.Fatalf("unexpected inbound preview: %#v", preview)
	}

	preview = recentActionSnapshotPreview(recentActionSnapshot{ConfigPatches: []xrayconfig.ConfigPatch{{
		Changes: []xrayconfig.ConfigPatchChange{{
			Path: "/outbounds/@tag=proxy", Before: map[string]any{"tag": "proxy"}, BeforeExists: true,
		}},
	}}}, "xray.config.update", "xray_config")
	if preview == nil || preview.Operation != "deleted" || preview.Resource != "outbound" {
		t.Fatalf("unexpected outbound preview: %#v", preview)
	}
}

func TestRecentActionConfigPreviewsKeepChangedResource(t *testing.T) {
	before := xrayconfig.TargetState{
		TargetID: "master", HasStoredConfig: true,
		StoredConfig: map[string]any{"outbounds": []any{map[string]any{
			"tag": "tor-de", "settings": map[string]any{"servers": []any{map[string]any{"port": 9050}}},
		}}},
	}
	after := xrayconfig.TargetState{
		TargetID: "master", HasStoredConfig: true,
		StoredConfig: map[string]any{"outbounds": []any{map[string]any{
			"tag": "tor-de", "settings": map[string]any{"servers": []any{map[string]any{"port": 9051}}},
		}}},
	}
	patches, err := xrayconfig.BuildConfigPatches([]xrayconfig.TargetState{before}, []xrayconfig.TargetState{after})
	if err != nil {
		t.Fatal(err)
	}
	previews := recentActionConfigPreviews(patches, []xrayconfig.TargetState{before}, []xrayconfig.TargetState{after})
	if len(previews) != 1 || previews[0].Path != "/outbounds/@tag=tor-de" {
		t.Fatalf("unexpected previews: %#v", previews)
	}
	if got := previews[0].ChangedPaths; len(got) != 1 || got[0] != "/outbounds/@tag=tor-de/settings/servers/0/port" {
		t.Fatalf("unexpected changed paths: %#v", got)
	}
	beforeOutbound, ok := previews[0].Before.(map[string]any)
	if !ok || beforeOutbound["tag"] != "tor-de" {
		t.Fatalf("expected complete outbound before change, got %#v", previews[0].Before)
	}
	afterOutbound, ok := previews[0].After.(map[string]any)
	if !ok || afterOutbound["tag"] != "tor-de" {
		t.Fatalf("expected complete outbound after change, got %#v", previews[0].After)
	}
}

func TestRecoverRecentActionConfigPreviewsUsesCurrentConfig(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE xray_config (id INTEGER PRIMARY KEY, data TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	beforeConfig := map[string]any{"outbounds": []any{map[string]any{
		"tag": "tor-de", "settings": map[string]any{"servers": []any{map[string]any{"port": 9050}}},
	}}}
	afterConfig := map[string]any{"outbounds": []any{map[string]any{
		"tag": "tor-de", "settings": map[string]any{"servers": []any{map[string]any{"port": 9051}}},
	}}}
	if _, err := db.Exec(`INSERT INTO xray_config (id, data) VALUES (1, ?)`, `{"outbounds":[{"tag":"tor-de","settings":{"servers":[{"port":9051}]}}]}`); err != nil {
		t.Fatal(err)
	}
	before := xrayconfig.TargetState{TargetID: "master", Mode: xrayconfig.ConfigModeCustom, HasStoredConfig: true, StoredConfig: beforeConfig}
	after := xrayconfig.TargetState{TargetID: "master", Mode: xrayconfig.ConfigModeCustom, HasStoredConfig: true, StoredConfig: afterConfig}
	patches, err := xrayconfig.BuildConfigPatches([]xrayconfig.TargetState{before}, []xrayconfig.TargetState{after})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{configRepo: xrayconfig.NewRepository(db, "sqlite", xrayconfig.Options{})}
	previews := server.recoverRecentActionConfigPreviews(context.Background(), patches)
	if len(previews) != 1 || previews[0].Path != "/outbounds/@tag=tor-de" {
		t.Fatalf("unexpected previews: %#v", previews)
	}
	beforeOutbound, ok := previews[0].Before.(map[string]any)
	if !ok || beforeOutbound["tag"] != "tor-de" {
		t.Fatalf("expected complete outbound before change, got %#v", previews[0].Before)
	}
}

func TestRecentActionConfigResourceCoversXraySections(t *testing.T) {
	for path, expected := range map[string]string{
		"/routing/balancers/@tag=edge": "balancer",
		"/routing/rules/0":             "routing_rule",
		"/reverse/bridges/0":           "reverse_proxy",
		"/fakedns/0":                   "fake_dns",
		"/burstObservatory/subject":    "burst_observatory",
		"/observatory/subjectSelector": "observatory",
		"/policy/levels":               "policy",
		"/transport/grpc":              "transport",
	} {
		if actual := recentActionConfigResource(path); actual != expected {
			t.Fatalf("resource for %s = %q, want %q", path, actual, expected)
		}
	}
}

func TestRecentActionConfigPreviewScopeKeepsFullChangedResource(t *testing.T) {
	for path, expected := range map[string]string{
		"/inbounds/@tag=vless/streamSettings/security":   "/inbounds/@tag=vless",
		"/outbounds/@tag=direct/settings/servers/0/port": "/outbounds/@tag=direct",
		"/routing/rules/0/outboundTag":                   "/routing/rules/0",
		"/routing/balancers/@tag=edge/fallbackTag":       "/routing/balancers/@tag=edge",
		"/reverse/bridges/0/tag":                         "/reverse/bridges/0",
		"/fakedns/0/ipPool":                              "/fakedns/0",
		"/dns/servers/0/address":                         "/dns/servers/0",
		"/observatory/subjectSelector":                   "/observatory",
		"/burstObservatory/subjectSelector":              "/burstObservatory",
		"/policy/levels":                                 "/policy",
		"/transport/grpc":                                "/transport",
		"/log/loglevel":                                  "/log",
	} {
		if actual := recentActionConfigPreviewScope(path); actual != expected {
			t.Fatalf("scope for %s = %q, want %q", path, actual, expected)
		}
	}
}

func TestRecentActionHostPreviewsKeepFullChangedHost(t *testing.T) {
	before := xrayconfig.HostSnapshot{ID: 1, Remark: "old", Address: "192.0.2.1"}
	after := before
	after.Remark = "new"
	previews := recentActionHostPreviews([]xrayconfig.HostSnapshot{before}, []xrayconfig.HostSnapshot{after})
	if len(previews) != 1 || previews[0].Before != before || previews[0].After != after {
		t.Fatalf("unexpected host previews: %#v", previews)
	}
}
