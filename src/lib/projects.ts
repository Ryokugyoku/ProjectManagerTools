import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:project-manager-v2.db";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";
export type ProjectPriority = "low" | "medium" | "high";
export type ProjectMember = { userId: number; name: string; email: string; projectRole: string };
export type Project = {
  id: number;
  name: string;
  code: string;
  clientName: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  plannedStart: string | null;
  plannedEnd: string | null;
  members: ProjectMember[];
};
export type ProjectInput = Omit<Project, "id" | "members"> & {
  members: Array<{ userId: number; projectRole: string }>;
};

type ProjectRow = {
  id: number; name: string; code: string; client_name: string; description: string;
  status: ProjectStatus; priority: ProjectPriority; planned_start: string | null;
  planned_end: string | null;
};
type MemberRow = { project_id: number; user_id: number; name: string; email: string; project_role: string };

let databasePromise: Promise<Database> | undefined;
function database() { databasePromise ??= Database.load(DATABASE_URL); return databasePromise; }

export async function listProjects(): Promise<Project[]> {
  const db = await database();
  const [projects, members] = await Promise.all([
    db.select<ProjectRow[]>(`SELECT id, name, code, client_name, description, status,
      priority, planned_start, planned_end FROM projects ORDER BY status, name COLLATE NOCASE`),
    db.select<MemberRow[]>(`SELECT pm.project_id, pm.user_id, a.name, a.email, pm.project_role
      FROM project_members pm JOIN users a ON a.id=pm.user_id ORDER BY a.name COLLATE NOCASE`),
  ]);
  return projects.map((project) => ({
    id: project.id, name: project.name, code: project.code, clientName: project.client_name,
    description: project.description, status: project.status, priority: project.priority,
    plannedStart: project.planned_start, plannedEnd: project.planned_end,
    members: members.filter((member) => member.project_id === project.id).map((member) => ({
      userId: member.user_id, name: member.name, email: member.email, projectRole: member.project_role,
    })),
  }));
}

export async function createProject(input: ProjectInput): Promise<void> {
  validateProject(input);
  const db = await database();
  const result = await db.execute(`INSERT INTO projects
    (name, code, client_name, description, status, priority, planned_start, planned_end)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, projectValues(input));
  if (result.lastInsertId === undefined) throw new Error("案件IDを取得できませんでした。");
  await replaceMembers(db, result.lastInsertId, input.members);
}

export async function updateProject(id: number, input: ProjectInput): Promise<void> {
  validateProject(input);
  const db = await database();
  await db.execute(`UPDATE projects SET name=$1, code=$2, client_name=$3,
    description=$4, status=$5, priority=$6, planned_start=$7, planned_end=$8,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$9`, [...projectValues(input), id]);
  await replaceMembers(db, id, input.members);
  await db.execute(`UPDATE wbs_tasks SET owner_user_id=NULL WHERE project_id=$1
    AND owner_user_id IS NOT NULL
    AND owner_user_id NOT IN (SELECT user_id FROM project_members WHERE project_id=$1)`, [id]);
}

export async function deleteProject(id: number): Promise<void> {
  const db = await database();
  await db.execute("UPDATE wbs_tasks SET project_id=NULL WHERE project_id=$1", [id]);
  await db.execute("DELETE FROM project_members WHERE project_id=$1", [id]);
  await db.execute("DELETE FROM projects WHERE id=$1", [id]);
}

async function replaceMembers(db: Database, projectId: number, members: ProjectInput["members"]) {
  await db.execute("DELETE FROM project_members WHERE project_id=$1", [projectId]);
  for (const member of members) {
    await db.execute("INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1,$2,$3)", [projectId, member.userId, member.projectRole.trim()]);
  }
}

function projectValues(input: ProjectInput): unknown[] {
  return [input.name.trim(), input.code.trim(), input.clientName.trim(), input.description.trim(),
    input.status, input.priority, input.plannedStart || null, input.plannedEnd || null];
}
function validateProject(input: ProjectInput) {
  if (!input.name.trim()) throw new Error("案件名を入力してください。");
  if (!input.code.trim()) throw new Error("案件コードを入力してください。");
  if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) throw new Error("終了予定日は開始予定日以降にしてください。");
  if (new Set(input.members.map((member) => member.userId)).size !== input.members.length) throw new Error("同じユーザーを重複して登録できません。");
}
