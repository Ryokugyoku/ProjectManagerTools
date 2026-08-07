import type { Project, ProjectStatus } from "../../lib/projects";
import type { WbsTask } from "../../lib/wbs";

const statusLabels: Record<ProjectStatus, string> = {
  planning: "計画中",
  active: "進行中",
  on_hold: "保留",
  completed: "完了",
};

export function WbsProjectSelector({ projects, tasks, loading, onSelectAll, onSelect, onCreate }: {
  projects: Project[];
  tasks: WbsTask[];
  loading: boolean;
  onSelectAll: () => void;
  onSelect: (project: Project) => void;
  onCreate: () => void;
}) {
  return <main className="wbs-project-screen">
    <header className="wbs-project-header">
      <div>
        <p className="eyebrow">WORK BREAKDOWN STRUCTURE</p>
        <h1>WBSをどこから確認しますか？</h1>
        <p>まず全体を俯瞰するか、案件を選んで詳しく確認できます。</p>
      </div>
      <button className="primary-button" onClick={onCreate}>＋ プロジェクトを作成</button>
    </header>

    {loading ? <div className="loading-card">プロジェクトを読み込んでいます…</div> : projects.length === 0 && tasks.length === 0 ? (
      <section className="project-select-empty">
        <span aria-hidden="true">◇</span>
        <h2>プロジェクトがまだありません</h2>
        <p>最初にプロジェクトを作成すると、その案件に紐づくWBSをロードマップで管理できます。</p>
        <button className="primary-button" onClick={onCreate}>＋ プロジェクトを作成</button>
      </section>
    ) : (<>
      <section className="wbs-overview-entry" aria-label="すべてのWBSを表示">
        <div><span className="overview-entry-icon" aria-hidden="true">▦</span><div><p className="eyebrow">RECOMMENDED</p><h2>すべてのWBSを俯瞰する</h2><p>案件未設定のWBSも含め、全案件の予定とマイルストーンを1本の時間軸で確認します。</p></div></div>
        <div className="overview-entry-stats"><span><b>{tasks.length}</b> WBS</span><span><b>{tasks.filter((task) => task.status !== "completed").length}</b> 未完了</span><span><b>{tasks.filter((task) => task.projectId === null).length}</b> 案件未設定</span></div>
        <button className="primary-button" onClick={onSelectAll}>全体ロードマップを開く <span aria-hidden="true">→</span></button>
      </section>
      {projects.length > 0 && <><div className="project-select-section-title"><div><h2>案件から詳しく見る</h2><p>編集やマイルストーン管理を1案件に集中して行えます。</p></div><span>{projects.length}件</span></div>
      <section className="project-select-grid" aria-label="案件別のWBSを表示">
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
      </section></>}
    </>)}
  </main>;
}
