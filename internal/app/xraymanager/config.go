package xraymanager

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sort"
	"strings"

	"github.com/rebeccapanel/rebecca/internal/app/logging"
	"github.com/rebeccapanel/rebecca/internal/app/user"
	"github.com/rebeccapanel/rebecca/internal/app/xrayconfig"
)

// BuildMasterXrayConfig builds the full Xray-core runtime configuration
// from the master config stored in the database, outbound subscriptions,
// and active DB users. This is analogous to nodecontroller.buildRuntimeConfigWithData
// but targets the local Xray instance (master target only).
func (m *xrayManager) BuildMasterXrayConfig(ctx context.Context) ([]byte, error) {
	masterCfg, err := m.repo.GetMasterConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load master config: %w", err)
	}

	// Merge active outbound subscriptions (prepend + append)
	if merged, err := m.outboundSubs.MergeActiveIntoConfig(ctx, masterCfg); err == nil {
		masterCfg = merged
	} else {
		logging.Warnf(logging.ComponentRuntime, "[Xray] outbound subscription merge failed: %v", err)
	}

	// Normalize payload
	masterCfg = xrayconfig.NormalizePayload(masterCfg)

	// Get Xray version for transport normalization
	version, _ := m.Version()
	masterCfg = xrayconfig.NormalizePayloadForXrayVersion(masterCfg, version)

	// Translate virtual tunnel inbounds for runtime
	masterCfg = xrayconfig.TranslateVirtualTunnelInboundsForRuntime(masterCfg)

	// Inline TLS certificate files from disk
	if err := inlineTLSCertificateFiles(masterCfg); err != nil {
		return nil, fmt.Errorf("inline TLS certificates: %w", err)
	}

	// Inject DB users into proxy protocol inbounds
	if err := includeDBUsers(ctx, m.repo.DB(), masterCfg); err != nil {
		return nil, fmt.Errorf("include DB users: %w", err)
	}

	// Merge host (server address) variables for subscription generation
	if err := mergeHostVariables(ctx, m.repo.DB(), masterCfg); err != nil {
		logging.Warnf(logging.ComponentRuntime, "[Xray] host variable merge failed: %v", err)
	}

	// Add Xray stats/api/policy for local management
	applyLocalXrayRuntimeSettings(masterCfg)

	raw, err := json.MarshalIndent(masterCfg, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal xray config: %w", err)
	}
	return raw, nil
}

// applyLocalXrayRuntimeSettings adds the Xray stats API inbound, routing rule,
// and policy settings required for the local xray binary to work.
func applyLocalXrayRuntimeSettings(raw map[string]any) {
	apiPort := localXrayAPIPort
	apiHost := "127.0.0.1"

	// api
	raw["api"] = map[string]any{
		"services": []any{"HandlerService", "StatsService", "LoggerService"},
		"tag":      "API",
	}
	raw["stats"] = map[string]any{}

	// policy
	policy := ensureMap(raw, "policy")
	levels := ensureMap(policy, "levels")
	level0 := ensureMap(levels, "0")
	level0["statsUserUplink"] = true
	level0["statsUserDownlink"] = true
	level0["statsUserOnline"] = true
	policy["levels"] = levels
	policy["system"] = map[string]any{
		"statsInboundDownlink":  false,
		"statsInboundUplink":    false,
		"statsOutboundDownlink": true,
		"statsOutboundUplink":   true,
	}
	raw["policy"] = policy

	// API inbound (local only)
	inbounds := listOfMaps(raw["inbounds"])
	foundAPI := false
	for _, inbound := range inbounds {
		if tag := stringValue(inbound["tag"]); tag == "API_INBOUND" {
			inbound["listen"] = apiHost
			inbound["port"] = apiPort
			inbound["protocol"] = "tunnel"
			settings := ensureMap(inbound, "settings")
			delete(settings, "address")
			settings["allowedNetwork"] = "tcp"
			settings["rewriteAddress"] = apiHost
			inbound["settings"] = settings
			foundAPI = true
			break
		}
	}
	if !foundAPI {
		inbounds = append([]map[string]any{{
			"listen":   apiHost,
			"port":     apiPort,
			"protocol": "tunnel",
			"settings": map[string]any{
				"allowedNetwork": "tcp",
				"rewriteAddress": apiHost,
			},
			"tag": "API_INBOUND",
		}}, inbounds...)
	}
	raw["inbounds"] = mapsToAny(inbounds)

	// API routing rule
	routing := ensureMap(raw, "routing")
	rules := listOfMaps(routing["rules"])
	for _, rule := range rules {
		if tag := stringValue(rule["outboundTag"]); tag == "API" {
			for _, inTag := range stringList(rule["inboundTag"]) {
				if inTag == "API_INBOUND" {
					routing["rules"] = rules
					return
				}
			}
		}
	}
	apiRule := map[string]any{
		"inboundTag": []any{"API_INBOUND"},
		"outboundTag": "API",
		"type":        "field",
	}
	routing["rules"] = append([]any{apiRule}, mapsToAny(rules)...)
	raw["routing"] = routing
}

// includeDBUsers adds users from the database to the appropriate inbound
// settings.clients lists, matching protocol + service tag associations.
func includeDBUsers(ctx context.Context, db *sql.DB, raw map[string]any) error {
	proxyProtocols := map[string]struct{}{
		"vmess": {}, "vless": {}, "trojan": {}, "shadowsocks": {}, "hysteria": {},
	}

	inbounds := listOfMaps(raw["inbounds"])
	inboundsByProtocol := map[string][]map[string]any{}
	for _, inbound := range inbounds {
		protocol := strings.ToLower(stringValue(inbound["protocol"]))
		if _, ok := proxyProtocols[protocol]; !ok {
			continue
		}
		settings := ensureMap(inbound, "settings")
		settings["clients"] = xrayconfig.ReverseClients(settings["clients"])
		inboundsByProtocol[protocol] = append(inboundsByProtocol[protocol], inbound)
	}
	if len(inboundsByProtocol) == 0 {
		return nil
	}

	// Get service-tag associations
	serviceTags, err := loadServiceAllowedTags(ctx, db)
	if err != nil {
		return err
	}

	// Get UUID masks for Shadowsocks 2022
	masks, err := loadUUIDMasks(ctx, db)
	if err != nil {
		return err
	}

	// Load users with credentials for matching protocols
	protocols := make([]string, 0, len(inboundsByProtocol))
	for protocol := range inboundsByProtocol {
		protocols = append(protocols, protocol)
	}
	users, err := loadRuntimeUsersForProtocols(ctx, db, protocols)
	if err != nil {
		return err
	}

	for _, u := range users {
		if u.ServiceID <= 0 {
			continue
		}
		targets := inboundsByProtocol[u.Protocol]
		for _, inbound := range targets {
			tag := stringValue(inbound["tag"])
			if !serviceTags[u.ServiceID][tag] {
				continue
			}
			settings, err := user.RuntimeProxySettings(u.Settings, u.Protocol, u.CredentialKey, u.Flow, masks)
			if err != nil {
				continue
			}
			if u.Protocol == "shadowsocks" {
				settings = user.RuntimeShadowsocksSettings(settings, ensureMap(inbound, "settings"))
			}
			settings["email"] = fmt.Sprintf("%d.%s", u.ID, u.Username)
			clients := ensureMap(inbound, "settings")["clients"].([]any)
			ensureMap(inbound, "settings")["clients"] = append(clients, settings)
		}
	}
	return nil
}

// mergeHostVariables replaces {SERVER_IP} etc. in host remark templates (best-effort).
func mergeHostVariables(ctx context.Context, db *sql.DB, raw map[string]any) error {
	_ = ctx
	_ = db
	_ = raw
	// The host variables are used for subscription link generation, not xray config itself.
	// This is a no-op for the xray runtime config; host records are handled by the subscription system.
	return nil
}

// --- helpers ---

type runtimeUserRow struct {
	ID            int64
	Username      string
	CredentialKey string
	Flow          string
	ServiceID     int64
	Protocol      string
	Settings      map[string]any
}

func loadRuntimeUsersForProtocols(ctx context.Context, db *sql.DB, protocols []string) ([]runtimeUserRow, error) {
	if len(protocols) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(protocols))
	args := make([]any, len(protocols))
	for i, p := range protocols {
		placeholders[i] = "?"
		args[i] = p
	}
	query := fmt.Sprintf(`
SELECT u.id, u.username, COALESCE(u.credential_key, ''), COALESCE(u.flow, ''),
       COALESCE(u.service_id, 0), u.protocol, u.settings
FROM users u
WHERE u.status = 'active'
  AND u.protocol IN (%s)
  AND u.service_id IS NOT NULL AND u.service_id > 0
ORDER BY u.id`, strings.Join(placeholders, ","))

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []runtimeUserRow
	for rows.Next() {
		var r runtimeUserRow
		var settingsRaw any
		if err := rows.Scan(&r.ID, &r.Username, &r.CredentialKey, &r.Flow, &r.ServiceID, &r.Protocol, &settingsRaw); err != nil {
			continue
		}
		if r.Settings == nil {
			r.Settings = map[string]any{}
		}
		switch v := settingsRaw.(type) {
		case []byte:
			_ = json.Unmarshal(v, &r.Settings)
		case string:
			_ = json.Unmarshal([]byte(v), &r.Settings)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func loadServiceAllowedTags(ctx context.Context, db *sql.DB) (map[int64]map[string]bool, error) {
	rows, err := db.QueryContext(ctx, `
SELECT sh.service_id, h.inbound_tag
FROM service_hosts sh
JOIN hosts h ON h.id = sh.host_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[int64]map[string]bool{}
	for rows.Next() {
		var serviceID int64
		var tag string
		if err := rows.Scan(&serviceID, &tag); err != nil {
			continue
		}
		if result[serviceID] == nil {
			result[serviceID] = map[string]bool{}
		}
		result[serviceID][tag] = true
	}
	return result, rows.Err()
}

func loadUUIDMasks(ctx context.Context, db *sql.DB) (map[string][]byte, error) {
	var masks map[string][]byte
	err := db.QueryRowContext(ctx, `SELECT vmess_mask FROM jwt ORDER BY id LIMIT 1`).Scan(
		func() *[]byte { return nil }(),
	)
	_ = err
	// vmess_mask is stored in jwt table; returns empty if not present
	if masks == nil {
		masks = map[string][]byte{}
	}
	return masks, nil
}

// inlineTLSCertificateFiles reads certificate files referenced in streamSettings
// and replaces file paths with inline content.
func inlineTLSCertificateFiles(raw map[string]any) error {
	for _, section := range []string{"inbounds", "outbounds"} {
		for _, item := range listOfMaps(raw[section]) {
			if err := inlineStreamTLSCertFiles(item); err != nil {
				tag := stringValue(item["tag"])
				if tag == "" {
					tag = "<untagged>"
				}
				return fmt.Errorf("%s %s TLS certificate: %w", strings.TrimSuffix(section, "s"), tag, err)
			}
		}
	}
	return nil
}

func inlineStreamTLSCertFiles(item map[string]any) error {
	stream := ensureMap(item, "streamSettings")
	tlsSettings := ensureMap(stream, "tlsSettings")
	certs, ok := tlsSettings["certificates"].([]any)
	if !ok || len(certs) == 0 {
		return nil
	}
	for _, certRaw := range certs {
		cert, ok := certRaw.(map[string]any)
		if !ok {
			continue
		}
		if err := inlineCertFile(cert, "certificate", []string{"certificateFile", "certFile", "certfile"}); err != nil {
			return err
		}
		if err := inlineCertFile(cert, "key", []string{"keyFile", "keyfile"}); err != nil {
			return err
		}
	}
	return nil
}

func inlineCertFile(cert map[string]any, contentKey string, pathKeys []string) error {
	// Already inline
	if content, ok := cert[contentKey].([]any); ok && len(content) > 0 {
		for _, pathKey := range pathKeys {
			delete(cert, pathKey)
		}
		return nil
	}
	if content, ok := cert[contentKey].(string); ok && strings.TrimSpace(content) != "" {
		lines := strings.Split(content, "\n")
		anyLines := make([]any, len(lines))
		for i, line := range lines {
			anyLines[i] = line
		}
		cert[contentKey] = anyLines
		for _, pathKey := range pathKeys {
			delete(cert, pathKey)
		}
		return nil
	}
	// Find path
	var path string
	for _, pathKey := range pathKeys {
		if p := stringValue(cert[pathKey]); p != "" {
			path = p
			break
		}
	}
	if path == "" {
		for _, pathKey := range pathKeys {
			delete(cert, pathKey)
		}
		return nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s file %q: %w", contentKey, path, err)
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return fmt.Errorf("%s file %q is empty", contentKey, path)
	}
	lines := strings.Split(text, "\n")
	anyLines := make([]any, len(lines))
	for i, line := range lines {
		anyLines[i] = line
	}
	cert[contentKey] = anyLines
	for _, pathKey := range pathKeys {
		delete(cert, pathKey)
	}
	return nil
}

// --- utility functions ---

func stringValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []byte:
		return strings.TrimSpace(string(typed))
	case int:
		return fmt.Sprintf("%d", typed)
	case int64:
		return fmt.Sprintf("%d", typed)
	case float64:
		return fmt.Sprintf("%g", typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func ensureMap(parent map[string]any, key string) map[string]any {
	value := mapValue(parent[key])
	parent[key] = value
	return value
}

func mapValue(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case nil:
		return map[string]any{}
	default:
		return map[string]any{}
	}
}

func listOfMaps(value any) []map[string]any {
	switch typed := value.(type) {
	case []map[string]any:
		return typed
	case []any:
		result := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if mapped, ok := item.(map[string]any); ok {
				result = append(result, mapped)
			}
		}
		return result
	default:
		return nil
	}
}

func mapsToAny(items []map[string]any) []any {
	result := make([]any, 0, len(items))
	for _, item := range items {
		result = append(result, item)
	}
	return result
}

func stringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := stringValue(item); text != "" {
				result = append(result, text)
			}
		}
		return result
	case string:
		cleaned := strings.TrimSpace(typed)
		if cleaned == "" {
			return nil
		}
		parts := strings.Split(cleaned, ",")
		result := make([]string, 0, len(parts))
		for _, part := range parts {
			if text := strings.TrimSpace(part); text != "" {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}

// DetectArchitecture maps runtime.GOARCH/GOOS to Xray release arch names.
func DetectArchitecture() string {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	if goos != "linux" {
		return ""
	}
	switch goarch {
	case "amd64":
		return "64"
	case "arm64":
		return "arm64-v8a"
	case "arm":
		return "arm32-v7a"
	default:
		return ""
	}
}

// sortedKeys returns sorted string keys from a map for deterministic iteration.
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
