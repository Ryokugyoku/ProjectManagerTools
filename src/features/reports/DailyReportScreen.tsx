import type { Project } from "../../lib/projects";
import type { DailyProgressSnapshot, WbsTask, ActivityEventKind } from "../../lib/wbs";
import { buildDailyProjectReports, calculateDelayImpact, calculateTaskScheduleVariance, type DailyReportHierarchyNode } from "../../lib/dailyReport";

export function DailyReportScreen({ projects, tasks, snapshots, reportDate, loading, ancestorDepth, onOpenWbs }: {
  projects: Project[];
  tasks: WbsTask[];
  snapshots: DailyProgressSnapshot[];
  reportDate: string;
  loading: boolean;
  ancestorDepth: number;
  onOpenWbs: (projectId?: number) => void;
}) {
  const reports = buildDailyProjectReports(projects, tasks, snapshots, reportDate, ancestorDepth);
  const snapshotByTask = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
  const parentIds = new Set(tasks.flatMap((task) => task.parentTaskId === null ? [] : [task.parentTaskId]));
  const missingProgressTasks = tasks.filter((task) => !parentIds.has(task.id) && task.status !== "completed" && task.plannedStart <= reportDate && snapshotByTask.get(task.id)?.dailyProgress == null);
  return <main className="page-screen report-screen">
    <header className="page-header report-header"><div><p className="eyebrow">DAILY PROJECT REPORT</p><h1>前日作業報告</h1><p>{formatDate(reportDate)}の作業を、案件ごとに会議でそのまま報告できます。</p></div><div className="report-date"><span>報告対象</span><strong>{reportDate}</strong><small>直前の営業日</small></div></header>
    {!loading && reports.length > 0 && missingProgressTasks.length > 0 && <section className="report-missing-banner" role="status"><div><strong>前日の進捗が未入力のWBSがあります</strong><p>{missingProgressTasks.length}件の末端タスクが未入力です。過去の日付を選んで記録してください。</p></div><button className="quiet-button" onClick={() => onOpenWbs()}>WBSで入力する</button></section>}
    {loading ? <div className="loading-card">前日の作業記録を読み込んでいます…</div> : reports.length === 0 ? <section className="report-empty"><span>◷</span><h2>報告対象の記録がありません</h2><p>WBSから未入力の日付を選び、その日の進捗を記録してください。</p><button className="primary-button" onClick={() => onOpenWbs()}>WBSで過去の進捗を入力</button></section> : <div className="report-project-list">
      {reports.map((report, index) => {
        const variance = report.variance.businessDays;
        const onScheduleWithDelays = variance === 0 && report.delayedTaskCount > 0;
        const varianceState = report.variance.trackedTasks === 0 ? "untracked" : onScheduleWithDelays ? "warning" : variance > 0 ? "ahead" : variance < 0 ? "behind" : "on-track";
        return <details className="report-project" key={report.project.id} open={index === 0}>
          <summary>
            <div><span className="project-code">{report.project.code}</span><h2>{report.project.name}</h2><small>{report.people.reduce((sum, person) => sum + person.records.length, 0)}件の作業記録 · 進行中{report.activeTaskCount}件</small></div>
            <div className={`variance ${varianceState}`}><span>案件全体進捗</span><strong>{report.variance.trackedTasks === 0 ? "—" : <>{variance > 0 ? "+" : ""}{variance.toFixed(1)}<small>営業日</small></>}</strong><em>{report.variance.trackedTasks === 0 ? "算出対象なし" : onScheduleWithDelays ? `計画どおり・個別遅延${report.delayedTaskCount}件` : variance > 0 ? "前倒し" : variance < 0 ? "遅延" : "計画どおり"}</em></div>
          </summary>
          <div className="report-project-body">
            <p className="variance-note">確定済み末端タスクを営業日数で重み付けした進捗差です。実績 {report.variance.actualProgress.toFixed(1)}% ／ 計画 {report.variance.plannedProgress.toFixed(1)}% ／ 対象 {report.variance.trackedTasks}件</p>
            <section className="spoken-report" aria-label={`${report.project.name}の担当者別作業報告`}><h3>担当者別の作業</h3>
              {report.people.length === 0 ? <div className="report-inline-empty"><p>前日の作業記録はありません。</p><button className="quiet-button" onClick={() => onOpenWbs(report.project.id)}>この案件のWBSで入力</button></div> : report.people.map((person) => <article key={person.key} className="person-report"><header><span>{initials(person.name)}</span><h4>{person.name}</h4><small>{person.records.length}タスク</small></header><ul>{person.records.map(({ task, snapshot }) => <WorkRecord key={task.id} task={task} snapshot={snapshot} reportDate={reportDate} tasks={tasks} />)}</ul></article>)}
            </section>
            <section className="active-hierarchy" aria-label={`${report.project.name}の進行中タスク階層`}><h3>現在アクティブなタスク</h3>
              {report.activeTaskCount === 0 ? <p className="report-inline-empty">進行中のタスクはありません。</p> : <><p className="hierarchy-note">共有する親子経路をまとめ、各タスクから親を最大{ancestorDepth}階層まで表示しています。</p><div>{report.activeTaskHierarchy.map((node) => <ActiveTaskTree key={node.task.id} node={node} snapshots={snapshots} reportDate={reportDate} />)}</div></>}
            </section>
          </div>
        </details>;
      })}
    </div>}
  </main>;
}

const historyLabels: Record<ActivityEventKind, string> = {
  created: "サブタスク追加",
  finalized: "計画確定",
  rescheduled: "リスケ",
  progress: "進捗記録",
  delay: "遅延理由",
};

function WorkRecord({ task, snapshot, reportDate, tasks }: { task: WbsTask; snapshot: DailyProgressSnapshot; reportDate: string; tasks: WbsTask[] }) {
  const variance = calculateTaskScheduleVariance(task, snapshot, reportDate);
  const delayed = variance !== null && variance < 0;
  const impact = delayed ? calculateDelayImpact(task, tasks, variance) : null;
  return <li className={`work-record${delayed ? " is-delayed" : ""}`}>
    <header><strong>{task.title}</strong><div>{delayed && <em className="task-delay-badge">{Math.abs(variance).toFixed(1)}営業日遅延</em>}{snapshot.dailyProgress !== null && <span>当日 +{snapshot.dailyProgress}%</span>}</div></header>
    {(task.prerequisiteTasks?.length ?? 0) > 0 && <p className="prerequisite-context">完了前提：{task.prerequisiteTasks!.map((item) => item.title).join("、")}</p>}
    <section className="work-report-primary"><b>その日に行った作業</b><p>{snapshot.note || "作業内容のメモはありません。"}</p></section>
    {snapshot.latestHistoryDetails && <section className="latest-work-history"><div><b>最新の作業履歴</b>{snapshot.latestHistoryType && <span>{historyLabels[snapshot.latestHistoryType]}</span>}</div><p>{snapshot.latestHistoryDetails}</p></section>}
    {snapshot.rescheduleReason && <section className="report-reschedule-reason"><b>リスケ理由</b><p>{snapshot.rescheduleReason}</p></section>}
    {snapshot.delayReason && <section className="report-delay-reason"><b>遅延理由</b><p>{snapshot.delayReason}</p></section>}
    {impact && <section className={`delay-impact ${impact.affectedTasks.length > 0 ? "has-impact" : "no-impact"}`}><b>後続タスクへの影響</b><p>{impact.successorTasks.length === 0 ? "影響なし：後続タスクは設定されていません。" : impact.affectedTasks.length > 0 ? `影響あり：${impact.affectedTasks.map((item) => `「${item.title}」`).join("、")}の開始予定に重なる見込みです。` : `現時点で影響なし：${impact.successorTasks.map((item) => `「${item.title}」`).join("、")}の開始予定までに収まる見込みです。`} 投影完了日 ${impact.projectedEnd}</p></section>}
    <section className="task-work-summary"><b>タスクの作業概要</b><p>{task.description || "作業の概要は未登録です。"}</p></section>
  </li>;
}

function ActiveTaskTree({ node, snapshots, reportDate }: { node: DailyReportHierarchyNode; snapshots: DailyProgressSnapshot[]; reportDate: string }) {
  const byTask = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
  const rows: Array<{ node: DailyReportHierarchyNode; depth: number }> = [];
  function append(current: DailyReportHierarchyNode, depth: number) {
    rows.push({ node: current, depth });
    current.children.forEach((child) => append(child, depth + 1));
  }
  append(node, 0);
  return <article>{node.omittedAncestorCount > 0 && <p className="omitted-ancestors">上位{node.omittedAncestorCount}階層を省略</p>}<ol>{rows.map(({ node: current, depth }) => {
    const task = current.task;
    const variance = calculateTaskScheduleVariance(task, byTask.get(task.id), reportDate);
    const delayed = variance !== null && variance < 0;
    return <li key={task.id} className={`${current.active ? "current" : "ancestor"}${delayed ? " is-delayed" : ""}`} style={{ "--report-depth": depth } as React.CSSProperties}><span>{current.active ? "アクティブ" : depth === 0 && current.omittedAncestorCount === 0 ? "最上位" : "親タスク"}</span><div><div className="hierarchy-task-title"><strong>{task.title}</strong>{delayed && <em>{Math.abs(variance).toFixed(1)}営業日遅延</em>}</div><p>{task.description || "作業の概要は未登録です。"}</p></div></li>;
  })}</ol></article>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function initials(name: string) { return name.trim().slice(0, 2); }
