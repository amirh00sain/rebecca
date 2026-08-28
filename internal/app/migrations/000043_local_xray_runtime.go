package migrations

import (
	"context"
	"database/sql"
	"time"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("000043_local_xray_runtime.go", up000043LocalXrayRuntime, emptyDown)
}

// up000043LocalXrayRuntime adds local Xray runtime tracking. The Master now
// manages and runs Xray-core itself (no external Rebecca Nodes required), so we
// track the local binary/process state in a dedicated singleton table. Existing
// node records and node_operations are preserved (deprecated) and are NOT
// destroyed by this migration.
func up000043LocalXrayRuntime(ctx context.Context, tx *sql.Tx) error {
	dialect := NormalizeDialect(activeDialect())

	if err := createTable(ctx, tx, dialect, "local_xray_runtime", `
CREATE TABLE local_xray_runtime (
	id INTEGER PRIMARY KEY,
	version VARCHAR(64) NOT NULL DEFAULT '',
	status VARCHAR(32) NOT NULL DEFAULT 'not_installed',
	binary_path VARCHAR(512) NOT NULL DEFAULT '',
	config_path VARCHAR(512) NOT NULL DEFAULT '',
	pid INTEGER NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT '',
	started_at DATETIME NULL,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`, `
CREATE TABLE local_xray_runtime (
	id BIGINT PRIMARY KEY,
	version VARCHAR(64) NOT NULL DEFAULT '',
	status VARCHAR(32) NOT NULL DEFAULT 'not_installed',
	binary_path VARCHAR(512) NOT NULL DEFAULT '',
	config_path VARCHAR(512) NOT NULL DEFAULT '',
	pid BIGINT NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT '',
	started_at TIMESTAMP NULL,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`); err != nil {
		return err
	}

	_, err := tx.ExecContext(ctx, `
INSERT INTO local_xray_runtime (id, version, status, binary_path, config_path, pid, last_error, updated_at)
SELECT 1, '', 'not_installed', '', '', 0, '', ?
WHERE NOT EXISTS (SELECT 1 FROM local_xray_runtime WHERE id = 1)`,
		dbMigrationTimestamp(time.Now().UTC()))
	return err
}

func dbMigrationTimestamp(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04:05")
}
