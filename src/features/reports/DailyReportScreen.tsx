import type { Project } from "../../lib/projects";
import type { DailyProgressSnapshot, WbsTask } from "../../lib/wbs";
import { buildDailyProjectReports } from "../../lib/dailyReport";

export function DailyReportScreen({ projects, tasks, snapshots, reportDate, loading }: {
  projects: Project[];
  tasks: WbsTask[];
  snapshots: DailyProgressSnapshot[];
  reportDate: string;
  loading: boolean;
}) {
  const reports = buildDailyProjectReports(projects, tasks, snapshots, reportDate);
  return <main className="page-screen report-screen">
    <header className="page-header report-header"><div><p className="eyebrow">DAILY PROJECT REPORT</p><h1>前日作業報告</h1><p>{formatDate(reportDate)}の作業を、案件ごとに会議でそのまま報告できます。</p></div><div className="report-date"><span>報告対象</span><strong>{reportDate}</strong><small>直前の営業日</small></div></header>
    {loading ? <div className="loading-card">前日の作業記録を読み込んでいます…</div> : reports.length === 0 ? <section className="report-empty"><span>◷</span><h2>報告対象の記録がありません</h2><p>日次進捗を記録すると、担当者別の作業内容がここにまとまります。</p></section> : <div className="report-project-list">
      {reports.map((report, index) => {
        const variance = report.variance.businessDays;
        const varianceState = report.variance.trackedTasks === 0 ? "untracked" : variance > 0 ? "ahead" : variance < 0 ? "behind" : "on-track";
        return <details className="report-project" key={report.project.id} open={index === 0}>
          <summary>
            <div><span className="project-code">{report.project.code}</span><h2>{report.project.name}</h2><small>{report.people.reduce((sum, person) => sum + person.records.length, 0)}件の作業記録 · 進行中{report.activeTaskChains.length}件</small></div>
            <div className={`variance ${varianceState}`}><span>案件全体進捗</span><strong>{report.variance.trackedTasks === 0 ? "—" : <>{variance > 0 ? "+" : ""}{variance.toFixed(1)}<small>営業日</small></>}</strong><em>{report.variance.trackedTasks === 0 ? "算出対象なし" : variance > 0 ? "前倒し" : variance < 0 ? "遅延" : "計画どおり"}</em></div>
          </summary>
          <div className="report-project-body">
            <p className="variance-note">確定済み末端タスクを営業日数で重み付けした進捗差です。実績 {report.variance.actualProgress.toFixed(1)}% ／ 計画 {report.variance.plannedProgress.toFixed(1)}% ／ 対象 {report.variance.trackedTasks}件</p>
            <section className="spoken-report" aria-label={`${report.project.name}の担当者別作業報告`}><h3>担当者別の作業</h3>
              {report.people.length === 0 ? <p className="report-inline-empty">前日の作業記録はありません。</p> : report.people.map((person) => <article key={person.key} className="person-report"><header><span>{initials(person.name)}</span><h4>{person.name}</h4><small>{person.records.length}タスク</small></header><ul>{person.records.map(({ task, snapshot }) => <li key={task.id}><div><strong>{task.title}</strong><span>+{snapshot.dailyProgress}%</span></div><p>{snapshot.note || "作業内容のメモはありません。"}</p>{task.description && <small><b>作業の概要</b>{task.description}</small>}</li>)}</ul></article>)}
            </section>
            <section className="active-hierarchy" aria-label={`${report.project.name}の進行中タスク階層`}><h3>現在アクティブなタスク</h3>
              {report.activeTaskChains.length === 0 ? <p className="report-inline-empty">進行中のタスクはありません。</p> : <div>{report.activeTaskChains.map((chain) => <article key={chain[chain.length - 1].id}><ol>{chain.map((task, depth) => <li key={task.id} className={depth === chain.length - 1 ? "current" : "ancestor"} style={{ "--report-depth": depth } as React.CSSProperties}><span>{depth === chain.length - 1 ? "アクティブ" : depth === 0 ? "最上位" : `親 ${depth}`}</span><div><strong>{task.title}</strong><p>{task.description || "作業の概要は未登録です。"}</p></div></li>)}</ol></article>)}</div>}
            </section>
          </div>
        </details>;
      })}
    </div>}
  </main>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function initials(name: string) { return name.trim().slice(0, 2); }
