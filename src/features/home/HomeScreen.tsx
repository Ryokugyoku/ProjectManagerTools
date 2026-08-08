import type { Project } from "../../lib/projects";
import type { Assignee, UserLeave, WbsTask } from "../../lib/wbs";
import { ancestorTrail, summarizeWbsTasks } from "../../lib/wbsView";
import { formatISODate } from "../../lib/calendar";
import { expectedProgress, isTaskDelayed } from "../../lib/wbsPlanning";
import { pendingApprovalLabel, summarizeLeaveApprovals } from "../../lib/leaveApprovals";

type Destination = "wbs" | "projects" | "users";

export function HomeScreen({ tasks, projects, users, leaves = [], countryCode = "JP", today = formatISODate(new Date()), loading, onNavigate, onOpenTask }: {
  tasks: WbsTask[];
  projects: Project[];
  users: Assignee[];
  leaves?: UserLeave[];
  countryCode?: string;
  today?: string;
  loading: boolean;
  onNavigate: (destination: Destination) => void;
  onOpenTask: (task: WbsTask) => void;
}) {
  const summary = summarizeWbsTasks(tasks, today);
  const attention = tasks
    .filter((task) => task.status !== "completed" && isTaskDelayed(task, today))
    .sort((left, right) => left.plannedEnd.localeCompare(right.plannedEnd))
    .slice(0, 5);
  const leaveAttention = leaves
    .map((leave) => ({ leave, approval: summarizeLeaveApprovals(leave, today, countryCode) }))
    .filter(({ approval }) => approval.state !== "complete")
    .sort((left, right) => left.approval.state === right.approval.state ? left.leave.date.localeCompare(right.leave.date) : left.approval.state === "urgent" ? -1 : 1);

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
      {leaveAttention.length > 0 && <section className="leave-attention-panel" aria-labelledby="leave-attention-heading"><div><p className="eyebrow">LEAVE APPROVALS</p><h2 id="leave-attention-heading">休暇の承認対応</h2><p>赤は本日中の対応、黄は承認待ちです。</p></div><div className="leave-attention-list">{leaveAttention.map(({ leave, approval }) => <button key={leave.id} className={approval.state} onClick={() => onNavigate("users")}><span>{approval.state === "urgent" ? "本日中" : "承認待ち"}</span><strong>{leave.userName}</strong><time>{leave.date}</time><small>{pendingApprovalLabel(approval.state === "urgent" ? approval.urgent : approval.pending)}</small></button>)}</div></section>}
      <div className="home-content">
        <section className="home-panel attention-panel">
          <div className="home-panel-title"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>確認が必要なWBS</h2></div><button onClick={() => onNavigate("wbs")}>すべて表示</button></div>
          {attention.length === 0 ? <div className="home-empty"><strong>現在、遅れているWBSはありません</strong><span>今日の計画進捗を下回った確定済みWBSがここに表示されます。</span></div> : <div className="attention-list">{attention.map((task) => {
            const ancestors = ancestorTrail(tasks, task.id);
            const fullPath = [...ancestors.map((ancestor) => ancestor.title), task.title].join(" › ");
            return <button key={task.id} onClick={() => onOpenTask(task)} title={fullPath} aria-label={`${fullPath}を開く`}>
              <span className="attention-state">進捗遅延</span>
              <span><strong>{task.title}</strong>{ancestors.length > 0 && <small className="task-parent-path">親: {ancestors[ancestors.length - 1].title}<span className="ancestry-tooltip" role="tooltip">{fullPath}</span></small>}<small>実績 {task.progress}% / 計画 {expectedProgress(task, today)}%</small>{task.latestDelayReason && <small className="latest-delay-reason">最新の遅延理由: {task.latestDelayReason}</small>}</span>
              <time>{task.plannedEnd}</time>
            </button>;
          })}</div>}
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
