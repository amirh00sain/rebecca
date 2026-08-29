package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	adminapp "github.com/rebeccapanel/rebecca/internal/app/admin"
	"github.com/rebeccapanel/rebecca/internal/app/logging"
)

const (
	defaultAdminUsername = "admin1"
	defaultAdminPassword = "admin123"
	minPasswordLength   = 6
	envAdminUsername     = "REBECCA_ADMIN_USERNAME"
	envAdminPassword     = "REBECCA_ADMIN_PASSWORD"
)

// ensureBootstrapAdmin creates the initial admin if no admins exist.
// This runs deterministically on every startup but only inserts when the admins
// table is empty. The password policy (min 6 chars) is enforced only on
// bootstrap (not on subsequent API updates). Credentials are never printed in
// logs.
func ensureBootstrapAdmin(ctx context.Context, db *sql.DB) error {
	var count int
	row := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM admins WHERE status != 'deleted'`)
	if err := row.Scan(&count); err != nil {
		return fmt.Errorf("check admins count: %w", err)
	}
	if count > 0 {
		return nil
	}

	username := strings.TrimSpace(os.Getenv(envAdminUsername))
	password := strings.TrimSpace(os.Getenv(envAdminPassword))
	if username == "" {
		username = defaultAdminUsername
	}
	if password == "" {
		password = defaultAdminPassword
	}

	if len(password) < minPasswordLength {
		return fmt.Errorf("bootstrap admin password must be at least %d characters", minPasswordLength)
	}

	hash, err := adminapp.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash bootstrap admin password: %w", err)
	}

	permissions := adminapp.RoleDefaultPermissions(adminapp.RoleFullAccess)
	permissionsJSON, err := json.Marshal(permissions)
	if err != nil {
		return fmt.Errorf("marshal bootstrap admin permissions: %w", err)
	}

	now := time.Now().UTC()
	_, err = db.ExecContext(ctx, `
INSERT INTO admins (
	username, hashed_password, created_at, role, permissions, telegram_id,
	subscription_settings, users_usage, lifetime_usage, created_traffic,
	deleted_users_usage, traffic_limit_mode, use_service_traffic_limits,
	show_user_traffic, delete_user_usage_limit_enabled, status
) VALUES (?, ?, ?, ?, ?, NULL, '{}', 0, 0, 0, 0, 'used_traffic', 0, 1, 0, 'active')`,
		username,
		hash,
		now,
		string(adminapp.RoleFullAccess),
		string(permissionsJSON),
	)
	if err != nil {
		return fmt.Errorf("insert bootstrap admin: %w", err)
	}

	logging.Infof(logging.ComponentRuntime, "[Bootstrap] admin created successfully")
	return nil
}
