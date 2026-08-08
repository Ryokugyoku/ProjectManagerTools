import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "project-manager-v2-"));
const database = join(directory, "baseline.db");
const migration = readFileSync(new URL("../../src-tauri/migrations/0001_v2_baseline.sql", import.meta.url), "utf8");

function query(sql: string): string {
  return execFileSync("sqlite3", ["-readonly", database, sql], { encoding: "utf8" }).trim();
}

beforeAll(() => {
  execFileSync("sqlite3", [database], { input: migration });
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("v2 SQLite baseline", () => {
  it("creates exactly the v2 product tables and passes integrity checks", () => {
    expect(query("SELECT group_concat(name, ',') FROM (SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name);")).toBe(
      "app_settings,milestones,project_members,projects,task_activity_events,task_progress_entries,user_leaves,users,wbs_task_dependencies,wbs_tasks",
    );
    expect(query("PRAGMA quick_check;")).toBe("ok");
    expect(query("PRAGMA foreign_key_check;")).toBe("");
  });

  it("contains no legacy product tables or WBS compatibility columns", () => {
    expect(query("SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('tasks','assignees','wbs_progress_logs','wbs_work_history');")).toBe("0");
    expect(query("SELECT COUNT(*) FROM pragma_table_info('wbs_tasks') WHERE name IN ('assignee_id','prerequisite_task_id');")).toBe("0");
    expect(query("SELECT COUNT(*) FROM pragma_table_info('wbs_tasks') WHERE name='owner_user_id';")).toBe("1");
  });
});
