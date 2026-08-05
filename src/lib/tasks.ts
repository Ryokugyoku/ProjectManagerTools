import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:project-manager.db";

type TaskRow = {
  id: number;
  title: string;
  completed: number;
  created_at: string;
};

export type Task = {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
};

let databasePromise: Promise<Database> | undefined;

function database() {
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

export async function listTasks(): Promise<Task[]> {
  const db = await database();
  const rows = await db.select<TaskRow[]>(
    "SELECT id, title, completed, created_at FROM tasks ORDER BY completed ASC, id DESC",
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    createdAt: row.created_at,
  }));
}

export async function createTask(title: string): Promise<void> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("タスク名を入力してください。");

  const db = await database();
  await db.execute("INSERT INTO tasks (title) VALUES ($1)", [normalizedTitle]);
}

export async function setTaskCompleted(id: number, completed: boolean): Promise<void> {
  const db = await database();
  await db.execute("UPDATE tasks SET completed = $1 WHERE id = $2", [completed ? 1 : 0, id]);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}
