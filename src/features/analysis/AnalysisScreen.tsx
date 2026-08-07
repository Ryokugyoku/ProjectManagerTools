import { useMemo, useState } from "react";
import type { Project } from "../../lib/projects";
import type { WbsTask } from "../../lib/wbs";
import { buildBurndownSeries, buildDependencyAnalysis, currentRemainingEffort, summarizeProgressHealth } from "../../lib/wbsAnalysis";
import { isTaskDelayed, progressHealth } from "../../lib/wbsPlanning";

type Chart = "critical" | "burndown" | "health";

export function AnalysisScreen({ projects, tasks, today, loading }: { projects: Project[]; tasks: WbsTask[]; today: string; loading: boolean }) {
  const availableProjects = projects.filter((project) => tasks.some((task) => task.projectId === project.id));
  const [projectId, setProjectId] = useState<number | null>(availableProjects[0]?.id ?? null);
  const [chart, setChart] = useState<Chart>("critical");
  const selectedProjectId = availableProjects.some((project) => project.id === projectId) ? projectId : availableProjects[0]?.id ?? null;
  const project = projects.find((item) => item.id === selectedProjectId) ?? null;
  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === selectedProjectId), [selectedProjectId, tasks]);
  const analysis = useMemo(() => buildDependencyAnalysis(projectTasks), [projectTasks]);

  return <main className="analysis-screen screen-shell">
    <header className="screen-header analysis-header"><div><p className="eyebrow">PROJECT ANALYTICS</p><h1>案件分析</h1><p>依存関係と進捗から、遅延の連鎖と完了までのボトルネックを確認します。</p></div>
      {availableProjects.length > 0 && <label>分析対象<select aria-label="分析対象の案件" value={selectedProjectId ?? ""} onChange={(event) => setProjectId(Number(event.currentTarget.value))}>{availableProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </header>
    {loading ? <div className="loading-card">分析データを読み込んでいます…</div> : !project ? <section className="analysis-empty"><span>⌁</span><h2>分析できる案件がありません</h2><p>案件にWBSを追加すると、依存関係と進捗を分析できます。</p></section> : <>
      <section className="analysis-kpis" aria-label={`${project.name}の分析概要`}>
        <div><span>タスク</span><strong>{projectTasks.length}</strong><small>{analysis.edges.length}件の依存関係</small></div>
        <div><span>クリティカル</span><strong>{analysis.criticalTaskIds.length}</strong><small>遅延余裕 0日のタスク</small></div>
        <div><span>最短完了</span><strong>{analysis.projectDuration}<em>日</em></strong><small>依存順・営業日数から算出</small></div>
      </section>
      <div className="chart-switch" role="tablist" aria-label="分析チャート">
        <button role="tab" aria-selected={chart === "critical"} className={chart === "critical" ? "active" : ""} onClick={() => setChart("critical")}>クリティカルパス</button>
        <button role="tab" aria-selected={chart === "burndown"} className={chart === "burndown" ? "active" : ""} onClick={() => setChart("burndown")}>バーンダウン</button>
        <button role="tab" aria-selected={chart === "health"} className={chart === "health" ? "active" : ""} onClick={() => setChart("health")}>進捗健全性</button>
      </div>
      <section className="analysis-workspace" role="tabpanel">
        {chart === "critical" ? <CriticalPathChart analysis={analysis} today={today} /> : chart === "burndown" ? <BurndownChart tasks={projectTasks} today={today} /> : <HealthChart tasks={projectTasks} today={today} />}
      </section>
    </>}
  </main>;
}

function CriticalPathChart({ analysis, today }: { analysis: ReturnType<typeof buildDependencyAnalysis>; today: string }) {
  if (analysis.nodes.length === 0) return <ChartEmpty title="表示するタスクがありません" description="WBSへタスクを追加してください。" />;
  const layers = new Map<number, typeof analysis.nodes>();
  for (const node of analysis.nodes) layers.set(node.layer, [...(layers.get(node.layer) ?? []), node]);
  const maxRows = Math.max(...[...layers.values()].map((items) => items.length));
  const width = Math.max(760, (layers.size - 1) * 210 + 190);
  const height = Math.max(260, maxRows * 92 + 40);
  const positions = new Map<number, { x: number; y: number }>();
  for (const [layer, nodes] of layers) nodes.forEach((node, index) => positions.set(node.task.id, { x: 30 + layer * 210, y: 24 + index * 92 }));
  const delayedIds = new Set(analysis.nodes.filter((node) => isTaskDelayed(node.task, today)).map((node) => node.task.id));
  const affectedIds = new Set(delayedIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of analysis.edges) {
      const from = analysis.nodes.find((node) => node.task.id === edge.from)?.task;
      const to = analysis.nodes.find((node) => node.task.id === edge.to)?.task;
      if (from?.status !== "completed" && to?.status !== "completed" && affectedIds.has(edge.from) && !affectedIds.has(edge.to)) { affectedIds.add(edge.to); expanded = true; }
    }
  }
  const impactedEdges = new Set(analysis.edges.filter((edge) => affectedIds.has(edge.from)).map((edge) => `${edge.from}-${edge.to}`));
  return <div className="chart-layout"><div className="chart-heading"><div><p className="eyebrow">DEPENDENCY NETWORK</p><h2>遅れると完了日へ直結する流れ</h2></div><div className="chart-key"><span><i className="delay" />遅延・影響</span><span><i className="completed" />完了</span><span><i className="ahead" />前倒し</span><span><i className="critical" />クリティカル</span></div></div>
    {analysis.hasCycle && <p className="chart-warning" role="alert">循環する依存関係が含まれるため、経路計算は参考値です。</p>}
    <div className="dependency-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="critical-title critical-desc"><title id="critical-title">クリティカルパスのアローダイアグラム</title><desc id="critical-desc">赤いタスクと矢印は遅延余裕がなく、案件完了日に直結します。</desc>
      <defs><marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker><marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker><marker id="arrow-delay" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
      {analysis.edges.map((edge) => { const from = positions.get(edge.from)!; const to = positions.get(edge.to)!; const impacted = impactedEdges.has(`${edge.from}-${edge.to}`); return <path key={`${edge.from}-${edge.to}`} className={impacted ? "delay-impact-edge" : edge.critical ? "critical-edge" : "dependency-edge"} markerEnd={`url(#arrow-${impacted ? "delay" : edge.critical ? "critical" : "normal"})`} d={`M ${from.x + 160} ${from.y + 28} C ${from.x + 182} ${from.y + 28}, ${to.x - 22} ${to.y + 28}, ${to.x} ${to.y + 28}`} />; })}
      {analysis.nodes.map((node) => { const point = positions.get(node.task.id)!; const delayed = delayedIds.has(node.task.id); const completed = node.task.status === "completed"; const ahead = !completed && node.task.finalized && progressHealth(node.task, today) === "ahead"; const affected = !delayed && !completed && affectedIds.has(node.task.id); const reason = node.task.latestDelayReason?.trim() || "遅延理由は未記録です"; const className = delayed ? "delay-node" : completed ? "completed-node" : ahead ? "ahead-node" : affected ? "delay-affected-node" : node.critical ? "critical-node" : "dependency-node"; const state = delayed ? "遅延発生" : completed ? "完了" : ahead ? "前倒し" : affected ? "遅延影響あり" : `${node.task.businessDays}日 · 余裕 ${node.totalFloat}日`; return <g key={node.task.id} className={className} transform={`translate(${point.x} ${point.y})`} tabIndex={0} role="group" aria-label={`${node.task.title}、${state}、${node.task.businessDays}営業日、余裕${node.totalFloat}日${delayed ? `、遅延理由：${reason}` : ""}`}><rect width="160" height="58" rx="10" /><text x="12" y="23">{truncate(node.task.title, 14)}</text><text className="node-meta" x="12" y="43">{state}</text>{delayed && <g className="delay-callout" transform="translate(8 -20)"><rect width="184" height="22" rx="7" /><text x="8" y="15">{truncate(reason, 23)}</text></g>}</g>; })}
    </svg></div>
    <p className="chart-note">算出根拠：登録済みの営業日数と完了前提。赤は現在の遅延起点から影響を受ける後続経路、緑は遅延余裕0日のクリティカル経路です。</p>
  </div>;
}

function BurndownChart({ tasks, today }: { tasks: WbsTask[]; today: string }) {
  const points = buildBurndownSeries(tasks, today);
  if (points.length === 0) return <ChartEmpty title="バーンダウンを作成できません" description="日程を持つタスクを追加してください。" />;
  const max = Math.max(1, points[0].plannedRemaining, currentRemainingEffort(tasks));
  const plot = points.map((point, index) => `${40 + index * (700 / Math.max(1, points.length - 1))},${30 + (1 - point.plannedRemaining / max) * 210}`).join(" ");
  const todayIndex = Math.max(0, points.findIndex((point) => point.date >= today));
  const actualX = 40 + todayIndex * (700 / Math.max(1, points.length - 1));
  const actualY = 30 + (1 - currentRemainingEffort(tasks) / max) * 210;
  return <div className="chart-layout"><div className="chart-heading"><div><p className="eyebrow">BURNDOWN</p><h2>残作業量の計画と現在地</h2></div><strong className="chart-value">残り {currentRemainingEffort(tasks)}<small>人日相当</small></strong></div>
    <div className="burndown-chart"><svg viewBox="0 0 780 280" role="img" aria-label={`計画バーンダウン。現在の残作業量は${currentRemainingEffort(tasks)}人日相当`}><line x1="40" y1="240" x2="750" y2="240" /><line x1="40" y1="30" x2="40" y2="240" /><polyline className="planned-line" points={plot} /><line className="today-line" x1={actualX} y1="30" x2={actualX} y2="240" /><circle className="actual-point" cx={actualX} cy={actualY} r="7" /><text x="42" y="22">{max.toFixed(1)}</text><text x="42" y="260">{points[0].date.slice(5)}</text><text x="690" y="260">{points[points.length - 1]?.date.slice(5)}</text><text className="actual-label" x={Math.min(650, actualX + 12)} y={Math.max(28, actualY - 10)}>現在 {currentRemainingEffort(tasks)}</text></svg></div>
    <p className="chart-note">線は計画上の残作業量、点は各末端タスクの現在進捗から算出した現在地です。過去時点の実績推移ではありません。</p></div>;
}

function HealthChart({ tasks, today }: { tasks: WbsTask[]; today: string }) {
  const health = summarizeProgressHealth(tasks, today);
  const total = Math.max(1, health.ahead + health.onTrack + health.behind + health.draft);
  const rows = [{ label: "前倒し", value: health.ahead, type: "ahead" }, { label: "計画どおり", value: health.onTrack, type: "track" }, { label: "遅延", value: health.behind, type: "behind" }, { label: "編集中", value: health.draft, type: "draft" }];
  return <div className="chart-layout"><div className="chart-heading"><div><p className="eyebrow">PROGRESS HEALTH</p><h2>今、手当てが必要なタスク</h2></div><strong className="chart-value alert-value">{health.behind}<small>遅延タスク</small></strong></div><div className="health-chart" role="img" aria-label={`前倒し${health.ahead}件、計画どおり${health.onTrack}件、遅延${health.behind}件、編集中${health.draft}件`}><div className="health-stack">{rows.map((row) => row.value > 0 && <span key={row.type} className={row.type} style={{ width: `${row.value / total * 100}%` }} />)}</div><div className="health-rows">{rows.map((row) => <div key={row.type}><span><i className={row.type} />{row.label}</span><strong>{row.value}<small>件</small></strong><div><span className={row.type} style={{ width: `${row.value / total * 100}%` }} /></div></div>)}</div></div><p className="chart-note">確定済み未完了タスクは、今日時点の計画累積率と実績率を比較しています。編集中は別枠です。</p></div>;
}

function ChartEmpty({ title, description }: { title: string; description: string }) { return <div className="chart-empty"><span>⌁</span><strong>{title}</strong><p>{description}</p></div>; }
function truncate(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
