package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	systemapp "github.com/rebeccapanel/rebecca/internal/app/system"
	"golang.org/x/net/websocket"
)

func (s *Server) handleMaintenanceInfo(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/maintenance/info" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	info, err := s.maintenanceService().Info(ctx)
	if err != nil {
		writeMaintenanceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleMaintenanceUpdate(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/maintenance/update" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var payload systemapp.MaintenanceUpdateRequest
	if err := decodeOptionalJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	status, err := s.maintenanceService().Update(r.Context(), payload)
	if err != nil {
		writeMaintenanceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "accepted", "operation": status})
}

func (s *Server) handleMaintenanceRestart(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/maintenance/restart" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	status, err := s.maintenanceService().Restart(r.Context())
	if err != nil {
		writeMaintenanceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "accepted", "operation": status})
}

func (s *Server) handleMaintenanceSoftReload(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/maintenance/soft-reload" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	status, err := s.maintenanceService().SoftReload(r.Context())
	if err != nil {
		writeMaintenanceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"message":   "Panel soft reload scheduled successfully",
		"operation": status,
	})
}

func (s *Server) handleMaintenanceStatus(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/maintenance/status" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		s.handleMaintenanceStatusWebSocket(w, r)
		return
	}
	writeJSON(w, http.StatusOK, s.maintenanceService().Status())
}

func (s *Server) handleMaintenanceStatusWebSocket(w http.ResponseWriter, r *http.Request) {
	operationID := strings.TrimSpace(r.URL.Query().Get("id"))
	websocket.Handler(func(conn *websocket.Conn) {
		defer conn.Close()
		updates, unsubscribe := s.maintenanceService().Subscribe()
		defer unsubscribe()
		for {
			select {
			case <-r.Context().Done():
				return
			case status, ok := <-updates:
				if !ok {
					return
				}
				if operationID != "" && status.ID != operationID {
					continue
				}
				if err := websocket.JSON.Send(conn, status); err != nil {
					return
				}
			}
		}
	}).ServeHTTP(w, r)
}

func (s *Server) maintenanceService() *systemapp.MaintenanceService {
	if s.maintenance == nil {
		s.maintenance = systemapp.NewMaintenanceService()
	}
	return s.maintenance
}

func writeMaintenanceError(w http.ResponseWriter, err error) {
	status, detail := systemapp.HTTPStatus(err)
	writeError(w, status, detail)
}
