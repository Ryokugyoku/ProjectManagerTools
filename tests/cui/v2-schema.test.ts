import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "project-manager-v2-"));
const database = join(directory, "baseline.db");
const migrations = [
  readFileSync(new URL("../../src-tauri/migrations/0001_v2_baseline.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../../src-tauri/migrations/0002_add_early_start_reason.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../../src-tauri/migrations/0003_add_schedule_assignment.sql", import.meta.url), "utf8"),
].join("\n");

function query(sql: string): string {
  return execFileSync("sqlite3", ["-readonly", database, sql], { encoding: "utf8" }).trim();
}

function execute(sql: string): void {
  execFileSync("sqlite3", [database, sql], { stdio: ["pipe", "pipe", "pipe"] });
}

beforeAll(() => {
  execFileSync("sqlite3", [database], { input: migrations });
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
    expect(query("SELECT COUNT(*) FROM pragma_table_info('task_progress_entries') WHERE name='early_start_reason';")).toBe("1");
    expect(query("SELECT COUNT(*) FROM pragma_table_info('wbs_tasks') WHERE name='schedule_assigned';")).toBe("1");
    expect(query("SELECT COUNT(*) FROM pragma_table_info('task_activity_events') WHERE name='reason_category';")).toBe("1");
    expect(query("SELECT COUNT(*) FROM pragma_table_info('task_activity_events') WHERE name='owner_user_id';")).toBe("1");
    expect(query("SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name='record_wbs_task_finalization';")).toBe("1");
  });

  it("records every newly finalized descendant through the schema trigger", () => {
    execute("INSERT INTO users (id,name,email) VALUES (201,'山田','owner@example.com'); INSERT INTO wbs_tasks (id,title,owner_user_id,planned_start,planned_end,business_days) VALUES (101,'親',201,'2026-08-03','2026-08-07',5),(102,'子',201,'2026-08-03','2026-08-05',3); UPDATE wbs_tasks SET parent_task_id=101 WHERE id=102; UPDATE wbs_tasks SET finalized=1 WHERE id IN (101,102);");
    expect(query("SELECT group_concat(task_id, ',') FROM task_activity_events WHERE event_kind='finalized' ORDER BY task_id;")).toBe("101,102");
    expect(query("SELECT group_concat(owner_user_id, ',') FROM task_activity_events WHERE event_kind='finalized' ORDER BY task_id;")).toBe("201,201");
    expect(() => execute("INSERT INTO task_activity_events (task_id,event_kind,reason_category) VALUES (101,'delay','invalid');")).toThrow();
  });
});
