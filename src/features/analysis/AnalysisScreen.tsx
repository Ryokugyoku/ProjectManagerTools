import { useMemo, useState } from "react";
import type { Project } from "../../lib/projects";
import type { WbsTask } from "../../lib/wbs";
import { buildBurndownSeries, buildDependencyAnalysis, buildDependencyScope, currentRemainingEffort, summarizeProgressHealth } from "../../lib/wbsAnalysis";
import { isTaskDelayed, progressHealth } from "../../lib/wbsPlanning";

type Chart = "critical" | "burndown" | "health";

export function AnalysisScreen({ projects, tasks, today, loading }: { projects: Project[]; tasks: WbsTask[]; today: string; loading: boolean }) {
  const availableProjects = projects.filter((project) => tasks.some((task) => task.projectId === project.id));
  const [projectId, setProjectId] = useState<number | null>(availableProjects[0]?.id ?? null);
  const [chart, setChart] = useState<Chart>("critical");
  const selectedProjectId = availableProjects.some((project) => project.id === projectId) ? projectId : availableProjects[0]?.id ?? null;
  const project = projects.find((item) => item.id === selectedProjectId) ?? null;
  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === selectedProjectId), [selectedProjectId, tasks]);
  const rootTasks = useMemo(() => buildDependencyScope(projectTasks, null).tasks, [projectTasks]);
  const analysis = useMemo(() => buildDependencyAnalysis(rootTasks), [rootTasks]);

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
        {chart === "critical" ? <CriticalPathChart key={project.id} tasks={projectTasks} projectName={project.name} today={today} /> : chart === "burndown" ? <BurndownChart tasks={projectTasks} today={today} /> : <HealthChart tasks={projectTasks} today={today} />}
      </section>
    </>}
  </main>;
}

function CriticalPathChart({ tasks, projectName, today }: { tasks: WbsTask[]; projectName: string; today: string }) {
  const [scopeTaskId, setScopeTaskId] = useState<number | null>(null);
  const scope = buildDependencyScope(tasks, scopeTaskId);
  const analysis = buildDependencyAnalysis(scope.tasks);
  const childCounts = new Map<number, number>();
  for (const task of tasks) if (task.parentTaskId !== null) childCounts.set(task.parentTaskId, (childCounts.get(task.parentTaskId) ?? 0) + 1);
  const delayedTaskId = analysis.nodes.find((node) => isTaskDelayed(node.task, today))?.task.id ?? null;
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(delayedTaskId ?? analysis.criticalTaskIds[0] ?? analysis.nodes[0]?.task.id ?? null);
  if (analysis.nodes.length === 0) return <ChartEmpty title="表示するタスクがありません" description="この階層へサブタスクを追加してください。" />;
  const layers = new Map<number, typeof analysis.nodes>();
  for (const node of analysis.nodes) layers.set(node.layer, [...(layers.get(node.layer) ?? []), node]);
  const maxRows = Math.max(...[...layers.values()].map((items) => items.length));
  const nodeWidth = 184;
  const nodeHeight = 90;
  const layerCount = Math.max(1, layers.size);
  const horizontalInset = 84;
  const width = Math.max(1080, horizontalInset * 2 + nodeWidth * layerCount + Math.max(0, layerCount - 1) * 76);
  const height = Math.max(360, maxRows * 112 + 112);
  const horizontalGap = layerCount === 1 ? 0 : (width - horizontalInset * 2 - nodeWidth) / (layerCount - 1);
  const positions = new Map<number, { x: number; y: number }>();
  for (const [layer, nodes] of layers) {
    const groupHeight = nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * 36;
    const startY = 68 + (height - 88 - groupHeight) / 2;
    nodes.forEach((node, index) => positions.set(node.task.id, {
      x: layerCount === 1 ? (width - nodeWidth) / 2 : horizontalInset + layer * horizontalGap,
      y: startY + index * (nodeHeight + 36),
    }));
  }
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
  const impactedEdges = new Set(analysis.edges.filter((edge) => affectedIds.has(edge.from) && analysis.nodes.find((node) => node.task.id === edge.to)?.task.status !== "completed").map((edge) => `${edge.from}-${edge.to}`));
  const selectedNode = analysis.nodes.find((node) => node.task.id === selectedTaskId) ?? analysis.nodes.find((node) => node.task.id === delayedTaskId) ?? analysis.nodes[0];
  const selectedState = networkNodeState(selectedNode, delayedIds, affectedIds, today);
  const selectedReason = selectedNode.task.latestDelayReason?.trim() || "遅延理由はまだ記録されていません。";
  const selectedChildCount = childCounts.get(selectedNode.task.id) ?? 0;
  const openScope = (taskId: number) => { setScopeTaskId(taskId); setSelectedTaskId(null); };
  return <div className="chart-layout network-layout"><div className="chart-heading"><div><p className="eyebrow">DEPENDENCY NETWORK</p><h2>{scope.parentTask ? `${scope.parentTask.title} の内部工程` : `${projectName} の親タスク依存関係`}</h2></div><div className="chart-key"><span><i className="delay" />遅延・影響</span><span><i className="completed" />完了</span><span><i className="ahead" />前倒し</span><span><i className="critical" />クリティカル</span></div></div>
    <nav className="network-breadcrumbs" aria-label="アローダイアグラムの現在階層"><button type="button" onClick={() => { setScopeTaskId(null); setSelectedTaskId(null); }}>{projectName}</button>{scope.breadcrumbs.map((task, index) => <span key={task.id}><i aria-hidden="true">›</i>{index === scope.breadcrumbs.length - 1 ? <strong aria-current="page">{task.title}</strong> : <button type="button" onClick={() => { setScopeTaskId(task.id); setSelectedTaskId(null); }}>{task.title}</button>}</span>)}</nav>
    {analysis.hasCycle && <p className="chart-warning" role="alert">循環する依存関係が含まれるため、経路計算は参考値です。</p>}
    <div className={`network-inspector ${selectedState.className}`} aria-live="polite"><div className="inspector-title"><span><i />{selectedState.label}</span><strong>{selectedNode.task.title}</strong></div><dl><div><dt>期間</dt><dd>{selectedNode.task.businessDays}営業日</dd></div><div><dt>進捗</dt><dd>{selectedNode.task.progress}%</dd></div><div><dt>余裕</dt><dd>{selectedNode.totalFloat}日</dd></div></dl>{(selectedChildCount > 0 || selectedState.key === "delay") && <div className="inspector-context">{selectedChildCount > 0 && <button className="scope-open-button" type="button" onClick={() => openScope(selectedNode.task.id)}>内部のダイアグラムを表示 <span>{selectedChildCount}件</span></button>}{selectedState.key === "delay" && <p><span>遅延理由</span>{selectedReason}</p>}</div>}</div>
    <div className="dependency-chart"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="critical-title critical-desc"><title id="critical-title">クリティカルパスの依存ネットワーク</title><desc id="critical-desc">タスクを工程ごとに配置し、依存関係と遅延の伝播を線で示します。ノードを選択すると詳細を確認できます。</desc>
      <defs><pattern id="network-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" /></pattern><filter id="edge-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter><marker id="arrow-normal" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker><marker id="arrow-critical" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker><marker id="arrow-delay" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
      <rect className="network-grid" width={width} height={height} />
      {[...layers.keys()].map((layer) => { const x = layerCount === 1 ? width / 2 : horizontalInset + layer * horizontalGap + nodeWidth / 2; return <g className="network-stage" key={layer}><text x={x} y="28" textAnchor="middle">STAGE {String(layer + 1).padStart(2, "0")}</text><line x1={x} y1="42" x2={x} y2={height - 26} /></g>; })}
      {analysis.edges.map((edge) => { const from = positions.get(edge.from)!; const to = positions.get(edge.to)!; const impacted = impactedEdges.has(`${edge.from}-${edge.to}`); const className = impacted ? "delay-impact-edge" : edge.critical ? "critical-edge" : "dependency-edge"; const startX = from.x + nodeWidth + 7; const startY = from.y + nodeHeight / 2; const endX = to.x - 10; const endY = to.y + nodeHeight / 2; const bend = Math.max(54, (endX - startX) * .46); const path = `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`; return <g key={`${edge.from}-${edge.to}`} className={`network-edge ${className}`}><path className="edge-aura" d={path} /><path className="edge-line" markerEnd={`url(#arrow-${impacted ? "delay" : edge.critical ? "critical" : "normal"})`} d={path} /></g>; })}
      {analysis.nodes.map((node, index) => { const point = positions.get(node.task.id)!; const visual = networkNodeState(node, delayedIds, affectedIds, today); const selected = node.task.id === selectedNode.task.id; const childCount = childCounts.get(node.task.id) ?? 0; const activate = () => childCount > 0 ? openScope(node.task.id) : setSelectedTaskId(node.task.id); return <g key={node.task.id} className={`network-node ${visual.className}${childCount > 0 ? " has-children" : ""}${selected ? " selected" : ""}`} transform={`translate(${point.x} ${point.y})`} tabIndex={0} role="button" onClick={activate} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }} aria-pressed={childCount === 0 ? selected : undefined} aria-label={`${node.task.title}、${visual.label}、進捗${node.task.progress}%、${node.task.businessDays}営業日、余裕${node.totalFloat}日${childCount > 0 ? `、サブタスク${childCount}件。押すと内部のアローダイアグラムを表示` : ""}`}><rect className="node-halo" x="-4" y="-4" width={nodeWidth + 8} height={nodeHeight + 8} rx="18" /><rect className="node-surface" width={nodeWidth} height={nodeHeight} rx="14" />{childCount > 0 && <rect className="node-scope-frame" x="7" y="7" width={nodeWidth - 14} height={nodeHeight - 14} rx="10" />}<circle className="node-status" cx="18" cy="19" r="5" /><text className="node-order" x={nodeWidth - 14} y="22" textAnchor="end">{String(index + 1).padStart(2, "0")}</text><text className="node-title" x="31" y="23">{truncate(node.task.title, 15)}</text><g className="node-chip" transform="translate(14 38)"><rect width="72" height="23" rx="11.5" /><text x="36" y="15" textAnchor="middle">{visual.label}</text></g><text className="node-metrics" x={nodeWidth - 14} y="53" textAnchor="end">{node.task.progress}% · {node.task.businessDays}d</text><text className="node-scope-label" x={nodeWidth - 14} y="77" textAnchor="end">{childCount > 0 ? `子タスク ${childCount}件  ›` : "末端タスク"}</text><circle className="node-port input" cx="-1" cy={nodeHeight / 2} r="3.5" /><circle className="node-port output" cx={nodeWidth + 1} cy={nodeHeight / 2} r="3.5" /></g>; })}
    </svg></div>
    <p className="chart-note">現在の階層にある直属タスク同士の完了前提を表示しています。子タスクを持つ大枠を押すと内部工程へ移動し、パンくずから上位階層へ戻れます。</p>
  </div>;
}

type NetworkNodeState = { key: "delay" | "completed" | "ahead" | "affected" | "critical" | "normal"; label: string; className: string };

function networkNodeState(node: ReturnType<typeof buildDependencyAnalysis>["nodes"][number], delayedIds: Set<number>, affectedIds: Set<number>, today: string): NetworkNodeState {
  if (delayedIds.has(node.task.id)) return { key: "delay", label: "遅延", className: "delay-node" };
  if (node.task.status === "completed") return { key: "completed", label: "完了", className: "completed-node" };
  if (node.task.finalized && progressHealth(node.task, today) === "ahead") return { key: "ahead", label: "前倒し", className: "ahead-node" };
  if (affectedIds.has(node.task.id)) return { key: "affected", label: "遅延影響", className: "delay-affected-node" };
  if (node.critical) return { key: "critical", label: "クリティカル", className: "critical-node" };
  return { key: "normal", label: "余裕あり", className: "dependency-node" };
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
