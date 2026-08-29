package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/rebeccapanel/rebecca/internal/app/logging"
	"github.com/rebeccapanel/rebecca/internal/app/xrayconfig"
)

func (s *Server) handleInboundsRootEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.requireAdmin(s.handleInboundsRoot)(w, r)
		return
	}
	s.requireSudo(s.handleInboundsRoot)(w, r)
}

func (s *Server) handleInboundsRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/inbounds" && r.URL.Path != "/inbounds" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		grouped, err := s.configRepo.GroupedInbounds(r.Context())
		if err != nil {
			writeInboundError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, grouped)
	case http.MethodPost:
		var payload map[string]any
		if err := decodeOptionalJSON(r, &payload); err != nil || payload == nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		result, err := s.configRepo.CreateInbound(r.Context(), payload)
		if err != nil {
			writeInboundError(w, err)
			return
		}
		// Reload local Xray so the new inbound's port is actually listened on.
		go s.applyLocalXrayConfig()
		writeJSON(w, http.StatusOK, result.Inbound)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleInboundsFull(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/inbounds/full" && r.URL.Path != "/inbounds/full" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	inbounds, err := s.configRepo.FullInbounds(r.Context())
	if err != nil {
		writeInboundError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, inbounds)
}

func (s *Server) handleInboundPath(w http.ResponseWriter, r *http.Request) {
	tag, ok := parseInboundTagPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		inbound, err := s.configRepo.GetInbound(r.Context(), tag)
		if err != nil {
			writeInboundError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, inbound)
	case http.MethodPut:
		var payload map[string]any
		if err := decodeOptionalJSON(r, &payload); err != nil || payload == nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		result, err := s.configRepo.UpdateInbound(r.Context(), tag, payload)
		if err != nil {
			writeInboundError(w, err)
			return
		}
		// Reload local Xray so port/protocol changes take effect.
		go s.applyLocalXrayConfig()
		writeJSON(w, http.StatusOK, result.Inbound)
	case http.MethodDelete:
		result, err := s.configRepo.DeleteInbound(r.Context(), tag)
		if err != nil {
			writeInboundError(w, err)
			return
		}
		// Reload local Xray so the removed inbound's port is released.
		go s.applyLocalXrayConfig()
		writeJSON(w, http.StatusOK, map[string]any{"detail": result.Detail})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// applyLocalXrayConfig regenerates the Xray config.json, then starts or
// restarts the local Xray process so the mutation takes effect. This is a
// best-effort side effect: failure is logged but never returned to the caller
// (the DB commit is the authoritative write).
func (s *Server) applyLocalXrayConfig() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	mgr := s.xrayManager
	if mgr == nil || !mgr.IsInstalled() {
		logging.Infof(logging.ComponentRuntime, "[Xray] not installed; skipping config apply after inbound mutation")
		return
	}
	if err := mgr.ApplyConfig(ctx); err != nil {
		logging.Errorf(logging.ComponentRuntime, "[Xray] config apply failed after inbound mutation: %v", err)
		return
	}
	status := mgr.Status()
	if status.Running {
		if err := mgr.Restart(ctx); err != nil {
			logging.Errorf(logging.ComponentRuntime, "[Xray] restart failed after inbound mutation: %v", err)
		}
	} else {
		// Xray hasn't been started yet (or crashed too many times) — start it now.
		if err := mgr.Start(ctx); err != nil {
			logging.Errorf(logging.ComponentRuntime, "[Xray] start failed after inbound mutation: %v", err)
		}
	}
}

func parseInboundTagPath(path string) (string, bool) {
	var rest string
	switch {
	case strings.HasPrefix(path, "/api/inbounds/"):
		rest = strings.TrimPrefix(path, "/api/inbounds/")
	case strings.HasPrefix(path, "/inbounds/"):
		rest = strings.TrimPrefix(path, "/inbounds/")
	default:
		return "", false
	}
	rest = strings.Trim(rest, "/")
	if rest == "" || strings.Contains(rest, "/") || rest == "full" {
		return "", false
	}
	tag, err := url.PathUnescape(rest)
	if err != nil || strings.TrimSpace(tag) == "" {
		return "", false
	}
	return tag, true
}

func writeInboundError(w http.ResponseWriter, err error) {
	detail := err.Error()
	lowered := strings.ToLower(detail)
	var syntaxErr *json.SyntaxError
	switch {
	case errors.As(err, &syntaxErr):
		writeError(w, http.StatusBadRequest, detail)
	case errors.Is(err, xrayconfig.ErrInboundNotFound):
		writeError(w, http.StatusNotFound, "Inbound not found")
	case errors.Is(err, xrayconfig.ErrDuplicateInboundTag), errors.Is(err, xrayconfig.ErrDuplicateInboundPort), errors.Is(err, xrayconfig.ErrReservedInboundTag), errors.Is(err, xrayconfig.ErrInvalidInbound):
		writeError(w, http.StatusBadRequest, detail)
	case strings.Contains(lowered, "invalid inbound"), strings.Contains(lowered, "xpaddingbytes"), strings.Contains(lowered, "realitysettings"), strings.Contains(lowered, "port must"):
		writeError(w, http.StatusBadRequest, detail)
	case strings.Contains(lowered, "invalid xray config target"), strings.Contains(lowered, "invalid target"):
		writeError(w, http.StatusBadRequest, detail)
	case strings.Contains(lowered, "node not found"):
		writeError(w, http.StatusNotFound, "Node not found")
	default:
		writeError(w, http.StatusInternalServerError, detail)
	}
}
