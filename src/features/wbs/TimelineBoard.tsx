import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCalendarDays, calculateEndDate, formatISODate, holidayName, isBusinessDay,
  parseISODate, shiftBusinessDate,
} from "../../lib/calendar";
import type { Project } from "../../lib/projects";
import type { Assignee, WbsTask } from "../../lib/wbs";
import { buildWbsGroups, flattenWbsTaskTree, type WbsGroupBy } from "../../lib/wbsView";

const DAY_WIDTH = 42;
const VISIBLE_DAYS = 35;

type Schedule = { plannedStart: string; plannedEnd: string; businessDays: number };
type DragState = {
  task: WbsTask; mode: "move" | "left" | "right"; startX: number; preview: Schedule;
};

export function TimelineBoard({ tasks, assignees, projects, groupBy, countryCode, selectedId, onSelect, onScheduleChange }: {
  tasks: WbsTask[];
  assignees: Assignee[];
  projects: Project[];
  groupBy: WbsGroupBy;
  countryCode: string;
  selectedId: number | null;
  onSelect: (task: WbsTask) => void;
  onScheduleChange: (task: WbsTask, schedule: Schedule) => Promise<void>;
}) {
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date()));
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDrag = useRef(false);
  const dates = useMemo(() => Array.from({ length: VISIBLE_DAYS }, (_, index) => addCalendarDays(rangeStart, index)), [rangeStart]);
  const groups = useMemo(() => buildWbsGroups(tasks, groupBy, projects, assignees), [assignees, groupBy, projects, tasks]);

  useEffect(() => {
    if (!drag) return;
    function move(event: PointerEvent) {
      const delta = Math.round((event.clientX - drag!.startX) / DAY_WIDTH);
      if (delta !== 0) didDrag.current = true;
      const source = drag!.task;
      let plannedStart = source.plannedStart;
      let businessDays = source.businessDays;
      if (drag!.mode === "move") {
        plannedStart = shiftBusinessDate(source.plannedStart, delta, countryCode);
      } else if (drag!.mode === "right") {
        businessDays = Math.max(1, source.businessDays + delta);
      } else {
        businessDays = Math.max(1, source.businessDays - delta);
        plannedStart = shiftBusinessDate(source.plannedStart, source.businessDays - businessDays, countryCode);
      }
      setDrag((current) => current ? { ...current, preview: { plannedStart, businessDays, plannedEnd: calculateEndDate(plannedStart, businessDays, countryCode) } } : null);
    }
    async function end() {
      const current = drag;
      setDrag(null);
      if (current && (current.preview.plannedStart !== current.task.plannedStart || current.preview.businessDays !== current.task.businessDays)) {
        await onScheduleChange(current.task, current.preview);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, [countryCode, drag, onScheduleChange]);

  function begin(event: React.PointerEvent, task: WbsTask, mode: DragState["mode"]) {
    event.preventDefault();
    didDrag.current = false;
    onSelect(task);
    setDrag({ task, mode, startX: event.clientX, preview: { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, businessDays: task.businessDays } });
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

  async function keyboardAdjust(event: React.KeyboardEvent, task: WbsTask, mode: DragState["mode"]) {
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
      <div><strong>ロードマップ</strong><span>{groupBy === "project" ? "案件" : "責任者"}ごとに表示</span></div>
      <div className="range-controls">
        <button aria-label="前の期間" onClick={() => setRangeStart(addCalendarDays(rangeStart, -14))}>‹</button>
        <button onClick={() => setRangeStart(startOfWeek(new Date()))}>今日</button>
        <button aria-label="次の期間" onClick={() => setRangeStart(addCalendarDays(rangeStart, 14))}>›</button>
      </div>
    </div>
    <div className="roadmap-scroll">
      <div className="roadmap" style={{ "--timeline-width": `${VISIBLE_DAYS * DAY_WIDTH}px` } as React.CSSProperties}>
        <div className="roadmap-head info-columns"><span>WBS</span><span>状態</span><span>進捗</span></div>
        <div className="roadmap-head date-columns">
          {dates.map((date) => <DayColumn key={date} date={date} countryCode={countryCode} header />)}
        </div>
        {groups.map((group) => <div className="roadmap-group" key={group.key}>
          <div className="group-heading"><span className="avatar">{group.initials}</span><strong>{group.label}</strong><small>{group.detail}</small><span className="group-count">{group.tasks.length}件</span></div>
          {flattenWbsTaskTree(group.tasks).map(({ task, depth }) => {
            const schedule = drag?.task.id === task.id ? drag.preview : task;
            const left = dayDifference(rangeStart, schedule.plannedStart) * DAY_WIDTH;
            const width = Math.max(DAY_WIDTH, (dayDifference(schedule.plannedStart, schedule.plannedEnd) + 1) * DAY_WIDTH);
            return <div className={`roadmap-row ${selectedId === task.id ? "selected" : ""}`} key={task.id}>
              <button className="task-info" style={{ "--task-depth": depth } as React.CSSProperties} onClick={() => onSelect(task)}><strong>{depth > 0 && <span className="task-branch" aria-hidden="true">↳</span>}{task.title}</strong><small>{task.parentTaskTitle ? `親: ${task.parentTaskTitle} · ` : ""}{task.assigneeName ?? "責任者未設定"}</small></button>
              <span className={`status-cell ${task.status}`}>{statusLabel(task.status)}</span>
              <span className="progress-cell">{task.progress}%</span>
              <div className="timeline-cells">{dates.map((date) => <DayColumn key={date} date={date} countryCode={countryCode} />)}
                <div className={`timeline-bar ${task.status} ${drag?.task.id === task.id ? "dragging" : ""}`} style={{ left, width }}>
                  <button className="resize-handle left" aria-label={`${task.title}の営業日数を1日減らす。ドラッグで開始側を調整`} onPointerDown={(event) => begin(event, task, "left")} onClick={() => void clickDuration(task, -1)} onKeyDown={(event) => void keyboardAdjust(event, task, "left")}>−</button>
                  <button className="bar-body" title="ドラッグで開始日を移動" onPointerDown={(event) => begin(event, task, "move")} onKeyDown={(event) => void keyboardAdjust(event, task, "move")}><i style={{ width: `${task.progress}%` }} /><span>{task.title}</span></button>
                  <button className="resize-handle right" aria-label={`${task.title}の営業日数を1日増やす。ドラッグで終了側を調整`} onPointerDown={(event) => begin(event, task, "right")} onClick={() => void clickDuration(task, 1)} onKeyDown={(event) => void keyboardAdjust(event, task, "right")}>＋</button>
                </div>
              </div>
            </div>;
          })}
        </div>)}
      </div>
    </div>
    <div className="roadmap-help"><span>中央をドラッグ：開始日を移動</span><span>左右端をドラッグ：営業日数を変更</span><span>← → キーでも調整可能</span></div>
  </section>;
}

function DayColumn({ date, countryCode, header = false }: { date: string; countryCode: string; header?: boolean }) {
  const holiday = holidayName(date, countryCode);
  const business = isBusinessDay(date, countryCode);
  const parsed = parseISODate(date);
  return <div className={`timeline-day ${!business ? "off" : ""} ${date === formatISODate(new Date()) ? "current" : ""}`} title={holiday ?? (!business ? "休日" : date)}>
    {header && <><small>{parsed.toLocaleDateString("ja-JP", { weekday: "short" })}</small><strong>{parsed.getDate()}</strong>{holiday && <i>祝</i>}</>}
  </div>;
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  copy.setDate(copy.getDate() - copy.getDay());
  return formatISODate(copy);
}
function dayDifference(from: string, to: string) { return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000); }
function statusLabel(status: WbsTask["status"]) { return { not_started: "未着手", in_progress: "進行中", completed: "完了", on_hold: "保留" }[status]; }
