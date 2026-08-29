package xraymanager

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/rebeccapanel/rebecca/internal/app/logging"
	"github.com/rebeccapanel/rebecca/internal/app/outboundsub"
	"github.com/rebeccapanel/rebecca/internal/app/xrayconfig"
)

const (
	defaultDataDir        = "/var/lib/rebecca"
	defaultXrayDir        = "xray-core"
	defaultXrayBinary     = "xray"
	defaultXrayConfigName = "config.json"
	localXrayAPIPort      = 10085
	maxLogLines           = 500
	maxRestartBackoff     = 60 * time.Second
	initialRestartBackoff = 1 * time.Second
	maxConsecutiveRestarts = 10
)

// Manager is the interface exposed to the rest of the application.
type Manager interface {
	Install(ctx context.Context) error
	Update(ctx context.Context) error
	Version() (string, error)
	Start(ctx context.Context) error
	Stop() error
	Restart(ctx context.Context) error
	Status() XrayStatus
	GenerateConfig(ctx context.Context) ([]byte, error)
	ValidateConfig(ctx context.Context, config []byte) error
	ApplyConfig(ctx context.Context) error
	Logs(maxLines int) []string
	IsInstalled() bool
}

// XrayStatus represents the current state of the local Xray process.
type XrayStatus struct {
	Installed   bool   `json:"installed"`
	Version     string `json:"version,omitempty"`
	Running     bool   `json:"running"`
	PID         int    `json:"pid,omitempty"`
	Uptime      string `json:"uptime,omitempty"`
	StartedAt   string `json:"started_at,omitempty"`
	Error       string `json:"error,omitempty"`
	LastExit    string `json:"last_exit,omitempty"`
	InboundCount int  `json:"inbound_count"`
	ConfigPath  string `json:"config_path,omitempty"`
	BinaryPath  string `json:"binary_path,omitempty"`
}

// Config holds paths and settings for the XrayManager.
type Config struct {
	DataDir      string
	XrayDir      string
	XrayBinary   string
	XrayConfig   string
	XrayVersion  string
	GeoDir       string
}

// Repository abstracts database access needed by the manager.
type Repository struct {
	db      *sql.DB
	dialect string
}

// NewRepository creates a Repository backed by the given database pool.
func NewRepository(db *sql.DB, dialect string) Repository {
	return Repository{db: db, dialect: dialect}
}

// DB returns the underlying *sql.DB.
func (r Repository) DB() *sql.DB {
	return r.db
}

// GetMasterConfig reads the master Xray config from xray_config (id=1).
func (r Repository) GetMasterConfig(ctx context.Context) (map[string]any, error) {
	var raw any
	err := r.db.QueryRowContext(ctx, `SELECT data FROM xray_config WHERE id = 1 LIMIT 1`).Scan(&raw)
	if err == sql.ErrNoRows {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	return xrayconfig.NormalizePayload(jsonMap(raw)), nil
}

// SaveMasterConfig persists a master config to xray_config (id=1).
func (r Repository) SaveMasterConfig(ctx context.Context, cfg map[string]any) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	if r.dialect == "sqlite" {
		_, err = r.db.ExecContext(ctx,
			`INSERT INTO xray_config (id, data, created_at, updated_at) VALUES (1, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
			string(raw), now, now)
		return err
	}
	_, err = r.db.ExecContext(ctx,
		`INSERT INTO xray_config (id, data, created_at, updated_at) VALUES (1, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
		string(raw), now, now)
	return err
}

func jsonMap(value any) map[string]any {
	switch typed := value.(type) {
	case nil:
		return map[string]any{}
	case []byte:
		return jsonMapBytes(typed)
	case string:
		return jsonMapBytes([]byte(typed))
	default:
		raw, err := json.Marshal(typed)
		if err != nil {
			return map[string]any{}
		}
		return jsonMapBytes(raw)
	}
}

func jsonMapBytes(raw []byte) map[string]any {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return map[string]any{}
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil || result == nil {
		return map[string]any{}
	}
	return result
}

type xrayManager struct {
	cfg          Config
	repo         Repository
	outboundSubs outboundsub.Service

	mu              sync.Mutex
	installed       bool
	version         string
	process         *exec.Cmd
	cancel          context.CancelFunc
	running         bool
	pid             int
	startedAt       time.Time
	lastError       string
	lastExitMessage string
	logs            []string
	logMu           sync.RWMutex
	restartCount    int
	stopping        bool
}

// NewManager creates a new local XrayManager.
func NewManager(cfg Config, repo Repository, outboundSubs outboundsub.Service) Manager {
	if strings.TrimSpace(cfg.DataDir) == "" {
		cfg.DataDir = defaultDataDir
	}
	if strings.TrimSpace(cfg.XrayDir) == "" {
		cfg.XrayDir = filepath.Join(cfg.DataDir, defaultXrayDir)
	}
	if strings.TrimSpace(cfg.XrayBinary) == "" {
		cfg.XrayBinary = filepath.Join(cfg.XrayDir, defaultXrayBinary)
	}
	if strings.TrimSpace(cfg.XrayConfig) == "" {
		cfg.XrayConfig = filepath.Join(cfg.XrayDir, defaultXrayConfigName)
	}
	if strings.TrimSpace(cfg.GeoDir) == "" {
		cfg.GeoDir = cfg.XrayDir
	}
	m := &xrayManager{
		cfg:          cfg,
		repo:         repo,
		outboundSubs: outboundSubs,
	}
	m.installed = m.checkBinary()
	if m.installed {
		if v, err := m.readVersion(); err == nil {
			m.version = v
		}
	}
	return m
}

func (m *xrayManager) IsInstalled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.installed
}

func (m *xrayManager) Status() XrayStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	status := XrayStatus{
		Installed:  m.installed,
		Version:    m.version,
		Running:    m.running,
		PID:        m.pid,
		Error:      m.lastError,
		LastExit:   m.lastExitMessage,
		ConfigPath: m.cfg.XrayConfig,
		BinaryPath: m.cfg.XrayBinary,
	}
	if m.running && !m.startedAt.IsZero() {
		status.StartedAt = m.startedAt.UTC().Format(time.RFC3339)
		status.Uptime = time.Since(m.startedAt).Truncate(time.Second).String()
	}
	// Count inbounds in current config
	if data, err := os.ReadFile(m.cfg.XrayConfig); err == nil {
		var raw map[string]any
		if json.Unmarshal(data, &raw) == nil {
			status.InboundCount = len(listOfMaps(raw["inbounds"]))
		}
	}
	return status
}

func (m *xrayManager) Start(ctx context.Context) error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	if !m.installed {
		m.mu.Unlock()
		return fmt.Errorf("xray binary not installed at %s", m.cfg.XrayBinary)
	}
	m.stopping = false
	m.restartCount = 0
	m.mu.Unlock()

	// Ensure config exists and is valid
	if _, err := os.Stat(m.cfg.XrayConfig); os.IsNotExist(err) {
		if err := m.ApplyConfig(ctx); err != nil {
			return fmt.Errorf("generate initial config: %w", err)
		}
	}

	return m.startProcess()
}

func (m *xrayManager) startProcess() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, m.cfg.XrayBinary, "run", "-config", m.cfg.XrayConfig)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start xray process: %w", err)
	}

	m.mu.Lock()
	m.process = cmd
	m.cancel = cancel
	m.running = true
	m.pid = cmd.Process.Pid
	m.startedAt = time.Now()
	m.lastError = ""
	m.lastExitMessage = ""
	m.restartCount = 0
	m.mu.Unlock()

	logging.Infof(logging.ComponentRuntime, "[Xray] process started pid=%d", m.pid)

	// Stream logs
	go m.streamLogs("stdout", stdout)
	go m.streamLogs("stderr", stderr)

	// Wait and handle exit
	go m.waitForExit(ctx)
	return nil
}

func (m *xrayManager) waitForExit(ctx context.Context) {
	err := m.process.Wait()
	m.mu.Lock()
	m.running = false
	m.pid = 0
	exitMessage := ""
	if err != nil {
		exitMessage = err.Error()
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitMessage = fmt.Sprintf("exit code=%d", exitErr.ExitCode())
		}
		m.lastExitMessage = exitMessage
	}
	m.mu.Unlock()

	logging.Infof(logging.ComponentRuntime, "[Xray] process exited %s", exitMessage)

	// Auto-restart with backoff (unless explicitly stopped)
	m.mu.Lock()
	stopping := m.stopping
	restartCount := m.restartCount
	m.mu.Unlock()

	if stopping || ctx.Err() != nil {
		return
	}

	if restartCount < maxConsecutiveRestarts {
		backoff := initialRestartBackoff
		for i := 0; i < restartCount; i++ {
			backoff *= 2
			if backoff > maxRestartBackoff {
				backoff = maxRestartBackoff
				break
			}
		}
		logging.Infof(logging.ComponentRuntime, "[Xray] restarting in %v (attempt %d/%d)", backoff, restartCount+1, maxConsecutiveRestarts)
		time.Sleep(backoff)

		m.mu.Lock()
		m.restartCount = restartCount + 1
		m.mu.Unlock()

		if err := m.startProcess(); err != nil {
			logging.Errorf(logging.ComponentRuntime, "[Xray] restart failed: %v", err)
		}
	} else {
		logging.Errorf(logging.ComponentRuntime, "[Xray] max restart attempts reached (%d), not restarting", maxConsecutiveRestarts)
		m.mu.Lock()
		m.lastError = fmt.Sprintf("max restart attempts reached after %s", exitMessage)
		m.mu.Unlock()
	}
}

func (m *xrayManager) Stop() error {
	m.mu.Lock()
	if !m.running || m.process == nil {
		m.mu.Unlock()
		return nil
	}
	m.stopping = true
	cancel := m.cancel
	m.mu.Unlock()

	// Send SIGTERM first for graceful shutdown
	if m.process.Process != nil {
		syscall.Kill(-m.process.Process.Pid, syscall.SIGTERM)
	}

	// Wait up to 10s then SIGKILL
	done := make(chan struct{})
	go func() {
		if m.process.Process != nil {
			m.process.Process.Wait()
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		if m.process.Process != nil {
			syscall.Kill(-m.process.Process.Pid, syscall.SIGKILL)
		}
		<-done
	}

	cancel()

	m.mu.Lock()
	m.running = false
	m.pid = 0
	m.process = nil
	m.mu.Unlock()

	logging.Infof(logging.ComponentRuntime, "[Xray] process stopped")
	return nil
}

func (m *xrayManager) Restart(ctx context.Context) error {
	logging.Infof(logging.ComponentRuntime, "[Xray] restarting")
	if err := m.Stop(); err != nil {
		logging.Warnf(logging.ComponentRuntime, "[Xray] stop during restart failed: %v", err)
	}
	return m.Start(ctx)
}

func (m *xrayManager) Version() (string, error) {
	m.mu.Lock()
	if m.version != "" {
		v := m.version
		m.mu.Unlock()
		return v, nil
	}
	m.mu.Unlock()
	return m.readVersion()
}

func (m *xrayManager) readVersion() (string, error) {
	out, err := exec.Command(m.cfg.XrayBinary, "version").Output()
	if err != nil {
		return "", fmt.Errorf("run xray version: %w", err)
	}
	return parseXrayVersion(string(out)), nil
}

var xrayVersionRe = regexp.MustCompile(`Xray\s+(\d+\.\d+\.\d+)`)

func parseXrayVersion(output string) string {
	match := xrayVersionRe.FindStringSubmatch(output)
	if len(match) > 1 {
		return match[1]
	}
	// Try the short form: "Xray 26.7.11"
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Xray ") {
			return strings.TrimPrefix(line, "Xray ")
		}
	}
	return strings.TrimSpace(strings.Split(output, "\n")[0])
}

func (m *xrayManager) Logs(maxLines int) []string {
	m.logMu.RLock()
	defer m.logMu.RUnlock()
	if maxLines <= 0 || maxLines > len(m.logs) {
		maxLines = len(m.logs)
	}
	start := len(m.logs) - maxLines
	if start < 0 {
		start = 0
	}
	result := make([]string, maxLines)
	copy(result, m.logs[start:])
	return result
}

func (m *xrayManager) appendLog(line string) {
	m.logMu.Lock()
	defer m.logMu.Unlock()
	m.logs = append(m.logs, line)
	if len(m.logs) > maxLogLines {
		m.logs = m.logs[len(m.logs)-maxLogLines:]
	}
}

func (m *xrayManager) streamLogs(source string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		// Mirror to the panel log so Railway/Docker logs show Xray's real error
		// (e.g. invalid config) instead of only a generic "exit code=255".
		logging.Infof(logging.ComponentRuntime, "[Xray][%s] %s", source, line)
		m.appendLog(fmt.Sprintf("[%s] %s", source, line))
	}
}

func (m *xrayManager) checkBinary() bool {
	info, err := os.Stat(m.cfg.XrayBinary)
	if err != nil {
		return false
	}
	return info.Mode()&0111 != 0
}

func (m *xrayManager) GenerateConfig(ctx context.Context) ([]byte, error) {
	return m.BuildMasterXrayConfig(ctx)
}

func (m *xrayManager) ValidateConfig(ctx context.Context, config []byte) error {
	return m.validateConfigWithBinary(config)
}

func (m *xrayManager) ApplyConfig(ctx context.Context) error {
	config, err := m.BuildMasterXrayConfig(ctx)
	if err != nil {
		return fmt.Errorf("build config: %w", err)
	}
	// Write to temp file, then rename atomically
	tmpPath := m.cfg.XrayConfig + ".tmp"
	if err := os.MkdirAll(filepath.Dir(m.cfg.XrayConfig), 0755); err != nil {
		return fmt.Errorf("create xray config dir: %w", err)
	}
	if err := os.WriteFile(tmpPath, config, 0644); err != nil {
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := os.Rename(tmpPath, m.cfg.XrayConfig); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("apply config: %w", err)
	}
	logging.Infof(logging.ComponentRuntime, "[Xray] config applied to %s", m.cfg.XrayConfig)
	return nil
}

func (m *xrayManager) validateConfigWithBinary(config []byte) error {
	if !m.checkBinary() {
		return fmt.Errorf("xray binary not found at %s", m.cfg.XrayBinary)
	}
	tmpPath := m.cfg.XrayConfig + ".test"
	if err := os.WriteFile(tmpPath, config, 0644); err != nil {
		return fmt.Errorf("write test config: %w", err)
	}
	defer os.Remove(tmpPath)

	out, err := exec.Command(m.cfg.XrayBinary, "run", "-test", "-config", tmpPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("xray config validation failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// EnsureManagerConfigDir ensures the xray config directory exists.
func EnsureManagerConfigDir(cfg Config) error {
	dir := filepath.Dir(cfg.XrayConfig)
	return os.MkdirAll(dir, 0755)
}

// --- HTTP handler for fetching latest Xray release ---

// FetchLatestVersion fetches the latest Xray release tag from GitHub API.
func FetchLatestVersion(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/XTLS/Xray-core/releases/latest", nil)
	if err != nil {
		return "", err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err
	}
	return strings.TrimSpace(release.TagName), nil
}
