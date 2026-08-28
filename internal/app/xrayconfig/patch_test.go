//go:build cgo

package xrayconfig

import (
	"context"
	"testing"
)

func TestConfigPatchPreservesIndependentChanges(t *testing.T) {
	before := patchConfig("warning", 443, 8443, "AsIs")
	after := clonePatchConfig(t, before)
	mapValue(after["log"])["loglevel"] = "info"
	mapValue(listOfMaps(after["inbounds"])[0]["settings"])["decryption"] = "none"

	patch, err := BuildConfigPatch(MasterTargetID, patchTarget(before), patchTarget(after))
	if err != nil {
		t.Fatal(err)
	}
	if len(patch.Changes) == 0 {
		t.Fatal("expected a config patch")
	}
	current := clonePatchConfig(t, after)
	mapValue(current["routing"])["domainStrategy"] = "IPIfNonMatch"
	listOfMaps(current["inbounds"])[1]["port"] = float64(9444)

	restored, err := ApplyConfigPatch(patchTarget(current), patch)
	if err != nil {
		t.Fatal(err)
	}
	if got := stringValue(mapValue(restored.StoredConfig["log"])["loglevel"]); got != "warning" {
		t.Fatalf("rolled back log level = %q, want warning", got)
	}
	if got := stringValue(mapValue(restored.StoredConfig["routing"])["domainStrategy"]); got != "IPIfNonMatch" {
		t.Fatalf("independent routing change was overwritten: %q", got)
	}
	if got := intValue(listOfMaps(restored.StoredConfig["inbounds"])[1]["port"]); got != 9444 {
		t.Fatalf("independent tagged inbound change was overwritten: %d", got)
	}
}

func TestConfigPatchReportsExactPathConflict(t *testing.T) {
	before := patchConfig("warning", 443, 8443, "AsIs")
	after := clonePatchConfig(t, before)
	mapValue(after["log"])["loglevel"] = "info"
	patch, err := BuildConfigPatch(MasterTargetID, patchTarget(before), patchTarget(after))
	if err != nil {
		t.Fatal(err)
	}
	current := clonePatchConfig(t, after)
	mapValue(current["log"])["loglevel"] = "error"

	_, err = ApplyConfigPatch(patchTarget(current), patch)
	conflict, ok := err.(*RollbackConflictError)
	if !ok {
		t.Fatalf("ApplyConfigPatch() error = %v, want path conflict", err)
	}
	if len(conflict.Paths) != 1 || conflict.Paths[0] != "/log/loglevel" {
		t.Fatalf("conflict paths = %#v", conflict.Paths)
	}
}

func TestRestoreConfigPatchesAllowsOlderIndependentRollbacks(t *testing.T) {
	repo, _ := testRepository(t)
	ctx := context.Background()
	base := patchConfig("warning", 443, 8443, "AsIs")
	if _, err := repo.SaveTargetRawConfig(ctx, MasterTargetID, base); err != nil {
		t.Fatal(err)
	}

	firstBefore, firstAfter := saveAndCapturePatchedConfig(t, repo, ctx, func(config map[string]any) {
		mapValue(config["log"])["loglevel"] = "info"
	})
	firstPatch, err := BuildConfigPatch(MasterTargetID, firstBefore, firstAfter)
	if err != nil {
		t.Fatal(err)
	}
	secondBefore, secondAfter := saveAndCapturePatchedConfig(t, repo, ctx, func(config map[string]any) {
		mapValue(config["routing"])["domainStrategy"] = "IPIfNonMatch"
	})
	secondPatch, err := BuildConfigPatch(MasterTargetID, secondBefore, secondAfter)
	if err != nil {
		t.Fatal(err)
	}

	emptySnapshot := MutationSnapshot{Version: 1}
	emptyHash, err := SnapshotHash(emptySnapshot)
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.RestoreMutationSnapshot(ctx, 1, emptyHash, emptySnapshot, []ConfigPatch{firstPatch}); err != nil {
		t.Fatalf("rollback older independent action: %v", err)
	}
	afterFirstRollback, err := repo.MasterRawConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := stringValue(mapValue(afterFirstRollback["log"])["loglevel"]); got != "warning" {
		t.Fatalf("first rollback log level = %q", got)
	}
	if got := stringValue(mapValue(afterFirstRollback["routing"])["domainStrategy"]); got != "IPIfNonMatch" {
		t.Fatalf("first rollback overwrote second change: %q", got)
	}
	if err := repo.RestoreMutationSnapshot(ctx, 2, emptyHash, emptySnapshot, []ConfigPatch{secondPatch}); err != nil {
		t.Fatalf("rollback newer independent action: %v", err)
	}
	finalConfig, err := repo.MasterRawConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := stringValue(mapValue(finalConfig["log"])["loglevel"]); got != "warning" {
		t.Fatalf("final log level = %q", got)
	}
	if got := stringValue(mapValue(finalConfig["routing"])["domainStrategy"]); got != "AsIs" {
		t.Fatalf("final routing strategy = %q", got)
	}
}

func saveAndCapturePatchedConfig(t *testing.T, repo Repository, ctx context.Context, mutate func(map[string]any)) (TargetState, TargetState) {
	t.Helper()
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	before, err := repo.targetStateTx(ctx, tx, MasterTargetID)
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	config := clonePatchConfig(t, before.StoredConfig)
	mutate(config)
	if err := repo.saveMasterRawConfigTx(ctx, tx, config); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	after, err := repo.targetStateTx(ctx, tx, MasterTargetID)
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return before, after
}

func patchConfig(logLevel string, firstPort, secondPort int, domainStrategy string) map[string]any {
	return NormalizePayload(map[string]any{
		"log":     map[string]any{"loglevel": logLevel},
		"routing": map[string]any{"domainStrategy": domainStrategy},
		"inbounds": []any{
			map[string]any{"tag": "first", "protocol": "vless", "port": firstPort, "settings": map[string]any{"clients": []any{}, "decryption": "none"}},
			map[string]any{"tag": "second", "protocol": "vless", "port": secondPort, "settings": map[string]any{"clients": []any{}, "decryption": "none"}},
		},
		"outbounds": []any{map[string]any{"tag": "DIRECT", "protocol": "freedom"}},
	})
}

func patchTarget(config map[string]any) TargetState {
	return TargetState{TargetID: MasterTargetID, Mode: ConfigModeCustom, HasStoredConfig: true, StoredConfig: config}
}

func clonePatchConfig(t *testing.T, config map[string]any) map[string]any {
	t.Helper()
	cloned, err := cloneConfigMap(config)
	if err != nil {
		t.Fatal(err)
	}
	return cloned
}
