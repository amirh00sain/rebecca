package xraymanager

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rebeccapanel/rebecca/internal/app/outboundsub"
)

func TestNewManager_DefaultPaths(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp}
	repo := Repository{}

	m := NewManager(cfg, repo, outboundsub.Service{}).(*xrayManager)

	if m.cfg.XrayDir != filepath.Join(tmp, "xray-core") {
		t.Errorf("XrayDir = %q, want %q", m.cfg.XrayDir, filepath.Join(tmp, "xray-core"))
	}
	if m.cfg.XrayBinary != filepath.Join(tmp, "xray-core", "xray") {
		t.Errorf("XrayBinary = %q, want %q", m.cfg.XrayBinary, filepath.Join(tmp, "xray-core", "xray"))
	}
	if m.cfg.XrayConfig != filepath.Join(tmp, "xray-core", "config.json") {
		t.Errorf("XrayConfig = %q, want %q", m.cfg.XrayConfig, filepath.Join(tmp, "xray-core", "config.json"))
	}
}

func TestNewManager_ExplicitPaths(t *testing.T) {
	cfg := Config{
		DataDir:    "/data",
		XrayDir:    "/custom/dir",
		XrayBinary: "/custom/dir/xray-bin",
		XrayConfig: "/custom/dir/config.json",
		GeoDir:     "/custom/geo",
	}

	m := NewManager(cfg, Repository{}, outboundsub.Service{}).(*xrayManager)

	if m.cfg.XrayDir != "/custom/dir" {
		t.Errorf("XrayDir = %q, want /custom/dir", m.cfg.XrayDir)
	}
	if m.cfg.XrayBinary != "/custom/dir/xray-bin" {
		t.Errorf("XrayBinary = %q", m.cfg.XrayBinary)
	}
	if m.cfg.GeoDir != "/custom/geo" {
		t.Errorf("GeoDir = %q, want /custom/geo", m.cfg.GeoDir)
	}
}

func TestStatus_NotInstalled(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "nonexistent-xray")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	status := m.Status()
	if status.Installed {
		t.Error("expected Installed=false when binary does not exist")
	}
	if status.Running {
		t.Error("expected Running=false initially")
	}
}

func TestIsInstalled_False(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "nonexistent-xray")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	if m.IsInstalled() {
		t.Error("expected IsInstalled()=false when binary does not exist")
	}
}

func TestIsInstalled_True(t *testing.T) {
	tmp := t.TempDir()
	binPath := filepath.Join(tmp, "xray")
	if err := os.WriteFile(binPath, []byte("#!/bin/sh\necho test"), 0755); err != nil {
		t.Fatal(err)
	}
	cfg := Config{DataDir: tmp, XrayBinary: binPath}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	if !m.IsInstalled() {
		t.Error("expected IsInstalled()=true when binary exists and is executable")
	}
}

func TestLogs_Empty(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "xray")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	logs := m.Logs(100)
	if len(logs) != 0 {
		t.Errorf("expected 0 log lines, got %d", len(logs))
	}
}

func TestLogs_AppendAndTrim(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "xray")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{}).(*xrayManager)

	// Add maxLogLines + 10 lines
	for i := 0; i < maxLogLines+10; i++ {
		m.appendLog("line")
	}

	if len(m.logs) != maxLogLines {
		t.Errorf("expected %d log lines after overflow, got %d", maxLogLines, len(m.logs))
	}

	logs := m.Logs(5)
	if len(logs) != 5 {
		t.Errorf("expected 5 log lines, got %d", len(logs))
	}
}

func TestParseXrayVersion(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Xray 26.7.11 (Xray, Penetrates Everything.)", "26.7.11"},
		{"Xray 1.8.24\nFeature: something", "1.8.24"},
		{"random output", "random output"},
		{"", ""},
	}
	for _, tt := range tests {
		got := parseXrayVersion(tt.input)
		if got != tt.want {
			t.Errorf("parseXrayVersion(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestDetectArchitecture(t *testing.T) {
	arch := DetectArchitecture()
	// On test machine, just ensure it returns a non-empty string for linux
	// or empty for non-linux
	if arch == "" {
		t.Skip("non-linux or unsupported arch, skipping")
	}
	valid := map[string]bool{"64": true, "arm64-v8a": true, "arm32-v7a": true}
	if !valid[arch] {
		t.Errorf("unexpected arch value: %q", arch)
	}
}

func TestStop_AlreadyStopped(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "xray")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	// Stop on a non-running manager should be a no-op
	if err := m.Stop(); err != nil {
		t.Errorf("Stop() on non-running manager returned error: %v", err)
	}
}

func TestStart_BinaryNotInstalled(t *testing.T) {
	tmp := t.TempDir()
	cfg := Config{DataDir: tmp, XrayBinary: filepath.Join(tmp, "nonexistent")}
	m := NewManager(cfg, Repository{}, outboundsub.Service{})

	err := m.Start(t.Context())
	if err == nil {
		t.Error("expected error when starting with non-existent binary")
	}
}
