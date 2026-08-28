package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	adminapp "github.com/rebeccapanel/rebecca/internal/app/admin"
	telegramapp "github.com/rebeccapanel/rebecca/internal/app/telegram"
	userapp "github.com/rebeccapanel/rebecca/internal/app/user"
)

func telegramActor(r *http.Request) string {
	if r == nil {
		return ""
	}
	principal, ok := r.Context().Value(adminContextKey).(adminPrincipal)
	if !ok {
		return ""
	}
	return principal.Context.Admin.Username
}

func adminTelegramChanges(before adminapp.Admin, after adminapp.Admin) []string {
	changes := []string{}
	add := func(label string, beforeValue any, afterValue any) {
		if fmt.Sprint(beforeValue) != fmt.Sprint(afterValue) {
			changes = append(changes, fmt.Sprintf("<b>%s:</b> <code>%s</code> → <code>%s</code>", label, htmlSafeValue(beforeValue), htmlSafeValue(afterValue)))
		}
	}
	add("Role", before.Role, after.Role)
	add("Status", before.Status, after.Status)
	add("Traffic Mode", before.TrafficLimitMode, after.TrafficLimitMode)
	add("Data Limit", telegramapp.FormatOptionalBytes(before.DataLimit), telegramapp.FormatOptionalBytes(after.DataLimit))
	if delta := telegramapp.FormatOptionalBytesDelta(before.DataLimit, after.DataLimit); delta != "" {
		changes = append(changes, fmt.Sprintf("<b>Changes:</b> <code>%s</code>", htmlSafeValue(delta)))
	}
	add("Users Limit", ptrIntText(before.UsersLimit), ptrIntText(after.UsersLimit))
	add("Expire", ptrIntText(before.Expire), ptrIntText(after.Expire))
	if before.UseServiceTrafficLimits != after.UseServiceTrafficLimits {
		add("Service Limits", before.UseServiceTrafficLimits, after.UseServiceTrafficLimits)
	}
	if before.ShowUserTraffic != after.ShowUserTraffic {
		add("Show User Traffic", before.ShowUserTraffic, after.ShowUserTraffic)
	}
	if len(changes) == 0 {
		changes = append(changes, "<b>Changes:</b> <code>updated</code>")
	}
	return changes
}

func adminRecentActionChanges(before adminapp.Admin, after adminapp.Admin) []recentActionValueChange {
	changes := []recentActionValueChange{}
	add := func(field, beforeValue, afterValue string) {
		if beforeValue != afterValue {
			changes = append(changes, recentActionValueChange{Field: field, Before: beforeValue, After: afterValue})
		}
	}
	add("role", string(before.Role), string(after.Role))
	add("status", string(before.Status), string(after.Status))
	add("traffic_limit_mode", string(before.TrafficLimitMode), string(after.TrafficLimitMode))
	if beforeValue, afterValue := telegramapp.FormatOptionalBytes(before.DataLimit), telegramapp.FormatOptionalBytes(after.DataLimit); beforeValue != afterValue {
		changes = append(changes, recentActionValueChange{
			Field: "data_limit", Before: beforeValue, After: afterValue,
			Delta: telegramapp.FormatOptionalBytesDelta(before.DataLimit, after.DataLimit),
		})
	}
	add("users_limit", ptrIntText(before.UsersLimit), ptrIntText(after.UsersLimit))
	add("expire", ptrIntText(before.Expire), ptrIntText(after.Expire))
	add("service_limits", fmt.Sprint(before.UseServiceTrafficLimits), fmt.Sprint(after.UseServiceTrafficLimits))
	add("show_user_traffic", fmt.Sprint(before.ShowUserTraffic), fmt.Sprint(after.ShowUserTraffic))
	return changes
}

func ptrIntText(value *int64) string {
	if value == nil {
		return "∞"
	}
	return fmt.Sprintf("%d", *value)
}

func ptrStringText(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func htmlSafeValue(value any) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&#34;",
		"'", "&#39;",
	).Replace(fmt.Sprint(value))
}

func userReportForTelegram(result userapp.MutationResult, owner string, actor string, raw []byte) telegramapp.UserReport {
	var payload struct {
		DataLimit              *int64           `json:"data_limit"`
		Expire                 *int64           `json:"expire"`
		DataLimitResetStrategy string           `json:"data_limit_reset_strategy"`
		NextPlans              []map[string]any `json:"next_plans"`
	}
	_ = json.Unmarshal(raw, &payload)
	return telegramapp.UserReport{
		Username:      result.Username,
		Owner:         owner,
		Actor:         actor,
		Status:        result.Status,
		DataLimit:     payload.DataLimit,
		Expire:        payload.Expire,
		ResetStrategy: payload.DataLimitResetStrategy,
		HasNextPlan:   len(payload.NextPlans) > 0,
	}
}

func telegramAdminLimitReport(username string, reason string, actor string) telegramapp.AdminLimitReport {
	label := reason
	switch strings.TrimSpace(reason) {
	case adminDataLimitExhaustedReason:
		label = "data limit exhausted"
	case adminTimeLimitExhaustedReason:
		label = "time limit exhausted"
	}
	return telegramapp.AdminLimitReport{
		Username: username,
		Reason:   label,
		Actor:    actor,
	}
}

func rawJSONHasField(raw []byte, field string) bool {
	if len(raw) == 0 || strings.TrimSpace(field) == "" {
		return false
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		return false
	}
	_, ok := payload[field]
	return ok
}
