//go:build cgo

package xrayconfig

import (
	"context"
	"testing"
)

func TestRestoreMutationSnapshotRestoresTargetConfig(t *testing.T) {
	repo, _ := testRepository(t)
	ctx := context.Background()
	if _, err := repo.SaveTargetRawConfig(ctx, MasterTargetID, repositoryConfig("before", "vless", 443)); err != nil {
		t.Fatal(err)
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	before, err := repo.CaptureMutationSnapshotTx(ctx, tx, SnapshotScope{TargetIDs: []string{MasterTargetID}})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := repo.saveMasterRawConfigTx(ctx, tx, repositoryConfig("after", "trojan", 8443)); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	after, err := repo.CaptureMutationSnapshotTx(ctx, tx, SnapshotScope{TargetIDs: []string{MasterTargetID}})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	afterHash, err := SnapshotHash(after)
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.RestoreMutationSnapshot(ctx, 1, afterHash, before, nil); err != nil {
		t.Fatal(err)
	}
	config, err := repo.MasterRawConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := firstInboundTag(config); got != "before" {
		t.Fatalf("inbound tag after rollback = %q, want before", got)
	}
}

func TestRestoreMutationSnapshotRejectsLaterChange(t *testing.T) {
	repo, _ := testRepository(t)
	ctx := context.Background()
	if _, err := repo.SaveTargetRawConfig(ctx, MasterTargetID, repositoryConfig("before", "vless", 443)); err != nil {
		t.Fatal(err)
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	before, err := repo.CaptureMutationSnapshotTx(ctx, tx, SnapshotScope{TargetIDs: []string{MasterTargetID}})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := repo.saveMasterRawConfigTx(ctx, tx, repositoryConfig("after", "trojan", 8443)); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	after, err := repo.CaptureMutationSnapshotTx(ctx, tx, SnapshotScope{TargetIDs: []string{MasterTargetID}})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	afterHash, err := SnapshotHash(after)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SaveTargetRawConfig(ctx, MasterTargetID, repositoryConfig("later", "shadowsocks", 9443)); err != nil {
		t.Fatal(err)
	}
	if err := repo.RestoreMutationSnapshot(ctx, 1, afterHash, before, nil); err != ErrRollbackConflict {
		t.Fatalf("RestoreMutationSnapshot() error = %v, want %v", err, ErrRollbackConflict)
	}
}
