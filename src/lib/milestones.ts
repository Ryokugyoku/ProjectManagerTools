import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:project-manager.db";

export type Milestone = { id: number; projectId: number; projectName: string; projectCode: string; name: string; description: string; dueDate: string; completed: boolean };
export type MilestoneInput = Pick<Milestone, "projectId" | "name" | "description" | "dueDate" | "completed">;
type MilestoneRow = { id: number; project_id: number; project_name: string; project_code: string; name: string; description: string; due_date: string; completed: number };

let databasePromise: Promise<Database> | undefined;
function database() { databasePromise ??= Database.load(DATABASE_URL); return databasePromise; }

export async function listMilestones(): Promise<Milestone[]> {
  const db = await database();
  const rows = await db.select<MilestoneRow[]>(`
    SELECT m.id, m.project_id, p.name AS project_name, p.code AS project_code,
      m.name, m.description, m.due_date, m.completed
    FROM milestones m JOIN projects p ON p.id = m.project_id
    ORDER BY m.due_date, m.id
  `);
  return rows.map((row) => ({ id: row.id, projectId: row.project_id, projectName: row.project_name, projectCode: row.project_code, name: row.name, description: row.description, dueDate: row.due_date, completed: row.completed === 1 }));
}

export async function createMilestone(input: MilestoneInput): Promise<void> {
  validateMilestone(input); const db = await database();
  await db.execute(`INSERT INTO milestones (project_id, name, description, due_date, completed)
    VALUES ($1,$2,$3,$4,$5)`, milestoneValues(input));
}

export async function updateMilestone(id: number, input: MilestoneInput): Promise<void> {
  validateMilestone(input); const db = await database();
  await db.execute(`UPDATE milestones SET project_id=$1, name=$2, description=$3,
    due_date=$4, completed=$5, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$6`, [...milestoneValues(input), id]);
}

export async function deleteMilestone(id: number): Promise<void> {
  const db = await database(); await db.execute("DELETE FROM milestones WHERE id=$1", [id]);
}

function milestoneValues(input: MilestoneInput): unknown[] { return [input.projectId, input.name.trim(), input.description.trim(), input.dueDate, input.completed ? 1 : 0]; }
function validateMilestone(input: MilestoneInput) {
  if (!Number.isInteger(input.projectId) || input.projectId < 1) throw new Error("所属プロジェクトを選択してください。");
  if (!input.name.trim()) throw new Error("マイルストーン名を入力してください。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("達成予定日を入力してください。");
}
