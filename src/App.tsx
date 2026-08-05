import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createTask,
  deleteTask,
  listTasks,
  setTaskCompleted,
  type Task,
} from "./lib/tasks";
import "./App.css";

type Filter = "all" | "open" | "completed";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "open", label: "未完了" },
  { value: "completed", label: "完了" },
];

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await listTasks());
      setError(null);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === "open") return !task.completed;
        if (filter === "completed") return task.completed;
        return true;
      }),
    [filter, tasks],
  );

  const openCount = tasks.filter((task) => !task.completed).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;

    setSaving(true);
    try {
      await createTask(trimmedTitle);
      setTitle("");
      await refresh();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(task: Task) {
    try {
      await setTaskCompleted(task.id, !task.completed);
      await refresh();
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      await refresh();
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">TAURI 2 · REACT · SQLITE</p>
        <div className="hero-heading">
          <div>
            <h1 id="page-title">Project Manager</h1>
            <p className="subtitle">今日進めることを、端末の中にシンプルに保存。</p>
          </div>
          <div className="task-count" aria-label={`未完了 ${openCount} 件`}>
            <strong>{openCount}</strong>
            <span>OPEN</span>
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="タスク管理">
        <form className="task-form" onSubmit={handleSubmit}>
          <label htmlFor="task-title" className="sr-only">
            新しいタスク
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="次にやることを入力…"
            maxLength={120}
            autoComplete="off"
          />
          <button type="submit" disabled={!title.trim() || saving}>
            {saving ? "保存中" : "追加"}
          </button>
        </form>

        <div className="toolbar">
          <div className="filters" aria-label="表示フィルター">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "active" : ""}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span>{tasks.length} tasks</span>
        </div>

        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()}>
              再試行
            </button>
          </div>
        )}

        {loading ? (
          <p className="empty">SQLite を読み込んでいます…</p>
        ) : visibleTasks.length === 0 ? (
          <div className="empty">
            <span className="empty-mark">✓</span>
            <p>{tasks.length === 0 ? "最初のタスクを追加しましょう。" : "該当するタスクはありません。"}</p>
          </div>
        ) : (
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li key={task.id} className={task.completed ? "completed" : ""}>
                <button
                  type="button"
                  className="check-button"
                  aria-label={task.completed ? `${task.title}を未完了に戻す` : `${task.title}を完了にする`}
                  onClick={() => void handleToggle(task)}
                >
                  {task.completed ? "✓" : ""}
                </button>
                <div className="task-copy">
                  <span>{task.title}</span>
                  <time dateTime={task.createdAt}>{formatDate(task.createdAt)}</time>
                </div>
                <button
                  type="button"
                  className="delete-button"
                  aria-label={`${task.title}を削除`}
                  onClick={() => void handleDelete(task.id)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>SQLite にローカル保存 · オフラインで利用可能</footer>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export default App;
