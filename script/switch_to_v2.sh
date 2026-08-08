#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_data_dir="${PROJECT_MANAGER_APP_DATA_DIR:-$HOME/Library/Application Support/com.ryokugyoku.projectmanagertools}"
legacy_db="$app_data_dir/project-manager.db"
target_db="$app_data_dir/project-manager-v2.db"
migration="$repo_root/src-tauri/migrations/0001_v2_baseline.sql"
backup_dir="$app_data_dir/backups"

command -v sqlite3 >/dev/null
command -v shasum >/dev/null
[[ -f "$migration" ]] || { echo "v2 baseline not found: $migration" >&2; exit 1; }
[[ -f "$legacy_db" ]] || { echo "legacy database not found; cutover cancelled: $legacy_db" >&2; exit 1; }
[[ ! -e "$target_db" ]] || { echo "v2 database already exists; refusing to overwrite: $target_db" >&2; exit 1; }

mkdir -p "$app_data_dir"
stage_dir="$(mktemp -d "$app_data_dir/.v2-stage.XXXXXX")"
stage_db="$stage_dir/project-manager-v2.db"
cleanup() { rm -rf "$stage_dir"; }
trap cleanup EXIT

sqlite3 "$stage_db" < "$migration"

required_tables="app_settings milestones project_members projects task_activity_events task_progress_entries user_leaves users wbs_task_dependencies wbs_tasks"
actual_tables="$(sqlite3 -readonly "$stage_db" "SELECT group_concat(name, ' ') FROM (SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name);")"
[[ "$actual_tables" == "$required_tables" ]] || { echo "unexpected v2 table set: $actual_tables" >&2; exit 1; }
[[ "$(sqlite3 -readonly "$stage_db" "PRAGMA quick_check;")" == "ok" ]] || { echo "v2 quick_check failed" >&2; exit 1; }
[[ -z "$(sqlite3 -readonly "$stage_db" "PRAGMA foreign_key_check;")" ]] || { echo "v2 foreign_key_check failed" >&2; exit 1; }
[[ "$(sqlite3 -readonly "$stage_db" "SELECT COUNT(*) FROM pragma_table_info('wbs_tasks') WHERE name IN ('owner_user_id');")" == "1" ]] || { echo "v2 owner column missing" >&2; exit 1; }
[[ "$(sqlite3 -readonly "$stage_db" "SELECT COUNT(*) FROM pragma_table_info('wbs_tasks') WHERE name IN ('assignee_id','prerequisite_task_id');")" == "0" ]] || { echo "legacy WBS columns remain" >&2; exit 1; }

(cd "$repo_root" && npm run verify)

mkdir -p "$backup_dir"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup_db="$backup_dir/project-manager-v1-$timestamp.db"
schema_file="$backup_dir/project-manager-v1-$timestamp.schema.sql"
metadata_file="$backup_dir/project-manager-v1-$timestamp.metadata.json"

sqlite3 "$legacy_db" ".timeout 10000" ".backup '$backup_db'"
# The online backup retains WAL journal mode. A normal local open lets SQLite
# create its transient SHM file; `-readonly` cannot do that for a new backup.
[[ "$(sqlite3 "$backup_db" "PRAGMA quick_check;")" == "ok" ]] || { echo "backup quick_check failed; cutover cancelled" >&2; exit 1; }
sqlite3 "$backup_db" ".schema" > "$schema_file"

backup_sha256="$(shasum -a 256 "$backup_db" | awk '{print $1}')"
backup_size="$(wc -c < "$backup_db" | tr -d ' ')"
schema_sha256="$(shasum -a 256 "$schema_file" | awk '{print $1}')"
cat > "$metadata_file" <<EOF
{
  "created_at_utc": "$timestamp",
  "source_database": "$legacy_db",
  "backup_database": "$backup_db",
  "backup_sha256": "$backup_sha256",
  "backup_size_bytes": $backup_size,
  "schema_file": "$schema_file",
  "schema_sha256": "$schema_sha256",
  "sqlite_quick_check": "ok"
}
EOF

stage_sha256="$(shasum -a 256 "$stage_db" | awk '{print $1}')"
chmod 600 "$stage_db" "$backup_db" "$schema_file" "$metadata_file"
mv "$stage_db" "$target_db"
target_sha256="$(shasum -a 256 "$target_db" | awk '{print $1}')"
[[ "$target_sha256" == "$stage_sha256" ]] || { echo "v2 checksum changed during cutover" >&2; exit 1; }

echo "v2 cutover complete"
echo "database: $target_db"
echo "backup: $backup_db"
echo "backup metadata: $metadata_file"
echo "backup schema: $schema_file"
