package xrayconfig

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// ConfigPatch is a compact, three-way rollback description for one stored
// Xray configuration. It contains only the paths changed by an action, never
// a full before/after config snapshot.
type ConfigPatch struct {
	Version  int                    `json:"version"`
	TargetID string                 `json:"target_id"`
	Before   ConfigPatchTargetState `json:"before"`
	After    ConfigPatchTargetState `json:"after"`
	Changes  []ConfigPatchChange    `json:"changes"`
}

type ConfigPatchTargetState struct {
	Mode            string `json:"mode"`
	HasStoredConfig bool   `json:"has_stored_config"`
}

// ConfigPatchChange records one JSON path. BeforeExists/AfterExists preserve
// the difference between a missing field and an explicit JSON null value.
// Kind is "value" unless it describes the order of a tag-keyed Xray array.
type ConfigPatchChange struct {
	Path         string `json:"path"`
	Kind         string `json:"kind,omitempty"`
	Before       any    `json:"before,omitempty"`
	After        any    `json:"after,omitempty"`
	BeforeExists bool   `json:"before_exists"`
	AfterExists  bool   `json:"after_exists"`
}

// RollbackConflictError names the exact config paths which changed after the
// action being rolled back. The caller can present these paths to the user
// instead of risking an overwrite.
type RollbackConflictError struct {
	Paths []string
}

func (e *RollbackConflictError) Error() string {
	if e == nil || len(e.Paths) == 0 {
		return ErrRollbackConflict.Error()
	}
	return fmt.Sprintf("%s at %s", ErrRollbackConflict, strings.Join(e.Paths, ", "))
}

func (e *RollbackConflictError) Is(target error) bool {
	return target == ErrRollbackConflict
}

// RollbackValidationError means a partial rollback was safe to merge, but the
// resulting Xray config would not be valid. Its transaction is rolled back.
type RollbackValidationError struct {
	Err error
}

func (e *RollbackValidationError) Error() string {
	if e == nil || e.Err == nil {
		return "partial rollback would leave Xray config invalid"
	}
	return "partial rollback would leave Xray config invalid: " + e.Err.Error()
}

func (e *RollbackValidationError) Unwrap() error { return e.Err }

func BuildConfigPatches(before, after []TargetState) ([]ConfigPatch, error) {
	beforeByTarget := make(map[string]TargetState, len(before))
	afterByTarget := make(map[string]TargetState, len(after))
	for _, state := range before {
		beforeByTarget[state.TargetID] = state
	}
	for _, state := range after {
		afterByTarget[state.TargetID] = state
	}
	targets := make([]string, 0, len(beforeByTarget)+len(afterByTarget))
	seen := map[string]bool{}
	for target := range beforeByTarget {
		seen[target] = true
		targets = append(targets, target)
	}
	for target := range afterByTarget {
		if !seen[target] {
			targets = append(targets, target)
		}
	}
	sort.Strings(targets)

	patches := make([]ConfigPatch, 0, len(targets))
	for _, target := range targets {
		patch, err := BuildConfigPatch(target, beforeByTarget[target], afterByTarget[target])
		if err != nil {
			return nil, err
		}
		if !patch.Empty() {
			patches = append(patches, patch)
		}
	}
	return patches, nil
}

func BuildConfigPatch(targetID string, before, after TargetState) (ConfigPatch, error) {
	if strings.TrimSpace(targetID) == "" {
		return ConfigPatch{}, errors.New("Xray config patch target is required")
	}
	patch := ConfigPatch{
		Version:  1,
		TargetID: targetID,
		Before: ConfigPatchTargetState{
			Mode:            normalizeConfigMode(before.Mode),
			HasStoredConfig: before.HasStoredConfig,
		},
		After: ConfigPatchTargetState{
			Mode:            normalizeConfigMode(after.Mode),
			HasStoredConfig: after.HasStoredConfig,
		},
	}
	beforeConfig := any(nil)
	afterConfig := any(nil)
	if before.HasStoredConfig {
		beforeConfig = before.StoredConfig
	}
	if after.HasStoredConfig {
		afterConfig = after.StoredConfig
	}
	diffConfigPatchValue("", beforeConfig, before.HasStoredConfig, afterConfig, after.HasStoredConfig, &patch.Changes)
	return patch, nil
}

func (p ConfigPatch) Empty() bool {
	return p.Before == p.After && len(p.Changes) == 0
}

func (p ConfigPatch) Valid() bool {
	return p.Version == 1 && strings.TrimSpace(p.TargetID) != ""
}

// ApplyConfigPatch reverts only values still equal to the action's "after"
// value. Changes at any other path are preserved. A later change to the same
// value is reported as a conflict rather than overwritten.
func ApplyConfigPatch(current TargetState, patch ConfigPatch) (TargetState, error) {
	if !patch.Valid() {
		return TargetState{}, errors.New("unsupported Xray config patch")
	}
	if normalizeConfigMode(current.Mode) != patch.After.Mode || current.HasStoredConfig != patch.After.HasStoredConfig {
		return TargetState{}, &RollbackConflictError{Paths: []string{"/@target-mode"}}
	}

	root := map[string]any{}
	if current.HasStoredConfig {
		cloned, err := cloneConfigMap(current.StoredConfig)
		if err != nil {
			return TargetState{}, err
		}
		root = cloned
	}
	changes := append([]ConfigPatchChange(nil), patch.Changes...)
	sort.SliceStable(changes, func(i, j int) bool {
		return changes[i].Kind != "keyed_order" && changes[j].Kind == "keyed_order"
	})
	for _, change := range changes {
		if change.Kind == "keyed_order" {
			if err := rollbackKeyedArrayOrder(root, change); err != nil {
				return TargetState{}, err
			}
			continue
		}
		if err := rollbackConfigValue(root, change); err != nil {
			return TargetState{}, err
		}
	}

	result := TargetState{
		TargetID:        patch.TargetID,
		Mode:            patch.Before.Mode,
		HasStoredConfig: patch.Before.HasStoredConfig,
	}
	if result.HasStoredConfig {
		result.StoredConfig = NormalizePayload(root)
	}
	return result, nil
}

func diffConfigPatchValue(path string, before any, beforeExists bool, after any, afterExists bool, changes *[]ConfigPatchChange) {
	if !beforeExists || !afterExists {
		appendConfigPatchChange(changes, path, "", before, beforeExists, after, afterExists)
		return
	}
	if configValueEqual(before, after) {
		return
	}
	beforeMap, beforeIsMap := before.(map[string]any)
	afterMap, afterIsMap := after.(map[string]any)
	if beforeIsMap && afterIsMap {
		keys := map[string]bool{}
		for key := range beforeMap {
			keys[key] = true
		}
		for key := range afterMap {
			keys[key] = true
		}
		ordered := make([]string, 0, len(keys))
		for key := range keys {
			ordered = append(ordered, key)
		}
		sort.Strings(ordered)
		for _, key := range ordered {
			beforeValue, hasBefore := beforeMap[key]
			afterValue, hasAfter := afterMap[key]
			diffConfigPatchValue(configPathJoin(path, key), beforeValue, hasBefore, afterValue, hasAfter, changes)
		}
		return
	}
	beforeArray, beforeIsArray := before.([]any)
	afterArray, afterIsArray := after.([]any)
	if beforeIsArray && afterIsArray {
		if beforeTags, beforeByTag, ok := taggedConfigArray(beforeArray); ok {
			if afterTags, afterByTag, afterOK := taggedConfigArray(afterArray); afterOK {
				diffTaggedConfigArray(path, beforeTags, beforeByTag, afterTags, afterByTag, changes)
				return
			}
		}
		if len(beforeArray) == len(afterArray) {
			for index := range beforeArray {
				diffConfigPatchValue(configPathJoin(path, strconv.Itoa(index)), beforeArray[index], true, afterArray[index], true, changes)
			}
			return
		}
	}
	appendConfigPatchChange(changes, path, "", before, true, after, true)
}

func diffTaggedConfigArray(path string, beforeTags []string, beforeByTag map[string]any, afterTags []string, afterByTag map[string]any, changes *[]ConfigPatchChange) {
	all := map[string]bool{}
	for _, tag := range beforeTags {
		all[tag] = true
	}
	for _, tag := range afterTags {
		all[tag] = true
	}
	ordered := make([]string, 0, len(all))
	for tag := range all {
		ordered = append(ordered, tag)
	}
	sort.Strings(ordered)
	for _, tag := range ordered {
		beforeValue, hasBefore := beforeByTag[tag]
		afterValue, hasAfter := afterByTag[tag]
		diffConfigPatchValue(configPathJoin(path, "@tag="+tag), beforeValue, hasBefore, afterValue, hasAfter, changes)
	}
	if !stringSlicesEqual(beforeTags, afterTags) {
		appendConfigPatchChange(changes, path, "keyed_order", beforeTags, true, afterTags, true)
	}
}

func appendConfigPatchChange(changes *[]ConfigPatchChange, path string, kind string, before any, beforeExists bool, after any, afterExists bool) {
	beforeCopy, _ := cloneConfigValue(before)
	afterCopy, _ := cloneConfigValue(after)
	*changes = append(*changes, ConfigPatchChange{
		Path: path, Kind: kind, Before: beforeCopy, After: afterCopy, BeforeExists: beforeExists, AfterExists: afterExists,
	})
}

func rollbackConfigValue(root map[string]any, change ConfigPatchChange) error {
	current, exists, err := configPathValue(root, change.Path)
	if err != nil {
		return err
	}
	if configPatchValueMatches(current, exists, change.After, change.AfterExists) {
		return setConfigPathValue(root, change.Path, change.Before, change.BeforeExists)
	}
	if configPatchValueMatches(current, exists, change.Before, change.BeforeExists) {
		return nil
	}
	return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path)}}
}

func rollbackKeyedArrayOrder(root map[string]any, change ConfigPatchChange) error {
	before, beforeOK := stringSlice(change.Before)
	after, afterOK := stringSlice(change.After)
	if !beforeOK || !afterOK {
		return errors.New("invalid keyed Xray config array order patch")
	}
	current, exists, err := configPathValue(root, change.Path)
	if err != nil {
		return err
	}
	array, ok := current.([]any)
	if !exists || !ok {
		return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path) + "/@order"}}
	}
	_, byTag, tagged := taggedConfigArray(array)
	if !tagged {
		return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path) + "/@order"}}
	}
	known := make(map[string]bool, len(before)+len(after))
	for _, tag := range before {
		known[tag] = true
	}
	for _, tag := range after {
		known[tag] = true
	}
	actualOrder := filterKnownTags(tagsFromConfigArray(array), known)
	expectedAfter := filterExistingTags(after, byTag)
	if !stringSlicesEqual(actualOrder, expectedAfter) {
		return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path) + "/@order"}}
	}
	restoredOrder := filterExistingTags(before, byTag)
	values := make([]any, 0, len(restoredOrder))
	for _, tag := range restoredOrder {
		values = append(values, byTag[tag])
	}
	valueIndex := 0
	for index, item := range array {
		mapped, _ := item.(map[string]any)
		if !known[stringValue(mapped["tag"])] {
			continue
		}
		if valueIndex >= len(values) {
			return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path) + "/@order"}}
		}
		array[index] = values[valueIndex]
		valueIndex++
	}
	if valueIndex != len(values) {
		return &RollbackConflictError{Paths: []string{displayConfigPath(change.Path) + "/@order"}}
	}
	return setConfigPathValue(root, change.Path, array, true)
}

func configPathValue(root map[string]any, path string) (any, bool, error) {
	if path == "" || path == "/" {
		return root, true, nil
	}
	var current any = root
	for _, part := range configPathParts(path) {
		switch typed := current.(type) {
		case map[string]any:
			value, ok := typed[part]
			if !ok {
				return nil, false, nil
			}
			current = value
		case []any:
			if strings.HasPrefix(part, "@tag=") {
				index := taggedArrayIndex(typed, strings.TrimPrefix(part, "@tag="))
				if index < 0 {
					return nil, false, nil
				}
				current = typed[index]
				continue
			}
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, false, nil
			}
			current = typed[index]
		default:
			return nil, false, fmt.Errorf("invalid Xray config patch path %q", path)
		}
	}
	return current, true, nil
}

// ConfigPathValue returns a value from a config patch path without exposing
// the patch implementation to callers that only need to render it.
func ConfigPathValue(root map[string]any, path string) (any, bool, error) {
	return configPathValue(root, path)
}

func setConfigPathValue(root map[string]any, path string, value any, exists bool) error {
	parts := configPathParts(path)
	if len(parts) == 0 {
		return errors.New("cannot replace the Xray config root")
	}
	var parent any = root
	for _, part := range parts[:len(parts)-1] {
		switch typed := parent.(type) {
		case map[string]any:
			child, ok := typed[part]
			if !ok {
				return fmt.Errorf("missing Xray config patch parent %q", path)
			}
			parent = child
		case []any:
			if strings.HasPrefix(part, "@tag=") {
				index := taggedArrayIndex(typed, strings.TrimPrefix(part, "@tag="))
				if index < 0 {
					return fmt.Errorf("missing Xray config patch parent %q", path)
				}
				parent = typed[index]
				continue
			}
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(typed) {
				return fmt.Errorf("missing Xray config patch parent %q", path)
			}
			parent = typed[index]
		default:
			return fmt.Errorf("invalid Xray config patch parent %q", path)
		}
	}
	last := parts[len(parts)-1]
	cloned, err := cloneConfigValue(value)
	if err != nil {
		return err
	}
	switch typed := parent.(type) {
	case map[string]any:
		if exists {
			typed[last] = cloned
		} else {
			delete(typed, last)
		}
		return nil
	case []any:
		if strings.HasPrefix(last, "@tag=") {
			tag := strings.TrimPrefix(last, "@tag=")
			index := taggedArrayIndex(typed, tag)
			if exists {
				mapped, ok := cloned.(map[string]any)
				if !ok || stringValue(mapped["tag"]) != tag {
					return fmt.Errorf("invalid tagged Xray config patch value for %q", last)
				}
				if index < 0 {
					typed = append(typed, mapped)
				} else {
					typed[index] = mapped
				}
			} else if index >= 0 {
				typed = append(typed[:index], typed[index+1:]...)
			}
			return replaceConfigArrayParent(root, parts[:len(parts)-1], typed)
		}
		index, parseErr := strconv.Atoi(last)
		if parseErr != nil || index < 0 || index >= len(typed) || !exists {
			return fmt.Errorf("invalid indexed Xray config patch path %q", path)
		}
		typed[index] = cloned
		return nil
	default:
		return fmt.Errorf("invalid Xray config patch parent %q", path)
	}
}

func replaceConfigArrayParent(root map[string]any, path []string, replacement []any) error {
	if len(path) == 0 {
		return errors.New("cannot replace the Xray config root array")
	}
	var parent any = root
	for _, part := range path[:len(path)-1] {
		switch typed := parent.(type) {
		case map[string]any:
			parent = typed[part]
		case []any:
			index := taggedArrayIndex(typed, strings.TrimPrefix(part, "@tag="))
			if index < 0 {
				return errors.New("missing tagged Xray config array parent")
			}
			parent = typed[index]
		default:
			return errors.New("invalid Xray config array parent")
		}
	}
	last := path[len(path)-1]
	switch typed := parent.(type) {
	case map[string]any:
		typed[last] = replacement
		return nil
	case []any:
		index, err := strconv.Atoi(last)
		if err != nil || index < 0 || index >= len(typed) {
			return errors.New("invalid indexed Xray config array parent")
		}
		typed[index] = replacement
		return nil
	default:
		return errors.New("invalid Xray config array parent")
	}
}

func taggedConfigArray(values []any) ([]string, map[string]any, bool) {
	if len(values) == 0 {
		return nil, nil, false
	}
	tags := make([]string, 0, len(values))
	byTag := make(map[string]any, len(values))
	for _, item := range values {
		mapped, ok := item.(map[string]any)
		if !ok {
			return nil, nil, false
		}
		tag := stringValue(mapped["tag"])
		if tag == "" || byTag[tag] != nil {
			return nil, nil, false
		}
		tags = append(tags, tag)
		byTag[tag] = item
	}
	return tags, byTag, true
}

func taggedArrayIndex(values []any, tag string) int {
	for index, item := range values {
		mapped, ok := item.(map[string]any)
		if ok && stringValue(mapped["tag"]) == tag {
			return index
		}
	}
	return -1
}

func tagsFromConfigArray(values []any) []string {
	tags := make([]string, 0, len(values))
	for _, item := range values {
		mapped, _ := item.(map[string]any)
		tags = append(tags, stringValue(mapped["tag"]))
	}
	return tags
}

func filterExistingTags(values []string, present map[string]any) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := present[value]; ok {
			filtered = append(filtered, value)
		}
	}
	return filtered
}

func filterKnownTags(values []string, known map[string]bool) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if known[value] {
			filtered = append(filtered, value)
		}
	}
	return filtered
}

func configPatchValueMatches(current any, currentExists bool, expected any, expectedExists bool) bool {
	return currentExists == expectedExists && (!currentExists || configValueEqual(current, expected))
}

func configValueEqual(left, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftJSON, rightJSON)
}

func cloneConfigMap(value map[string]any) (map[string]any, error) {
	cloned, err := cloneConfigValue(value)
	if err != nil {
		return nil, err
	}
	mapped, ok := cloned.(map[string]any)
	if !ok {
		return nil, errors.New("invalid Xray config object")
	}
	return mapped, nil
}

func cloneConfigValue(value any) (any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var cloned any
	if err := json.Unmarshal(raw, &cloned); err != nil {
		return nil, err
	}
	return cloned, nil
}

func configPathJoin(path, part string) string {
	return path + "/" + strings.ReplaceAll(strings.ReplaceAll(part, "~", "~0"), "/", "~1")
}

func configPathParts(path string) []string {
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		return nil
	}
	parts := strings.Split(path, "/")
	for index, part := range parts {
		parts[index] = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
	}
	return parts
}

func displayConfigPath(path string) string {
	if path == "" {
		return "/"
	}
	return path
}

func stringSlice(value any) ([]string, bool) {
	items, ok := value.([]any)
	if !ok {
		items = nil
		if typed, typedOK := value.([]string); typedOK {
			return typed, true
		}
		return nil, false
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		result = append(result, text)
	}
	return result, true
}

func stringSlicesEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
