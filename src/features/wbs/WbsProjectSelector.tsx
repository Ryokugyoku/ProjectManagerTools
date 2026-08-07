import type { Project, ProjectStatus } from "../../lib/projects";
import type { WbsTask } from "../../lib/wbs";

const statusLabels: Record<ProjectStatus, string> = {
  planning: "計画中",
  active: "進行中",
  on_hold: "保留",
  completed: "完了",
};

export function WbsProjectSelector({ projects, tasks, loading, onSelect, onCreate }: {
  projects: Project[];
  tasks: WbsTask[];
  loading: boolean;
  onSelect: (project: Project) => void;
  onCreate: () => void;
}) {
  return <main className="wbs-project-screen">
    <header className="wbs-project-header">
      <div>
        <p className="eyebrow">WORK BREAKDOWN STRUCTURE</p>
        <h1>プロジェクトを選択</h1>
        <p>ロードマップに表示するプロジェクトを選んでください。</p>
      </div>
      <button className="primary-button" onClick={onCreate}>＋ プロジェクトを作成</button>
    </header>

    {loading ? <div className="loading-card">プロジェクトを読み込んでいます…</div> : projects.length === 0 ? (
      <section className="project-select-empty">
        <span aria-hidden="true">◇</span>
        <h2>プロジェクトがまだありません</h2>
        <p>最初にプロジェクトを作成すると、その案件に紐づくWBSをロードマップで管理できます。</p>
        <button className="primary-button" onClick={onCreate}>＋ プロジェクトを作成</button>
      </section>
    ) : (
      <section className="project-select-grid" aria-label="WBSを表示するプロジェクト">
        {projects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const openCount = projectTasks.filter((task) => task.status !== "completed").length;
          return <button key={project.id} className="project-select-card" onClick={() => onSelect(project)}>
            <div className="project-select-card-title">
              <span className={`priority-dot ${project.priority}`} />
              <strong>{project.name}</strong>
              <span className={`project-status ${project.status}`}>{statusLabels[project.status]}</span>
            </div>
            <small>{project.code} · {project.clientName || "顧客未設定"}</small>
            <div className="project-select-counts"><span><b>{projectTasks.length}</b> WBS</span><span><b>{openCount}</b> 未完了</span><span><b>{project.members.length}</b> メンバー</span></div>
            <span className="project-select-open">ロードマップを表示 <b aria-hidden="true">→</b></span>
          </button>;
        })}
      </section>
    )}
  </main>;
}
