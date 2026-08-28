package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/rebeccapanel/rebecca/internal/app/nodecontroller"
)

const psiphonProxyBatchLimit = 20

type psiphonProxyProfile struct {
	Location string
	Port     uint32
	Tag      string
}

func (s *Server) handlePsiphonLocations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	payload, nodeID, ok := proxyNodePayload(w, r, "Psiphon")
	if !ok {
		return
	}
	config := strings.TrimSpace(stringFromAny(payload["config"]))
	if !validPsiphonConfig(config) {
		writeError(w, http.StatusBadRequest, "Psiphon config must be a JSON object")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	result, err := s.nodeController.ConfigurePsiphon(ctx, nodecontroller.Request{
		NodeID:            nodeID,
		PsiphonAction:     "locations",
		PsiphonConfigJSON: config,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"obj":     map[string]any{"locations": result.Locations},
	})
}

func (s *Server) handlePsiphonSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	payload, nodeID, ok := proxyNodePayload(w, r, "Psiphon")
	if !ok {
		return
	}
	config := strings.TrimSpace(stringFromAny(payload["config"]))
	if !validPsiphonConfig(config) {
		writeError(w, http.StatusBadRequest, "Psiphon config must be a JSON object")
		return
	}
	profiles, err := psiphonProfilesFromPayload(payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	configTarget := fmt.Sprintf("node:%d", nodeID)
	targetConfig, err := s.configRepo.GetTargetRawConfig(r.Context(), configTarget)
	if err != nil {
		writeConfigError(w, err)
		return
	}
	if duplicateTag := duplicatePsiphonOutboundTag(targetConfig, profiles); duplicateTag != "" {
		writeError(w, http.StatusConflict, fmt.Sprintf("outbound tag already exists: %s", duplicateTag))
		return
	}
	locations := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		locations = append(locations, profile.Location)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Minute)
	defer cancel()
	result, err := s.nodeController.ConfigurePsiphon(ctx, nodecontroller.Request{
		NodeID:            nodeID,
		PsiphonConfigJSON: config,
		PsiphonLocations:  locations,
		PsiphonSocksPort:  profiles[0].Port,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if len(result.Instances) != len(profiles) {
		writeError(w, http.StatusBadGateway, "Psiphon node returned incomplete proxy setup")
		return
	}
	outbounds := make([]map[string]any, 0, len(profiles))
	for _, profile := range profiles {
		outbounds = append(outbounds, psiphonOutbound(profile))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"obj": map[string]any{
			"message":   fmt.Sprintf("%d Psiphon outbound(s) are ready", len(outbounds)),
			"outbound":  outbounds[0],
			"outbounds": outbounds,
		},
	})
}

func validPsiphonConfig(value string) bool {
	if len(value) == 0 || len(value) > 1<<20 {
		return false
	}
	var config map[string]any
	return json.Unmarshal([]byte(value), &config) == nil && config != nil
}

func psiphonProfilesFromPayload(payload map[string]any) ([]psiphonProxyProfile, error) {
	locations, err := psiphonLocationsFromPayload(payload["locations"])
	if err != nil {
		return nil, err
	}
	if len(locations) > psiphonProxyBatchLimit {
		return nil, fmt.Errorf("at most %d Psiphon locations can be configured at once", psiphonProxyBatchLimit)
	}
	startPort, err := uint32FromAny(payload["port"])
	if err != nil || startPort < 1024 || uint64(startPort)+uint64(len(locations))-1 > 65535 {
		return nil, fmt.Errorf("port range must stay between 1024 and 65535")
	}
	tagPrefix := strings.TrimSpace(stringFromAny(payload["tag"]))
	if tagPrefix == "" {
		tagPrefix = "psiphon"
	}
	if !windscribeTagPattern.MatchString(tagPrefix) {
		return nil, fmt.Errorf("Psiphon tag may only contain letters, numbers, dots, underscores, and hyphens")
	}
	profiles := make([]psiphonProxyProfile, 0, len(locations))
	for index, location := range locations {
		profiles = append(profiles, psiphonProxyProfile{
			Location: location,
			Port:     startPort + uint32(index),
			Tag:      tagPrefix + "-" + location,
		})
	}
	return profiles, nil
}

func psiphonLocationsFromPayload(value any) ([]string, error) {
	items := make([]string, 0)
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			items = append(items, splitPsiphonLocations(stringFromAny(item))...)
		}
	case []string:
		for _, item := range typed {
			items = append(items, splitPsiphonLocations(item)...)
		}
	default:
		items = append(items, splitPsiphonLocations(stringFromAny(typed))...)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("at least one Psiphon location is required")
	}
	seen := make(map[string]struct{}, len(items))
	for index, item := range items {
		location := strings.ToLower(strings.TrimSpace(item))
		if !torCountryPattern.MatchString(location) {
			return nil, fmt.Errorf("location %q must be a two-letter ISO code", item)
		}
		if _, exists := seen[location]; exists {
			return nil, fmt.Errorf("location %q is duplicated", location)
		}
		seen[location] = struct{}{}
		items[index] = location
	}
	return items, nil
}

func splitPsiphonLocations(value string) []string {
	return strings.FieldsFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || r == ',' || r == ';'
	})
}

func duplicatePsiphonOutboundTag(config map[string]any, profiles []psiphonProxyProfile) string {
	existingTags := make(map[string]struct{})
	for _, outbound := range outboundMaps(config["outbounds"]) {
		existingTags[strings.TrimSpace(stringFromAny(outbound["tag"]))] = struct{}{}
	}
	for _, profile := range profiles {
		if _, exists := existingTags[profile.Tag]; exists {
			return profile.Tag
		}
	}
	return ""
}

func psiphonOutbound(profile psiphonProxyProfile) map[string]any {
	return map[string]any{
		"tag":      profile.Tag,
		"protocol": "socks",
		"settings": map[string]any{
			"servers": []map[string]any{{
				"address": "127.0.0.1",
				"port":    profile.Port,
				"users":   []any{},
			}},
		},
	}
}
