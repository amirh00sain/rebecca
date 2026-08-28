package xraymanager

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/rebeccapanel/rebecca/internal/app/logging"
)

// Install downloads and installs the Xray binary if not already present.
func (m *xrayManager) Install(ctx context.Context) error {
	m.mu.Lock()
	if m.installed {
		m.mu.Unlock()
		logging.Infof(logging.ComponentRuntime, "[Xray] binary already installed")
		return nil
	}
	m.mu.Unlock()

	version := m.cfg.XrayVersion
	if version == "" {
		latest, err := FetchLatestVersion(ctx)
		if err != nil {
			return fmt.Errorf("determine latest version: %w", err)
		}
		version = latest
	}
	return m.installVersion(ctx, version)
}

// Update installs the latest or configured Xray version.
func (m *xrayManager) Update(ctx context.Context) error {
	version := m.cfg.XrayVersion
	if version == "" {
		latest, err := FetchLatestVersion(ctx)
		if err != nil {
			return fmt.Errorf("determine latest version: %w", err)
		}
		version = latest
	}
	return m.installVersion(ctx, version)
}

func (m *xrayManager) installVersion(ctx context.Context, version string) error {
	arch := DetectArchitecture()
	if arch == "" {
		return fmt.Errorf("unsupported architecture %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	releaseTag := version
	if !strings.HasPrefix(releaseTag, "v") && releaseTag != "latest" {
		releaseTag = "v" + releaseTag
	}

	downloadURL := fmt.Sprintf("https://github.com/XTLS/Xray-core/releases/download/%s/Xray-linux-%s.zip", releaseTag, arch)
	checksumURL := fmt.Sprintf("https://github.com/XTLS/Xray-core/releases/download/%s/Xray-linux-%s.zip.sha256", releaseTag, arch)

	logging.Infof(logging.ComponentRuntime, "[Xray] downloading %s", downloadURL)

	if err := os.MkdirAll(m.cfg.XrayDir, 0755); err != nil {
		return fmt.Errorf("create xray dir: %w", err)
	}

	zipPath := filepath.Join(os.TempDir(), fmt.Sprintf("xray-%s-%s.zip", releaseTag, arch))
	if err := downloadFile(ctx, downloadURL, zipPath); err != nil {
		return fmt.Errorf("download xray: %w", err)
	}
	defer os.Remove(zipPath)

	// Verify checksum if available
	if err := verifyChecksum(ctx, checksumURL, zipPath); err != nil {
		// Non-fatal if checksum endpoint unavailable, but log it
		logging.Warnf(logging.ComponentRuntime, "[Xray] checksum verification skipped: %v", err)
	}

	tmpExtract := filepath.Join(os.TempDir(), fmt.Sprintf("xray-extract-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(tmpExtract, 0755); err != nil {
		return fmt.Errorf("create extract dir: %w", err)
	}
	defer os.RemoveAll(tmpExtract)

	if err := unzip(zipPath, tmpExtract); err != nil {
		return fmt.Errorf("extract xray: %w", err)
	}

	newBinary := filepath.Join(tmpExtract, "xray")
	if _, err := os.Stat(newBinary); err != nil {
		return fmt.Errorf("xray binary missing from archive: %w", err)
	}

	// Atomic replace of existing binary
	if _, err := os.Stat(m.cfg.XrayBinary); err == nil {
		backup := m.cfg.XrayBinary + ".bak"
		os.Remove(backup)
		if err := os.Rename(m.cfg.XrayBinary, backup); err != nil {
			return fmt.Errorf("backup existing xray: %w", err)
		}
	}

	if err := copyFile(newBinary, m.cfg.XrayBinary); err != nil {
		return fmt.Errorf("install xray binary: %w", err)
	}
	if err := os.Chmod(m.cfg.XrayBinary, 0755); err != nil {
		return fmt.Errorf("chmod xray binary: %w", err)
	}

	// Copy geo files
	for _, geo := range []string{"geoip.dat", "geosite.dat"} {
		src := filepath.Join(tmpExtract, geo)
		if _, err := os.Stat(src); err == nil {
			dst := filepath.Join(m.cfg.GeoDir, geo)
			if err := copyFile(src, dst); err == nil {
				_ = os.Chmod(dst, 0644)
			}
		}
	}

	// Reload state
	m.mu.Lock()
	m.installed = true
	m.version = strings.TrimPrefix(releaseTag, "v")
	m.mu.Unlock()

	logging.Infof(logging.ComponentRuntime, "[Xray] installed version %s at %s", m.version, m.cfg.XrayBinary)
	return nil
}

func downloadFile(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func verifyChecksum(ctx context.Context, url, zipPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("checksum endpoint returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	expected := strings.Fields(strings.TrimSpace(string(body)))
	if len(expected) == 0 {
		return fmt.Errorf("empty checksum")
	}
	expectedSum := strings.ToLower(expected[0])

	f, err := os.Open(zipPath)
	if err != nil {
		return err
	}
	defer f.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return err
	}
	actual := hex.EncodeToString(hasher.Sum(nil))
	if actual != expectedSum {
		return fmt.Errorf("checksum mismatch: expected %s got %s", expectedSum, actual)
	}
	return nil
}

func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, file := range r.File {
		fpath := filepath.Join(dest, file.Name)
		if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) && fpath != dest {
			return fmt.Errorf("illegal file path in zip: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(fpath, file.Mode()); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return err
		}
		rc, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// IsExecutable reports whether the path is an executable file.
func IsExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.Mode()&0111 != 0
}

// BinaryExists checks for an xray binary at the given path or in PATH.
func BinaryExists(path string) bool {
	if IsExecutable(path) {
		return true
	}
	if _, err := exec.LookPath("xray"); err == nil {
		return true
	}
	return false
}
