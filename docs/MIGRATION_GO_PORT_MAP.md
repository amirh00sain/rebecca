# Legacy Alembic Revision Map

This file records how legacy Alembic revisions are handled by the Go migration
runner. Keep it as an upgrade reference for older installations that still have
an `alembic_version` table.

## Rules

- Downgrades are out of scope. Go migrations are upgrade-only.
- Alembic merge/no-op revisions are not represented by separate Go migration
  files.
- Schema changes, data backfills, repair steps, and cleanup behavior are kept.
- Multiple related Alembic revisions may be compressed into one named Go
  migration when their final behavior belongs to the same domain.
- Go migration names are sequential and descriptive.
- The production path is `rebecca migrate up`; Python/Alembic is not required
  at runtime.

## Legacy Revision Set

- Alembic files scanned: 125
- Base revision: `94a5cc12c0d6`
- Current final head: `23_drop_access_insights`
- Merge/no-op revisions skipped: 17
- Graph shape: historical multi-head Alembic graph with merge revisions, later
  converging into the linear 2025/2026 chain.

## Alembic Categories

| Category | Count | Handling |
|---|---:|---|
| merge/no-op | 17 | Recorded only; no separate Go migration |
| simple schema | 26 | Folded into domain Go migrations |
| conditional/dialect-specific | 47 | Implemented with dialect-aware helpers |
| data/backfill | 35 | Preserved in the matching domain migration |

## Go Migration Files

| Order | Go migration file | Scope |
|---:|---|---|
| 1 | `000001_core_identity_schema.go` | system, jwt, tls, base admins/panel identity schema |
| 2 | `000002_users_proxies_hosts_schema.go` | users, proxies, hosts, inbounds, and user/proxy conversions |
| 3 | `000003_nodes_runtime_schema.go` | nodes and node runtime base schema |
| 4 | `000004_admin_roles_permissions.go` | admin roles, sudo/full_access, status, permissions |
| 5 | `000005_admin_limits_api_keys.go` | admin limits, API keys, usage/accounting support |
| 6 | `000006_user_lifecycle_columns.go` | user lifecycle/status/on-hold/next-plan/status timestamps |
| 7 | `000007_user_credentials_subscription_keys.go` | credential keys and subscription tracking fields |
| 8 | `000008_user_soft_delete_username_repair.go` | case-insensitive usernames, duplicate repair, soft delete |
| 9 | `000009_services_schema.go` | services, service_hosts, admins_services base schema |
| 10 | `000010_service_admin_limits_usage.go` | per-service limits and service/admin service accounting |
| 11 | `000011_xray_config_targets.go` | xray_config and node default/custom config target storage |
| 12 | `000012_node_runtime_extensions.go` | nodes, node runtime fields, certificates, proxy settings |
| 13 | `000013_outbound_usage_accounting.go` | node usage, outbound traffic, node_operations queue, pending node certificates |
| 14 | `000014_subscription_settings.go` | subscription settings, aliases, ports, domains, admin overrides |
| 15 | `000015_backup_telegram_warp_legacy.go` | legacy backup, telegram, and WARP schemas |
| 16 | `000016_removed_features_cleanup.go` | removed feature cleanup: user templates, access insights |
| 17 | `000017_performance_indexes.go` | production read/write performance indexes and redundant index cleanup |
| 18 | `000018_remove_user_inbound_selection.go` | removes legacy per-user inbound exclusion storage |
| 19 | `000019_materialize_legacy_proxy_credentials.go` | stores legacy masked VMess/VLESS UUIDs in proxies and removes jwt mask columns |
| 20 | `000020_node_notes.go` | adds optional operator notes to nodes |

Legacy dialect repairs such as historical MySQL collation fixes are tracked as
compatibility notes when the final Go schema already includes the corrected
shape.

## Skipped Alembic Revisions

These revisions are graph-only merges/no-ops. They are not converted to separate
Go migration files. The runner can still upgrade databases whose
`alembic_version` points at one of these revisions.

- `0f720f5c54dd_.py`
- `123456789abc_merge_ff05a3b7cdef_7c8d9e0f1a2.py`
- `1ad79b97fdcf_.py`
- `1ca5b0ca7ef0_merge_backup_schedule_heads.py`
- `2025_12_02_02-2b5121ab2105_merge_heads_before_admin_api_keys.py`
- `2313cdc30da3_.py`
- `3f4g5h6i7j8k_fix_users_id_autoincrement.py`
- `4d5e6f7g8h9i_merge_heads.py`
- `5g6h7i8j9k0l_merge_all_heads.py`
- `7c8d9e0f1a2_merge_admin_and_jwt_heads.py`
- `852d951c9c08_drop_extra_index.py`
- `be0c5f840473_fix_multiple_heads_error.py`
- `c5d6e7f8g9h0_merge_heads_after_sub_default.py`
- `cbc81a0e2298_add_lifetime_usage_column_to_admins.py`
- `e410e5f15c3f_merge_fad8b1997c3a_a0d3d400ea75.py`
- `ece13c4c6f65_.py`
- `f8g9h0i1j2k3_merge_all_heads.py`

## Alembic To Go Map

| Alembic file | Revision | Category | Go migration | Preserved behavior | Verification note |
|---|---|---|---|---|---|
| `015cf1dc6eca_sub_updated_at_and_sub_last_user_agent.py` | `015cf1dc6eca` | simple schema | `000007_user_credentials_subscription_keys.go` | Add subscription update tracking fields on users. | Schema check for users columns. |
| `025d427831dd_sub_last_user_agent_length.py` | `025d427831dd` | conditional/dialect | `000007_user_credentials_subscription_keys.go` | Widen `sub_last_user_agent` safely. | SQLite/MySQL column type check. |
| `07f9bbb3db4e_user_last_status_change.py` | `07f9bbb3db4e` | data/backfill | `000006_user_lifecycle_columns.go` | Add/backfill user status timestamp. | Data data case with existing status rows. |
| `08b381fc1bc7_update_shadowsocks_method.py` | `08b381fc1bc7` | data/backfill | `000002_users_proxies_hosts_schema.go` | Rewrite Shadowsocks proxy settings JSON method values. | JSON before/after data case. |
| `09adb90e970f_add_geo_mode_column_to_nodes.py` | `09adb90e970f` | data/backfill | `000012_node_runtime_extensions.go` | Add node geo mode and preserve existing node rows. | Node rows check. |
| `0a1b2c3d4e5f_add_credential_key_to_users.py` | `0a1b2c3d4e5f` | conditional/dialect | `000007_user_credentials_subscription_keys.go` | Add `users.credential_key`. | Schema check. |
| `0d1e2f3g4h5i_add_service_flow_column.py` | `0d1e2f3g4h5i` | data/backfill | `000009_services_schema.go` | Add service flow and reseller role enum compatibility. | Service/admin role data case. |
| `0f1b2c3d4e5f_add_admin_roles_and_permissions.py` | `0f1b2c3d4e5f` | data/backfill | `000004_admin_roles_permissions.go` | Add admin role/permissions and migrate old sudo state. | Admin role/permission data case. |
| `0f720f5c54dd_.py` | `0f720f5c54dd` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `123456789abc_merge_ff05a3b7cdef_7c8d9e0f1a2.py` | `123456789abc` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `1ad79b97fdcf_.py` | `1ad79b97fdcf` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `1b2c3d4e5f60_admin_soft_delete_status.py` | `1b2c3d4e5f60` | data/backfill | `000004_admin_roles_permissions.go` | Add admin soft-delete status and username index behavior. | Admin status/index check. |
| `1c2d3e4f5a6b_backfill_user_credential_keys.py` | `1c2d3e4f5a6b` | data/backfill | `000007_user_credentials_subscription_keys.go` | Backfill missing credential keys. | Non-empty unique key data case. |
| `1c2d3e4f5g6h_add_admin_disabled_state.py` | `1c2d3e4f5g6h` | data/backfill | `000004_admin_roles_permissions.go` | Add disabled admin state and status enum repair. | Active/disabled/deleted data case. |
| `1ca5b0ca7ef0_merge_backup_schedule_heads.py` | `1ca5b0ca7ef0` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `1cf7d159fdbb_add_online_at.py` | `1cf7d159fdbb` | simple schema | `000006_user_lifecycle_columns.go` | Add user online timestamp. | Schema check. |
| `2025_12_02_02-0b71839bf061_add_admin_api_keys.py` | `0b71839bf061` | simple schema | `000005_admin_limits_api_keys.go` | Create admin API keys table. | Admin API key schema check. |
| `2025_12_02_02-2b5121ab2105_merge_heads_before_admin_api_keys.py` | `2b5121ab2105` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `2025_12_02_03-1f2e3d4c5b6a_backfill_proxies_from_keys.py` | `1f2e3d4c5b6a` | data/backfill | `000002_users_proxies_hosts_schema.go` | Backfill proxy records from legacy key data. | Proxy conversion data case. |
| `2025_12_03_01-1_add_user_flow_column.py` | `1_add_user_flow` | data/backfill | `000002_users_proxies_hosts_schema.go` | Add user flow and migrate proxy settings flow values. | User/proxy flow data case. |
| `2025_12_06_02-2_add_node_certs.py` | `2_add_node_certs` | conditional/dialect | `000012_node_runtime_extensions.go` | Add node certificate fields. | Node schema check. |
| `2025_12_10_03-3_add_access_insights.py` | `3_add_access_insights` | conditional/dialect | `000016_removed_features_cleanup.go` | Legacy access insights existed but final Go state removes it. | Setting removed in final schema. |
| `2025_12_14_21-4_add_outbound_traffic_table.py` | `4_add_outbound_traffic_table` | data/backfill | `000013_outbound_usage_accounting.go` | Create outbound traffic table and preserve rows. | Outbound row/aggregate check. |
| `2025_12_15_01_05_add_service_users_usage.py` | `5_add_service_users_usage` | conditional/dialect | `000009_services_schema.go` | Add service users usage counter. | Service usage schema check. |
| `2025_12_27_03_06_add_next_plan_columns.py` | `6_add_next_plan_columns` | conditional/dialect | `000006_user_lifecycle_columns.go` | Add user next-plan lifecycle fields. | Next-plan data case. |
| `2025_12_29_01_07_add_subscription_settings.py` | `7_add_subscription_settings` | conditional/dialect | `000014_subscription_settings.go` | Create subscription settings and admin override fields. | Settings schema check. |
| `2026_01_05_01_08_update_subscription_settings_profile.py` | `8_subscription_settings_profile` | conditional/dialect | `000014_subscription_settings.go` | Add subscription profile/support/update interval fields. | Settings default check. |
| `2026_02_05_12_09_add_node_proxy_settings.py` | `9_add_node_proxy_settings` | conditional/dialect | `000012_node_runtime_extensions.go` | Add node outbound proxy settings. | Node proxy schema check. |
| `2026_02_18_09_10_ensure_subscription_schema_exists.py` | `10_ensure_subscription_schema` | conditional/dialect | `000014_subscription_settings.go` | Idempotently repair subscription settings/domains/admin columns. | Missing-column repair data case. |
| `2026_02_24_07-11_add_subscription_aliases.py` | `11_add_subscription_aliases` | data/backfill | `000014_subscription_settings.go` | Add and normalize subscription aliases. | Alias default/backfill check. |
| `2026_02_24_14-12_subscription_path_ports.py` | `12_subscription_path_ports` | data/backfill | `000014_subscription_settings.go` | Add subscription path and ports. | Path/ports data case. |
| `2026_02_25_10-13_add_admin_expire.py` | `13_add_admin_expire` | conditional/dialect | `000005_admin_limits_api_keys.go` | Add admin expire limit. | Admin limit schema check. |
| `2026_04_04_01-14_add_admin_created_traffic.py` | `14_add_admin_created_traffic` | data/backfill | `000005_admin_limits_api_keys.go` | Add admin created traffic counters/logs. | Admin traffic aggregate check. |
| `2026_04_25_01_add_user_subadress.py` | `15_add_user_subadress` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add user legacy subadress. | User schema check. |
| `2026_04_27_01_16_node_xray_configs.py` | `16_node_xray_configs` | data/backfill | `000011_xray_config_targets.go` | Add node custom/default Xray config storage and backfill. | Xray config target data case. |
| `2026_04_29_01_admin_service_traffic_limits.py` | `17_admin_service_traffic_limits` | conditional/dialect | `000010_service_admin_limits_usage.go` | Add per-service admin traffic limits. | Admin-service limits check. |
| `2026_04_30_01_18_admin_created_traffic_service.py` | `18_admin_created_traffic_service` | conditional/dialect | `000010_service_admin_limits_usage.go` | Add service-aware admin created traffic accounting. | Service traffic data case. |
| `2026_05_05_01_19_telegram_backup_settings.py` | `19_telegram_backup_settings` | conditional/dialect | `000015_backup_telegram_warp_legacy.go` | Preserve legacy Telegram backup settings schema. | Telegram/backup schema check. |
| `2026_06_01_01_20_node_operations_queue.py` | `20_node_operations_queue` | conditional/dialect | `000013_outbound_usage_accounting.go` | Create node_operations queue and indexes. | Queue schema/index check. |
| `2026_06_04_01_20_user_admin_disabled_at.py` | `20_user_admin_disabled_at` | conditional/dialect | `000006_user_lifecycle_columns.go` | Add admin-disabled timestamp to users. | User status data case. |
| `2026_06_09_01_00_pending_node_certificates.py` | `21_pending_node_certificates` | conditional/dialect | `000012_node_runtime_extensions.go` | Add pending node certificate table. | Pending cert schema check. |
| `2026_06_10_01_22_drop_user_templates.py` | `22_drop_user_templates` | conditional/dialect | `000016_removed_features_cleanup.go` | Drop removed user_templates table. | Table absent final check. |
| `2026_06_10_01_23_drop_access_insights.py` | `23_drop_access_insights` | conditional/dialect | `000016_removed_features_cleanup.go` | Drop removed access insights setting. | Column absent final check. |
| `21226bc711ac_add_threshold_to_notificationreminder.py` | `21226bc711ac` | simple schema | `000005_admin_limits_api_keys.go` | Add notification threshold column. | Schema check. |
| `2313cdc30da3_.py` | `2313cdc30da3` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `2a3b4c5d6e7f_update_jwt_table_with_masks_and_separate_keys.py` | `2a3b4c5d6e7f` | data/backfill | `000001_core_identity_schema.go` | Split JWT admin/user secret keys and masks. | JWT row backfill data case. |
| `2b231de97dc3_add_use_sni_as_host_to_hosts.py` | `2b231de97dc3` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host SNI-as-host flag. | Host schema check. |
| `2d3f4b5a6c71_user_soft_delete_and_username_constraint.py` | `2d3f4b5a6c71` | data/backfill | `000008_user_soft_delete_username_repair.go` | Add user soft delete and username uniqueness behavior. | Duplicate username data case. |
| `2ea33513efc0_noise_for_sqlite.py` | `2ea33513efc0` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add noise setting support for SQLite path. | SQLite host schema check. |
| `305943d779c4_add_h3_to_alpn_enum.py` | `305943d779c4` | data/backfill | `000002_users_proxies_hosts_schema.go` | Add H3 ALPN compatibility. | Host ALPN data case. |
| `31f92220c0d0_add_support_random_user_agent.py` | `31f92220c0d0` | simple schema | `000002_users_proxies_hosts_schema.go` | Add random user-agent flag. | Host schema check. |
| `35f7f8fa9cf2_add_sub_revoked_at_to_users.py` | `35f7f8fa9cf2` | simple schema | `000007_user_credentials_subscription_keys.go` | Add subscription revoke timestamp. | User schema check. |
| `37692c1c9715_nodes.py` | `37692c1c9715` | conditional/dialect | `000012_node_runtime_extensions.go` | Create nodes table. | Node schema check. |
| `3cf36a5fde73_init_system_table.py` | `3cf36a5fde73` | simple schema | `000001_core_identity_schema.go` | Create system table. | Core schema check. |
| `3e7a0cb1d2ef_add_telegram_settings_table.py` | `3e7a0cb1d2ef` | conditional/dialect | `000015_backup_telegram_warp_legacy.go` | Create legacy telegram settings table. | Telegram schema check. |
| `3f4g5h6i7j8k_fix_users_id_autoincrement.py` | `3f4g5h6i7j8k` | merge/no-op | SKIP | Graph/no effective final behavior in Go baseline. | Recorded only. |
| `470465472326_add_path_to_hosts.py` | `470465472326` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add host path. | Host schema check. |
| `4d5e6f7g8h9i_merge_heads.py` | `4d5e6f7g8h9i` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `4f045f53bef8_drop_proxy_outbound_and_sockopt_from_.py` | `4f045f53bef8` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Remove legacy proxy outbound/sockopt columns from proxies. | Proxy schema check. |
| `51e941ed9018_deactive_user_status.py` | `51e941ed9018` | data/backfill | `000006_user_lifecycle_columns.go` | Add/normalize deactive user status. | Status data case. |
| `54c4b8c525fc_last_status_change_for_expired_users.py` | `54c4b8c525fc` | data/backfill | `000006_user_lifecycle_columns.go` | Backfill status change for expired users. | Expired-user data case. |
| `5575fe410515_add_telegram_id_to_admin.py` | `5575fe410515` | simple schema | `000015_backup_telegram_warp_legacy.go` | Add admin telegram id. | Admin schema check. |
| `57fda18cd9e6_add_xray_version.py` | `57fda18cd9e6` | simple schema | `000012_node_runtime_extensions.go` | Add node Xray version. | Node schema check. |
| `5a4446e7b165_add_password_reset_at_to_admins.py` | `5a4446e7b165` | simple schema | `000004_admin_roles_permissions.go` | Add admin password reset timestamp. | Admin auth schema check. |
| `5a6b7c8d9e0f_add_admin_disabled_reason.py` | `5a6b7c8d9e0f` | conditional/dialect | `000004_admin_roles_permissions.go` | Add admin disabled reason. | Admin status schema check. |
| `5b84d88804a1_fix.py` | `5b84d88804a1` | conditional/dialect | Compatibility note | Historical host/user nullability repair; final Go schema already uses corrected shape. | Covered by final schema unless a legacy database needs a dialect-specific repair. |
| `5g6h7i8j9k0l_merge_all_heads.py` | `5g6h7i8j9k0l` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `671621870b02_init_admin.py` | `671621870b02` | conditional/dialect | `000001_core_identity_schema.go` | Create base admins table. | Core schema check. |
| `6a7b8c9d0e1_add_jwt_keys_and_masks.py` | `6a7b8c9d0e1` | data/backfill | `000001_core_identity_schema.go` | Add JWT key/mask fields and backfill secrets. | JWT data case. |
| `6b82cec33861_add_lifetime_usage_column_to_admins.py` | `6b82cec33861` | simple schema | `000005_admin_limits_api_keys.go` | Add admin lifetime usage. | Admin accounting schema check. |
| `714f227201a7_fix_user_template.py` | `714f227201a7` | conditional/dialect | `000016_removed_features_cleanup.go` | Legacy user template fix, final state removed. | Final absent-table check. |
| `74f5f3f0a8c9_add_master_node_state.py` | `74f5f3f0a8c9` | data/backfill | `000012_node_runtime_extensions.go` | Add legacy master node state preservation. | Legacy node state data case. |
| `77c86a261126_nodes_coefficient.py` | `77c86a261126` | simple schema | `000012_node_runtime_extensions.go` | Add node usage coefficient. | Node schema check. |
| `7a0dbb8a2f65_init_tls_table.py` | `7a0dbb8a2f65` | data/backfill | `000001_core_identity_schema.go` | Create TLS table and preserve default cert/key if present. | TLS schema/data check. |
| `7c8d9e0f1a2_merge_admin_and_jwt_heads.py` | `7c8d9e0f1a2` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `7cbe9d91ac11_proxyhost_security_added.py` | `7cbe9d91ac11` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host security field. | Host schema check. |
| `852d951c9c08_drop_extra_index.py` | `852d951c9c08` | merge/no-op | SKIP | No effective final behavior after compression. | Recorded only. |
| `8e849e06f131_proxy_table.py` | `8e849e06f131` | data/backfill | `000002_users_proxies_hosts_schema.go` | Create proxy table and migrate user proxy representation. | Proxy data case. |
| `947ebbd8debe_add_on_hold.py` | `947ebbd8debe` | data/backfill | `000006_user_lifecycle_columns.go` | Add on-hold user state. | On-hold data case. |
| `94a5cc12c0d6_init_user_table.py` | `94a5cc12c0d6` | simple schema | `000002_users_proxies_hosts_schema.go` | Create base users table. | User schema check. |
| `97dd9311ab93_add_user_templates.py` | `97dd9311ab93` | simple schema | `000016_removed_features_cleanup.go` | Legacy user_templates existed but final Go state removes it. | Final absent-table check. |
| `9b60be6cd0a2_add_created_at_field_to_users_table.py` | `9b60be6cd0a2` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add users.created_at. | User schema check. |
| `9d5a518ae432_init_jwt_table.py` | `9d5a518ae432` | data/backfill | `000001_core_identity_schema.go` | Create JWT table and seed secrets. | JWT schema/data check. |
| `a0715c2615f0_add_allow_in_secure_and_disable_host.py` | `a0715c2615f0` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add host allow-insecure and disabled fields. | Host schema check. |
| `a0d3d400ea75_admin_is_sudo_field.py` | `a0d3d400ea75` | simple schema | `000004_admin_roles_permissions.go` | Add legacy is_sudo field for later transition. | Admin transition data case. |
| `a1b2c3d4e5f6_update_admin_status_and_role.py` | `a1b2c3d4e5f6` | data/backfill | `000004_admin_roles_permissions.go` | Normalize admin status/role values. | Admin role/status data case. |
| `a2ac6056027a_add_ip_limit_column_to_users_table.py` | `a2ac6056027a` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add users.ip_limit. | User schema check. |
| `a6e3fff39291_add_notification_reminders.py` | `a6e3fff39291` | simple schema | `000005_admin_limits_api_keys.go` | Add notification reminders table. | Notification schema check. |
| `a9584d547b24_add_data_limit_and_users_limit_to_admins.py` | `a9584d547b24` | data/backfill | `000005_admin_limits_api_keys.go` | Add admin data/users limits with preservation. | Admin limits data case. |
| `a9cfd5611a82_add_noise_settings.py` | `a9cfd5611a82` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host noise settings. | Host schema check. |
| `adda2dd4a741_add_sockopt_proxy_outbound_mux_enable_fragment_setting_to_hosts.py` | `adda2dd4a741` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host mux/fragment/noise related fields. | Host schema check. |
| `b15eba6e5867_add_host_sni.py` | `b15eba6e5867` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host SNI field. | Host schema check. |
| `b25e7e6be241_added_users_usage_to_admin.py` | `b25e7e6be241` | simple schema | `000005_admin_limits_api_keys.go` | Add admin users usage. | Admin accounting schema check. |
| `b3378dc6de01_hosts.py` | `b3378dc6de01` | simple schema | `000002_users_proxies_hosts_schema.go` | Create hosts table. | Host schema check. |
| `b6c1e4cf1a2b_add_warp_accounts_table.py` | `b6c1e4cf1a2b` | conditional/dialect | `000015_backup_telegram_warp_legacy.go` | Create WARP accounts table. | WARP schema check. |
| `b9e52f5491a6_add_sort_to_hosts.py` | `b9e52f5491a6` | data/backfill | `000002_users_proxies_hosts_schema.go` | Add/backfill host sort ordering. | Host ordering data case. |
| `backup_schedule_panel_settings.py` | `backup_schedule_panel` | conditional/dialect | `000015_backup_telegram_warp_legacy.go` | Add legacy backup schedule panel fields. | Backup settings schema check. |
| `be0c5f840473_fix_multiple_heads_error.py` | `be0c5f840473` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `c106bb40c861_alpn_fingerprint_hosts.py` | `c106bb40c861` | simple schema | `000002_users_proxies_hosts_schema.go` | Add host ALPN/fingerprint. | Host schema check. |
| `c3cd674b9bcd_added_next_plan_for_user.py` | `c3cd674b9bcd` | simple schema | `000006_user_lifecycle_columns.go` | Add next plan fields. | User lifecycle schema check. |
| `c47250b790eb_add_user_note.py` | `c47250b790eb` | simple schema | `000002_users_proxies_hosts_schema.go` | Add user note. | User schema check. |
| `c4a1b2d3e4f5_add_default_subscription_type_to_panel.py` | `c4a1b2d3e4f5` | conditional/dialect | `000014_subscription_settings.go` | Add panel default subscription type. | Panel settings check. |
| `c5d6e7f8g9h0_merge_heads_after_sub_default.py` | `c5d6e7f8g9h0` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `c6a48231bb3d_add_services_and_usage_tracking.py` | `c6a48231bb3d` | data/backfill | `000009_services_schema.go` | Create services/admins_services/service_hosts and usage tracking. | Service schema/data case. |
| `cbc81a0e2298_add_lifetime_usage_column_to_admins.py` | `cbc81a0e2298` | merge/no-op | SKIP | Duplicate/no effective final behavior; covered by admin accounting migration. | Recorded only. |
| `ccbf9d322ae3_user_auto_delete_in_days.py` | `ccbf9d322ae3` | conditional/dialect | `000006_user_lifecycle_columns.go` | Add user auto-delete days. | User lifecycle schema check. |
| `d02dcfbf1517_add_userusageresetlogs_model_and_data_.py` | `d02dcfbf1517` | conditional/dialect | `000005_admin_limits_api_keys.go` | Add user usage reset logs table. | Reset logs schema check. |
| `d0a3960f5dad_usagelog_table_for_admin.py` | `d0a3960f5dad` | conditional/dialect | `000005_admin_limits_api_keys.go` | Add admin usage log table. | Usage log schema check. |
| `d4b5c6d7e8f9_add_ip_limit_and_nobetci_columns.py` | `d4b5c6d7e8f9` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Add user ip_limit/nobetci fields. | User schema check. |
| `dd725e4d3628_fix_mysql_collations.py` | `dd725e4d3628` | conditional/dialect | Compatibility note | Historical MySQL binary collation repair; final Go schema starts with compatible collations. | Add only if legacy MySQL data case requires it. |
| `e3f0e888a563_rename_deactive_status_to_disabled.py` | `e3f0e888a563` | data/backfill | `000006_user_lifecycle_columns.go` | Rename `deactive` status to `disabled`. | Status data case. |
| `e410e5f15c3f_merge_fad8b1997c3a_a0d3d400ea75.py` | `e410e5f15c3f` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `e4a86bc8ec7b_node_user_usages.py` | `e4a86bc8ec7b` | conditional/dialect | `000013_outbound_usage_accounting.go` | Create node user usages table. | Usage schema check. |
| `e56f1c781e46_fix_on_hold.py` | `e56f1c781e46` | conditional/dialect | `000006_user_lifecycle_columns.go` | Repair on-hold columns. | User lifecycle repair data case. |
| `e7b4d8f0a1c2_add_panel_settings_and_toggle.py` | `e7b4d8f0a1c2` | conditional/dialect | `000001_core_identity_schema.go` | Create panel settings and nobetci toggle. | Panel settings schema check. |
| `e7b869e999b4_increase_length_of_the_host_and_sni_.py` | `e7b869e999b4` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Widen host/SNI columns. | Host schema check. |
| `e91236993f1a_inbounds_table_excluded_inbounds.py` | `e91236993f1a` | conditional/dialect | `000002_users_proxies_hosts_schema.go` | Create inbounds and excluded inbound association. | Inbound schema check. |
| `ece13c4c6f65_.py` | `ece13c4c6f65` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `f123456789ab_move_xray_config_to_db.py` | `f123456789ab` | data/backfill | `000011_xray_config_targets.go` | Move Xray config file content into DB. | File-to-DB data case. |
| `f6a9bbd5c117_add_node_data_limit.py` | `f6a9bbd5c117` | data/backfill | `000012_node_runtime_extensions.go` | Add node data limit and limited status. | Node limit/status data case. |
| `f8g9h0i1j2k3_merge_all_heads.py` | `f8g9h0i1j2k3` | merge/no-op | SKIP | Graph merge only. | Recorded only. |
| `fad8b1997c3a_case_insensitive_username.py` | `fad8b1997c3a` | data/backfill | `000008_user_soft_delete_username_repair.go` | Case-insensitive username collation/index and duplicate repair. | Duplicate username data case. |
| `fc01b1520e72_add_node_usages.py` | `fc01b1520e72` | conditional/dialect | `000013_outbound_usage_accounting.go` | Create node usage tables and migrate old shape. | Usage schema/data case. |
| `fe7796f840a4_remove_certficiate_from_nodes.py` | `fe7796f840a4` | conditional/dialect | `000012_node_runtime_extensions.go` | Remove legacy node certificate column from nodes. | Node schema check. |
| `ff05a3b7cdef_promote_sudo_to_full_access.py` | `ff05a3b7cdef` | data/backfill | `000004_admin_roles_permissions.go` | Promote sudo role to full_access. | Admin role data case. |

## Operational Notes

The revisions below contain data movement or dialect-specific repair logic. They
are listed here because they are the first places to inspect if an old database
upgrade behaves differently from a fresh install:

- `0f1b2c3d4e5f_add_admin_roles_and_permissions.py`: role/permission backup table and SQLite table rebuild behavior.
- `1b2c3d4e5f60_admin_soft_delete_status.py`: admin username index and deleted status behavior.
- `1c2d3e4f5g6h_add_admin_disabled_state.py`: admin status enum changes across dialects.
- `2d3f4b5a6c71_user_soft_delete_and_username_constraint.py`: user soft delete and username index behavior.
- `fad8b1997c3a_case_insensitive_username.py`: duplicate username repair and MySQL/SQLite collation behavior.
- `dd725e4d3628_fix_mysql_collations.py`: MySQL FK drop/recreate around binary collations.
- `2026_02_18_09_10_ensure_subscription_schema_exists.py`: idempotent schema repair for partially migrated DBs.
- `2026_04_27_01_16_node_xray_configs.py`: node config custom/default migration and JSON preservation.
- `f123456789ab_move_xray_config_to_db.py`: file-to-DB migration for legacy Xray config.
- `c6a48231bb3d_add_services_and_usage_tracking.py`: services/admin-service links and usage counters.
- `f6a9bbd5c117_add_node_data_limit.py`: node data_limit/status migration preserving old values.

Known broken Alembic tags:

- `5g6h7i8j9k0l` is a broken merge/no-op tag. The Go runner bypasses the tag and runs all idempotent migrations.
- `ff05a3b7cdef` is a broken direct-seed tag. The Go runner bypasses the tag; `000004_admin_roles_permissions.go` still applies the `sudo`/`is_sudo` to `full_access` repair.

For normal operation use:

```bash
rebecca migrate up
rebecca migrate status
```

Downgrades are not supported. Restore from a backup if a schema rollback is
needed.
