import type { Project } from "../../lib/projects";
import type { Assignee, WbsTask } from "../../lib/wbs";
import { summarizeWbsTasks } from "../../lib/wbsView";
import { formatISODate } from "../../lib/calendar";
import { expectedProgress, isTaskDelayed } from "../../lib/wbsPlanning";

type Destination = "wbs" | "projects" | "users";

export function HomeScreen({ tasks, projects, users, loading, onNavigate, onOpenTask }: {
  tasks: WbsTask[];
  projects: Project[];
  users: Assignee[];
  loading: boolean;
  onNavigate: (destination: Destination) => void;
  onOpenTask: (task: WbsTask) => void;
}) {
  const summary = summarizeWbsTasks(tasks, formatISODate(new Date()));
  const today = formatISODate(new Date());
  const attention = tasks
    .filter((task) => task.status !== "completed" && (isTaskDelayed(task, today) || task.plannedEnd < today || task.projectId === null || task.assigneeId === null))
    .sort((left, right) => left.plannedEnd.localeCompare(right.plannedEnd))
    .slice(0, 5);

  return <main className="home-screen">
    <header className="home-hero">
      <div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>今日のプロジェクト</h1><p>案件・ユーザー・WBSをひとつの流れで確認できます。</p></div>
      <button className="primary-button" onClick={() => onNavigate("wbs")}>WBSを開く →</button>
    </header>
    {loading ? <div className="loading-card">ワークスペースを読み込んでいます…</div> : <>
      <section className="overview-grid" aria-label="作業状況">
        <button onClick={() => onNavigate("projects")}><span>進行中の案件</span><strong>{projects.filter((project) => project.status === "active").length}</strong><small>全{projects.length}件の案件を確認</small></button>
        <button onClick={() => onNavigate("users")}><span>登録ユーザー</span><strong>{users.length}</strong><small>体制とプロフィールを確認</small></button>
        <button onClick={() => onNavigate("wbs")}><span>未完了WBS</span><strong>{summary.open}</strong><small>平均進捗 {summary.averageProgress}%</small></button>
        <button className={summary.delayed > 0 ? "attention" : ""} onClick={() => onNavigate("wbs")}><span>進捗遅延</span><strong>{summary.delayed}</strong><small>{summary.delayed > 0 ? "計画進捗を下回っています" : "計画どおりに進行中"}</small></button>
      </section>
      <div className="home-content">
        <section className="home-panel attention-panel">
          <div className="home-panel-title"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>確認が必要なWBS</h2></div><button onClick={() => onNavigate("wbs")}>すべて表示</button></div>
          {attention.length === 0 ? <div className="home-empty"><strong>現在、要確認のWBSはありません</strong><span>進捗遅延、期限超過、紐づけ未設定のWBSがここに表示されます。</span></div> : <div className="attention-list">{attention.map((task) => { const delayed = isTaskDelayed(task, today); return <button key={task.id} onClick={() => onOpenTask(task)}><span className="attention-state">{delayed ? "進捗遅延" : task.plannedEnd < today ? "期限超過" : "紐づけ未設定"}</span><span><strong>{task.title}</strong><small>{delayed ? `実績 ${task.progress}% / 計画 ${expectedProgress(task, today)}%` : `${task.projectName ?? "案件未設定"} · ${task.assigneeName ?? "責任者未設定"}`}</small></span><time>{task.plannedEnd}</time></button>; })}</div>}
        </section>
        <section className="home-panel start-panel">
          <div><p className="eyebrow">QUICK START</p><h2>作業を始める</h2></div>
          <button onClick={() => onNavigate("users")}><span>1</span><div><strong>ユーザーを整える</strong><small>責任者候補の役割やスキルを登録</small></div><b>→</b></button>
          <button onClick={() => onNavigate("projects")}><span>2</span><div><strong>案件とメンバーを紐づける</strong><small>案件ごとの体制を設定</small></div><b>→</b></button>
          <button onClick={() => onNavigate("wbs")}><span>3</span><div><strong>WBSを計画する</strong><small>責任者と日程をロードマップで調整</small></div><b>→</b></button>
        </section>
      </div>
    </>}
  </main>;
}
