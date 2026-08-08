import { milestoneColorTokens, type Milestone } from "../../lib/milestones";
import type { Project } from "../../lib/projects";

export function MilestonePanel({ milestones, project, today, onCreate, onEdit }: { milestones: Milestone[]; project: Project; today: string; onCreate: () => void; onEdit: (milestone: Milestone) => void }) {
  const open = milestones.filter((milestone) => !milestone.completed);
  const overdue = open.filter((milestone) => milestone.dueDate < today).length;
  return <details className="milestone-panel">
    <summary><span aria-hidden="true">◆</span><strong>マイルストーン {milestones.length}件</strong><small>{overdue > 0 ? `期限超過 ${overdue}件` : open.length > 0 ? `予定 ${open.length}件` : "達成済み"}</small><span className="details-label">一覧を表示</span></summary>
    <header><div><p className="eyebrow">PROJECT MILESTONES</p><h2>マイルストーン</h2><span>{project.name} · {project.code}</span></div><button className="quiet-button" onClick={onCreate}>＋ マイルストーンを追加</button></header>
    {milestones.length === 0 ? <div className="milestone-empty"><span>◆</span><div><strong>節目となる日を登録しましょう</strong><small>リリースや承認日などを、このプロジェクトに紐づけて管理できます。</small></div></div> : <div className="milestone-list">{milestones.map((milestone) => {
      const overdue = !milestone.completed && milestone.dueDate < today;
      return <button key={milestone.id} className={overdue ? "overdue" : ""} onClick={() => onEdit(milestone)}><span className={`milestone-mark ${milestone.completed ? "completed" : ""}`} style={{ color: milestoneColorTokens(milestone.color).solid }} aria-hidden="true">◆</span><span className="milestone-main"><strong>{milestone.name}</strong><small>{milestone.projectName} · {milestone.projectCode}</small></span><span className="milestone-state">{milestone.completed ? "達成済み" : overdue ? "期限超過" : "予定"}</span><time dateTime={milestone.dueDate}>{formatDate(milestone.dueDate)}</time></button>;
    })}</div>}
  </details>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`)); }
