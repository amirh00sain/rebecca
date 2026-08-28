package api

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rebeccapanel/rebecca/internal/app/logging"
)

func (s *Server) registerLocalXrayRoutes(r chi.Router) {
	r.HandleFunc("/local/status", s.requireSudo(s.handleLocalXrayStatus))
	r.HandleFunc("/local/version", s.requireSudo(s.handleLocalXrayVersion))
	r.HandleFunc("/local/start", s.requireSudo(s.handleLocalXrayStart))
	r.HandleFunc("/local/stop", s.requireSudo(s.handleLocalXrayStop))
	r.HandleFunc("/local/restart", s.requireSudo(s.handleLocalXrayRestart))
	r.HandleFunc("/local/update", s.requireSudo(s.handleLocalXrayUpdate))
	r.HandleFunc("/local/logs", s.requireSudo(s.handleLocalXrayLogs))
}

func (s *Server) handleLocalXrayStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"installed": false,
			"running":   false,
			"error":     "local xray manager not initialized",
		})
		return
	}
	status := s.xrayManager.Status()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleLocalXrayVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{"version": ""})
		return
	}
	version, err := s.xrayManager.Version()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"version": "",
			"error":   err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"version":   version,
		"installed": s.xrayManager.IsInstalled(),
	})
}

func (s *Server) handleLocalXrayStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeError(w, http.StatusInternalServerError, "local xray manager not initialized")
		return
	}
	ctx := r.Context()
	if err := s.xrayManager.Start(ctx); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] start failed: %v", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "xray started", "status": s.xrayManager.Status()})
}

func (s *Server) handleLocalXrayStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeError(w, http.StatusInternalServerError, "local xray manager not initialized")
		return
	}
	if err := s.xrayManager.Stop(); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] stop failed: %v", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "xray stopped"})
}

func (s *Server) handleLocalXrayRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeError(w, http.StatusInternalServerError, "local xray manager not initialized")
		return
	}
	ctx := r.Context()
	// Validate new config first if requested
	if err := s.xrayManager.ApplyConfig(ctx); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] apply config failed, not restarting: %v", err)
		writeJSON(w, http.StatusOK, map[string]any{
			"message": "config validation failed",
			"error":   err.Error(),
		})
		return
	}
	if err := s.xrayManager.Restart(ctx); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] restart failed: %v", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "xray restarted", "status": s.xrayManager.Status()})
}

func (s *Server) handleLocalXrayUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeError(w, http.StatusInternalServerError, "local xray manager not initialized")
		return
	}
	ctx := r.Context()
	wasRunning := s.xrayManager.Status().Running

	if err := s.xrayManager.Update(ctx); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] update failed: %v", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	version, _ := s.xrayManager.Version()
	result := map[string]any{
		"message": "xray updated",
		"version": version,
	}

	// Auto-restart if was running before update
	if wasRunning {
		if err := s.xrayManager.Restart(ctx); err != nil {
			logging.Warnf(logging.ComponentRuntime, "[Xray] auto-restart after update failed: %v", err)
			result["restart_error"] = err.Error()
		} else {
			result["restarted"] = true
		}
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleLocalXrayLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.xrayManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{"logs": []string{}})
		return
	}
	maxLines := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		n := parseIntQueryParam(v)
		if n > 0 && n <= 10000 {
			maxLines = n
		}
	}
	logs := s.xrayManager.Logs(maxLines)
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":  logs,
		"total": len(logs),
	})
}

func parseIntQueryParam(v string) int {
	n := 0
	for _, c := range v {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		} else {
			break
		}
	}
	return n
}

// Health endpoint: /api/xray/health
func (s *Server) handleXrayManagerHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	_ = context.Background()
	if s.xrayManager == nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "degraded", "xray": "not_initialized"})
		return
	}
	status := s.xrayManager.Status()
	httpStatus := http.StatusOK
	if !status.Running {
		httpStatus = http.StatusServiceUnavailable
	}
	writeJSON(w, httpStatus, map[string]any{
		"status": func() string {
			if status.Running {
				return "healthy"
			}
			return "degraded"
		}(),
		"xray": status,
	})
}
