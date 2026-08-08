import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCalendarDays, calculateEndDate, formatISODate, holidayName, isBusinessDay,
  parseISODate, shiftBusinessDate,
} from "../../lib/calendar";
import type { Project } from "../../lib/projects";
import { milestoneColorTokens, type Milestone } from "../../lib/milestones";
import type { UserProfile, WbsTask } from "../../lib/wbs";
import { currentDayCheckpoint, expectedProgress, progressHealth } from "../../lib/wbsPlanning";
import { buildTimelineDateRange, buildTimelineMonths, buildWbsGroups, dailyProgressActionLabel, flattenWbsTaskTree, type WbsGroupBy } from "../../lib/wbsView";
import { summarizeLeaveApprovals } from "../../lib/leaveApprovals";

const DAY_WIDTH = 42;

type Schedule = { plannedStart: string; plannedEnd: string; businessDays: number };
type DragSession = {
  task: WbsTask;
  mode: "move" | "left" | "right";
  startX: number;
  delta: number;
  preview: Schedule;
  element: HTMLElement;
  originalLeft: string;
  originalWidth: string;
};
type ContextMenuState = { task: WbsTask; x: number; y: number };

export function TimelineBoard({ tasks, allTasks = tasks, milestones, users, projects, groupBy, countryCode, pastMissingTaskIds = new Set(), onEdit, onCreateSubtask, onShowHistory, onRecordProgress, onSelectMilestone, onScheduleChange }: {
  tasks: WbsTask[];
  allTasks?: WbsTask[];
  milestones: Milestone[];
  users: UserProfile[];
  projects: Project[];
  groupBy: WbsGroupBy;
  countryCode: string;
  pastMissingTaskIds?: Set<number>;
  onEdit: (task: WbsTask) => void;
  onCreateSubtask: (task: WbsTask) => void;
  onShowHistory: (task: WbsTask) => void;
  onRecordProgress: (task: WbsTask) => void;
  onSelectMilestone: (milestone: Milestone) => void;
  onScheduleChange: (task: WbsTask, schedule: Schedule) => Promise<void>;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [visibleMonth, setVisibleMonth] = useState("");
  const didDrag = useRef(false);
  const dragRef = useRef<DragSession | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const today = formatISODate(new Date());
  const range = useMemo(() => buildTimelineDateRange(tasks, milestones, today), [milestones, tasks, today]);
  const dates = useMemo(() => Array.from({ length: range.days }, (_, index) => addCalendarDays(range.start, index)), [range]);
  const months = useMemo(() => buildTimelineMonths(dates), [dates]);
  const milestonesByDate = useMemo(() => {
    const result = new Map<string, Milestone[]>();
    for (const milestone of milestones) result.set(milestone.dueDate, [...(result.get(milestone.dueDate) ?? []), milestone]);
    return result;
  }, [milestones]);
  const groups = useMemo(() => buildWbsGroups(tasks, groupBy, projects, users), [users, groupBy, projects, tasks]);
  const timelineBackground = useMemo(
    () => buildTimelineBackground(dates, countryCode, milestonesByDate, today),
    [countryCode, dates, milestonesByDate, today],
  );

  function scrollByDays(days: number) {
    scrollRef.current?.scrollBy({ left: days * DAY_WIDTH, behavior: "smooth" });
  }

  function scrollToDate(date: string) {
    const left = Math.max(0, dayDifference(range.start, date) * DAY_WIDTH - 420);
    scrollRef.current?.scrollTo({ left, behavior: "smooth" });
  }

  function updateVisibleMonthNow() {
    const index = Math.min(dates.length - 1, Math.max(0, Math.floor((scrollRef.current?.scrollLeft ?? 0) / DAY_WIDTH)));
    const parsed = parseISODate(dates[index] ?? range.start);
    setVisibleMonth(`${parsed.getFullYear()}年${parsed.getMonth() + 1}月`);
  }

  function updateVisibleMonth() {
    setContextMenu(null);
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateVisibleMonthNow();
    });
  }

  function openContextMenu(event: React.MouseEvent | React.KeyboardEvent, task: WbsTask) {
    event.preventDefault();
    const keyboard = "key" in event;
    const rect = event.currentTarget.getBoundingClientRect();
    const sourceX = keyboard ? rect.left + 24 : event.clientX;
    const sourceY = keyboard ? rect.top + 24 : event.clientY;
    setContextMenu({
      task,
      x: Math.min(sourceX, window.innerWidth - 220),
      y: Math.min(sourceY, window.innerHeight - 190),
    });
  }

  useEffect(() => { updateVisibleMonthNow(); }, [range.start]);

  useEffect(() => {
    if (!contextMenu) return;
    function close(event: PointerEvent) {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", keydown);
    requestAnimationFrame(() => contextMenuRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", keydown); };
  }, [contextMenu]);

  useEffect(() => {
    function restoreDragElement(current: DragSession) {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      current.element.classList.remove("dragging");
      current.element.style.left = current.originalLeft;
      current.element.style.width = current.originalWidth;
    }

    function move(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const delta = Math.round((event.clientX - current.startX) / DAY_WIDTH);
      if (delta === current.delta) return;
      if (delta !== 0) didDrag.current = true;
      const source = current.task;
      let plannedStart = source.plannedStart;
      let businessDays = source.businessDays;
      if (current.mode === "move") {
        plannedStart = shiftBusinessDate(source.plannedStart, delta, countryCode);
      } else if (current.mode === "right") {
        businessDays = Math.max(1, source.businessDays + delta);
      } else {
        businessDays = Math.max(1, source.businessDays - delta);
        plannedStart = shiftBusinessDate(source.plannedStart, source.businessDays - businessDays, countryCode);
      }
      current.delta = delta;
      current.preview = { plannedStart, businessDays, plannedEnd: calculateEndDate(plannedStart, businessDays, countryCode) };
      if (dragFrameRef.current !== null) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const latest = dragRef.current;
        if (!latest) return;
        latest.element.style.left = `${dayDifference(range.start, latest.preview.plannedStart) * DAY_WIDTH}px`;
        latest.element.style.width = `${Math.max(DAY_WIDTH, (dayDifference(latest.preview.plannedStart, latest.preview.plannedEnd) + 1) * DAY_WIDTH)}px`;
      });
    }
    function end() {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      restoreDragElement(current);
      if (current && (current.preview.plannedStart !== current.task.plannedStart || current.preview.businessDays !== current.task.businessDays)) {
        void onScheduleChange(current.task, current.preview);
      }
    }
    function cancel() {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      restoreDragElement(current);
      didDrag.current = false;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (dragRef.current) restoreDragElement(dragRef.current);
      dragRef.current = null;
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [countryCode, onScheduleChange, range.start]);

  function begin(event: React.PointerEvent, task: WbsTask, mode: DragSession["mode"]) {
    event.preventDefault();
    didDrag.current = false;
    const element = event.currentTarget.closest<HTMLElement>(".timeline-bar");
    if (!element) return;
    const session: DragSession = {
      task,
      mode,
      startX: event.clientX,
      delta: 0,
      preview: { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, businessDays: task.businessDays },
      element,
      originalLeft: element.style.left,
      originalWidth: element.style.width,
    };
    dragRef.current = session;
    element.classList.add("dragging");
  }

  async function clickDuration(task: WbsTask, amount: number) {
    if (didDrag.current) { didDrag.current = false; return; }
    const businessDays = Math.max(1, task.businessDays + amount);
    await onScheduleChange(task, {
      plannedStart: task.plannedStart,
      businessDays,
      plannedEnd: calculateEndDate(task.plannedStart, businessDays, countryCode),
    });
  }

  async function keyboardAdjust(event: React.KeyboardEvent, task: WbsTask, mode: DragSession["mode"]) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    let plannedStart = task.plannedStart;
    let businessDays = task.businessDays;
    if (mode === "move") plannedStart = shiftBusinessDate(task.plannedStart, delta, countryCode);
    else if (mode === "right") businessDays = Math.max(1, task.businessDays + delta);
    else {
      businessDays = Math.max(1, task.businessDays - delta);
      plannedStart = shiftBusinessDate(task.plannedStart, task.businessDays - businessDays, countryCode);
    }
    await onScheduleChange(task, { plannedStart, businessDays, plannedEnd: calculateEndDate(plannedStart, businessDays, countryCode) });
  }

  return <section className="roadmap-card" aria-label="WBSロードマップ">
    <div className="roadmap-toolbar">
      <div><strong>ロードマップ</strong><span>{groupBy === "project" ? "案件" : "責任者"}ごとに表示</span><span className="visible-month" aria-live="polite">表示中：{visibleMonth}</span></div>
      <div className="range-controls" aria-label="時間軸の移動">
        <button aria-label="2週間前へ移動" onClick={() => scrollByDays(-14)}>‹ 2週間</button>
        <button onClick={() => scrollToDate(today)}>今日へ</button>
        <button aria-label="2週間後へ移動" onClick={() => scrollByDays(14)}>2週間 ›</button>
      </div>
    </div>
    <div className="roadmap-scroll" ref={scrollRef} tabIndex={0} aria-label="横スクロール可能なWBS時間軸" onScroll={updateVisibleMonth}>
      <div className="roadmap" style={{ "--timeline-width": `${range.days * DAY_WIDTH}px`, "--timeline-days": range.days } as React.CSSProperties}>
        <div className="roadmap-head info-columns"><span>WBS</span><span>状態</span><span>進捗</span></div>
        <div className="roadmap-head date-columns">
          <div className="month-bands">{months.map((month) => <div className="month-band" key={month.key} style={{ width: month.days * DAY_WIDTH }}><span>{month.label}</span></div>)}</div>
          <div className="day-headings">{dates.map((date) => <DayColumn key={date} date={date} countryCode={countryCode} milestones={milestonesByDate.get(date)} header onSelectMilestone={onSelectMilestone} />)}</div>
        </div>
        {groups.map((group) => <div className="roadmap-group" key={group.key}>
          <div className="group-heading"><span className="avatar">{group.initials}</span><strong>{group.label}</strong><small>{group.detail}</small><span className="group-count">{group.tasks.length}件</span></div>
          {flattenWbsTaskTree(group.tasks).map(({ task, depth }) => {
            const scheduleAssigned = task.scheduleAssigned !== false;
            const left = scheduleAssigned ? dayDifference(range.start, task.plannedStart) * DAY_WIDTH : 0;
            const width = scheduleAssigned ? Math.max(DAY_WIDTH, (dayDifference(task.plannedStart, task.plannedEnd) + 1) * DAY_WIDTH) : 0;
            const hasChildren = allTasks.some((candidate) => candidate.parentTaskId === task.id);
            const plannedProgress = expectedProgress(task, today, currentDayCheckpoint());
            const health = progressHealth(task, today);
            return <div className={`roadmap-row ${hasChildren ? "parent-task" : ""} ${!scheduleAssigned ? "schedule-unassigned" : ""}`} key={task.id} onContextMenu={(event) => openContextMenu(event, task)} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openContextMenu(event, task); }}>
              <button className="task-info" style={{ "--task-depth": depth } as React.CSSProperties} onClick={() => onEdit(task)} aria-label={`${task.title}を編集`}>
                <span className="task-title-line"><strong>{depth > 0 && <span className="task-branch" aria-hidden="true">↳</span>}{task.title}</strong></span>
                <small>{!scheduleAssigned ? "日程未割り当て" : task.finalized ? "確定" : "編集中"} · {task.parentTaskTitle ? `親: ${task.parentTaskTitle} · ` : ""}{task.ownerUserName ?? "責任者未設定"}</small>
              </button>
              <span className={`status-cell ${task.status}`}>{scheduleAssigned ? statusLabel(task.status) : "日程未設定"}</span>
              <span className={`progress-cell ${health}`} title={`${hasChildren ? "子タスクから自動集計" : "実績"} ${task.progress}% / 今日の予定 ${plannedProgress}%`}><strong>{task.progress}%</strong><small>{hasChildren ? "子から集計" : `予定 ${plannedProgress}%`}</small></span>
              <div className="timeline-cells" style={{ backgroundImage: timelineBackground }}>
                {(task.ownerLeaves ?? []).filter((leave) => leave.date >= range.start && leave.date <= range.end).map((leave) => {
                  const approval = summarizeLeaveApprovals(leave, today, countryCode);
                  const approvalText = approval.state === "complete" ? "承認済み" : approval.state === "urgent" ? "本日中に承認対応" : "承認待ち";
                  return <span key={leave.id} className={`task-leave-marker ${leave.unit} ${approval.state}`} style={{ left: dayDifference(range.start, leave.date) * DAY_WIDTH }} title={`${task.ownerUserName ?? "担当者"}：${leave.date} ${leaveUnitLabel(leave.unit)}（${leave.type === "planned" ? "計画休" : "計画外"}・${approvalText}）${leave.reason ? ` ${leave.reason}` : ""}`} aria-label={`${task.ownerUserName ?? "担当者"}は${leave.date}に${leaveUnitLabel(leave.unit)}、${approvalText}`}><i aria-hidden="true">{approval.state === "urgent" ? "!" : leave.unit === "full_day" ? "休" : leave.unit === "morning" ? "午" : "後"}</i></span>;
                })}
                {!scheduleAssigned ? <button type="button" className="schedule-assignment-callout" onClick={() => onEdit(task)} aria-label={`${task.title}の日程を入力する`}><strong>日程を入力</strong><span>開始予定日と営業日数が未設定です</span></button> : <div className={`timeline-bar ${task.status} ${health} ${hasChildren ? "has-children" : ""}`} style={{ left, width }}>
                  <button className="resize-handle left" aria-label={`${task.title}の営業日数を1日減らす。ドラッグで開始側を調整`} onPointerDown={(event) => begin(event, task, "left")} onClick={() => void clickDuration(task, -1)} onKeyDown={(event) => void keyboardAdjust(event, task, "left")}>−</button>
                  <button className="bar-body" title={`実績 ${task.progress}% / 今日の予定 ${plannedProgress}%（点線）`} onPointerDown={(event) => begin(event, task, "move")} onKeyDown={(event) => void keyboardAdjust(event, task, "move")}><i className="actual-progress" style={{ width: `${task.progress}%` }} /><i className="planned-progress" style={{ left: `${plannedProgress}%` }} /><span>{task.title} · {task.progress}%</span></button>
                  <button className="resize-handle right" aria-label={`${task.title}の営業日数を1日増やす。ドラッグで終了側を調整`} onPointerDown={(event) => begin(event, task, "right")} onClick={() => void clickDuration(task, 1)} onKeyDown={(event) => void keyboardAdjust(event, task, "right")}>＋</button>
                </div>}
              </div>
            </div>;
          })}
        </div>)}
      </div>
    </div>
    <div className="roadmap-help"><strong>横にスクロールして期間を確認</strong><span>中央をドラッグ：開始日を移動</span><span>左右端をドラッグ：営業日数を変更</span><span>← → キーでも調整可能</span></div>
    {contextMenu && <div className="task-context-menu" ref={contextMenuRef} role="menu" aria-label={`${contextMenu.task.title}の操作`} style={{ left: contextMenu.x, top: contextMenu.y }}>
      <button role="menuitem" onClick={() => { const task = contextMenu.task; setContextMenu(null); onEdit(task); }}>タスクを編集</button>
      {dailyProgressActionLabel(contextMenu.task, allTasks.some((candidate) => candidate.parentTaskId === contextMenu.task.id), pastMissingTaskIds.has(contextMenu.task.id)) && <button role="menuitem" onClick={() => { const task = contextMenu.task; setContextMenu(null); onRecordProgress(task); }}>{dailyProgressActionLabel(contextMenu.task, false, pastMissingTaskIds.has(contextMenu.task.id))}</button>}
      <button role="menuitem" onClick={() => { const task = contextMenu.task; setContextMenu(null); onShowHistory(task); }}>作業経緯を表示</button>
      <button role="menuitem" onClick={() => { const task = contextMenu.task; setContextMenu(null); onCreateSubtask(task); }}>＋ サブタスクを追加</button>
    </div>}
  </section>;
}

function DayColumn({ date, countryCode, milestones = [], header = false, onSelectMilestone }: { date: string; countryCode: string; milestones?: Milestone[]; header?: boolean; onSelectMilestone?: (milestone: Milestone) => void }) {
  const holiday = holidayName(date, countryCode);
  const business = isBusinessDay(date, countryCode);
  const parsed = parseISODate(date);
  const milestoneLabel = milestones.map((milestone) => milestone.name).join("、");
  const tokens = milestones.length > 0 ? milestoneColorTokens(milestones[0].color) : null;
  const style = tokens ? { "--milestone-fill": tokens.tint, "--milestone-edge": tokens.edge, "--milestone-solid": tokens.solid } as React.CSSProperties : undefined;
  return <div className={`timeline-day ${!business ? "off" : ""} ${date === formatISODate(new Date()) ? "current" : ""} ${milestones.length > 0 ? "milestone-column" : ""}`} style={style} title={milestoneLabel || holiday || (!business ? "休日" : date)}>
    {header && <><small>{parsed.toLocaleDateString("ja-JP", { weekday: "short" })}</small><strong>{parsed.getDate()}</strong>{holiday && <i>祝</i>}</>}
    {header && milestones.length > 0 && <button type="button" className="milestone-column-trigger" onClick={() => onSelectMilestone?.(milestones[0])} aria-label={`マイルストーン：${milestoneLabel}。詳細を開く`}>
      <span className="milestone-column-mark" aria-hidden="true">◆{milestones.length > 1 ? milestones.length : ""}</span>
      <span className="milestone-column-tooltip" role="tooltip">{milestones.map((milestone) => <span key={milestone.id}><i style={{ background: milestoneColorTokens(milestone.color).solid }} aria-hidden="true" /><b>{milestone.name}</b><time dateTime={milestone.dueDate}>{formatMilestoneDate(milestone.dueDate)}</time></span>)}</span>
    </button>}
  </div>;
}

function dayDifference(from: string, to: string) { return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000); }
function statusLabel(status: WbsTask["status"]) { return { not_started: "未着手", in_progress: "進行中", completed: "完了", on_hold: "保留" }[status]; }
function leaveUnitLabel(unit: "full_day" | "morning" | "afternoon") { return { full_day: "全休", morning: "午前半休", afternoon: "午後半休" }[unit]; }
function formatMilestoneDate(value: string) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(parseISODate(value)); }

function buildTimelineBackground(dates: string[], countryCode: string, milestonesByDate: Map<string, Milestone[]>, today: string) {
  const segments: { color: string; start: number; end: number }[] = [];
  for (const [index, date] of dates.entries()) {
    const milestone = milestonesByDate.get(date)?.[0];
    const color = milestone
      ? milestoneColorTokens(milestone.color).tint
      : date === today
        ? "rgba(121, 242, 166, .08)"
        : !isBusinessDay(date, countryCode)
          ? "rgba(232, 150, 140, .045)"
          : "transparent";
    const previous = segments[segments.length - 1];
    if (previous?.color === color) previous.end = index + 1;
    else segments.push({ color, start: index, end: index + 1 });
  }
  const fills = segments.flatMap(({ color, start, end }) => [
    `${color} ${start * DAY_WIDTH}px`,
    `${color} ${end * DAY_WIDTH}px`,
  ]).join(", ");
  return `repeating-linear-gradient(to right, transparent 0 ${DAY_WIDTH - 1}px, #242a27 ${DAY_WIDTH - 1}px ${DAY_WIDTH}px), linear-gradient(to right, ${fills})`;
}
