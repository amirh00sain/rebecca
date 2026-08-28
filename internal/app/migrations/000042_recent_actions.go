package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("000042_recent_actions.go", up000042RecentActions, emptyDown)
}

func up000042RecentActions(ctx context.Context, tx *sql.Tx) error {
	dialect := NormalizeDialect(activeDialect())
	if err := createTable(ctx, tx, dialect, "recent_actions", `
CREATE TABLE recent_actions (
	id INTEGER PRIMARY KEY,
	action_type VARCHAR(96) NOT NULL,
	resource_type VARCHAR(64) NOT NULL,
	resource_key VARCHAR(512) NOT NULL,
	actor_admin_id INTEGER NULL,
	actor_username VARCHAR(256) NOT NULL,
	auth_source VARCHAR(32) NOT NULL,
	summary VARCHAR(512) NOT NULL,
	snapshot BLOB NULL,
	after_hash VARCHAR(64) NOT NULL,
	rollback_status VARCHAR(16) NOT NULL DEFAULT 'available',
	created_at DATETIME NOT NULL,
	snapshot_expires_at DATETIME NULL,
	undone_at DATETIME NULL,
	undone_by_admin_id INTEGER NULL
)`, `
CREATE TABLE recent_actions (
	id BIGINT NOT NULL AUTO_INCREMENT,
	action_type VARCHAR(96) NOT NULL,
	resource_type VARCHAR(64) NOT NULL,
	resource_key VARCHAR(512) NOT NULL,
	actor_admin_id BIGINT NULL,
	actor_username VARCHAR(256) NOT NULL,
	auth_source VARCHAR(32) NOT NULL,
	summary VARCHAR(512) NOT NULL,
	snapshot MEDIUMBLOB NULL,
	after_hash VARCHAR(64) NOT NULL,
	rollback_status VARCHAR(16) NOT NULL DEFAULT 'available',
	created_at DATETIME NOT NULL,
	snapshot_expires_at DATETIME NULL,
	undone_at DATETIME NULL,
	undone_by_admin_id BIGINT NULL,
	PRIMARY KEY (id)
)`); err != nil {
		return err
	}
	for _, index := range []struct {
		name    string
		columns []string
	}{
		{name: "ix_recent_actions_created", columns: []string{"created_at", "id"}},
		{name: "ix_recent_actions_rollback", columns: []string{"rollback_status", "snapshot_expires_at"}},
	} {
		if err := createIndex(ctx, tx, dialect, "recent_actions", index.name, index.columns, false); err != nil {
			return err
		}
	}
	return nil
}
