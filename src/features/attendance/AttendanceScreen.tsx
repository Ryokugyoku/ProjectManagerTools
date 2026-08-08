import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatISODate, isBusinessDay } from "../../lib/calendar";
import { buildAttendanceLeaves, summarizeAttendance, type AttendanceStatusFilter } from "../../lib/attendanceView";
import { pendingApprovalLabel } from "../../lib/leaveApprovals";
import { createUserLeave, deleteUserLeave, updateUserLeave, type UserLeave, type UserLeaveInput, type UserProfile } from "../../lib/wbs";

const emptyLeave = (userId = 0): UserLeaveInput => ({
  userId, date: formatISODate(new Date()), type: "planned", unit: "full_day", reason: "",
  customerApproved: false, managerApproved: false, workflowApproved: false,
});

export function AttendanceScreen({ users, leaves, countryCode, today, onChanged, onError, onOpenUsers }: {
  users: UserProfile[]; leaves: UserLeave[]; countryCode: string; today: string;
  onChanged: () => Promise<void>; onError: (value: string | null) => void; onOpenUsers: () => void;
}) {
  const [selectedLeaveId, setSelectedLeaveId] = useState<number | null>(null);
  const [form, setForm] = useState<UserLeaveInput>(emptyLeave(users[0]?.id));
  const [saving, setSaving] = useState(false);
  const [userFilter, setUserFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatusFilter>("all");
  const editorRef = useRef<HTMLHeadingElement>(null);
  const selectedLeave = leaves.find((leave) => leave.id === selectedLeaveId) ?? null;
  const summary = useMemo(() => summarizeAttendance(leaves, today, countryCode), [countryCode, leaves, today]);
  const visibleLeaves = useMemo(() => buildAttendanceLeaves(leaves, { userId: userFilter, status: statusFilter }, today, countryCode), [countryCode, leaves, statusFilter, today, userFilter]);

  useEffect(() => {
    if (selectedLeave) setForm({
      userId: selectedLeave.userId, date: selectedLeave.date, type: selectedLeave.type, unit: selectedLeave.unit,
      reason: selectedLeave.reason, customerApproved: selectedLeave.customerApproved,
      managerApproved: selectedLeave.managerApproved, workflowApproved: selectedLeave.workflowApproved,
    });
  }, [selectedLeave]);

  function startCreate(userId = userFilter === "all" ? users[0]?.id ?? 0 : userFilter) {
    setSelectedLeaveId(null);
    setForm(emptyLeave(userId));
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  function selectLeave(leave: UserLeave) {
    setSelectedLeaveId(leave.id);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      selectedLeave ? await updateUserLeave(selectedLeave.id, form) : await createUserLeave(form);
      startCreate(form.userId); await onChanged(); onError(null);
    } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selectedLeave || !window.confirm(`${selectedLeave.userName}さんの${selectedLeave.date}の休暇を削除しますか？`)) return;
    try { await deleteUserLeave(selectedLeave.id); startCreate(selectedLeave.userId); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
  }

  return <main className="page-screen attendance-screen">
    <header className="page-header"><div><p className="eyebrow">ATTENDANCE &amp; AVAILABILITY</p><h1>勤怠・休暇</h1><p>休暇予定と承認状況をまとめて確認し、WBSの稼働可能時間へ反映します。</p></div><button className="primary-button" disabled={users.length === 0} onClick={() => startCreate()}>＋ 休暇を登録</button></header>
    <section className="attendance-summary" aria-label="休暇承認の状況">
      <button className={statusFilter === "attention" ? "active urgent" : "urgent"} onClick={() => setStatusFilter("attention")}><span>要対応</span><strong>{summary.urgent + summary.pending}</strong><small>本日中 {summary.urgent} / 承認待ち {summary.pending}</small></button>
      <button className={statusFilter === "approved" ? "active" : ""} onClick={() => setStatusFilter("approved")}><span>承認済み</span><strong>{summary.approved}</strong><small>3つの承認が完了</small></button>
      <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}><span>登録合計</span><strong>{leaves.length}</strong><small>すべての休暇予定</small></button>
    </section>
    {users.length === 0 ? <section className="attendance-empty"><span aria-hidden="true">♙</span><h2>先にユーザーを登録してください</h2><p>休暇を紐づける担当者がまだいません。ユーザー登録後、この画面から休暇と承認状況を管理できます。</p><button className="primary-button" onClick={onOpenUsers}>ユーザー画面を開く</button></section> : <div className="attendance-layout">
      <section className="attendance-list-card" aria-labelledby="attendance-list-heading"><div className="attendance-list-header"><div><p className="eyebrow">LEAVE RECORDS</p><h2 id="attendance-list-heading">休暇一覧</h2></div><span>{visibleLeaves.length} / {leaves.length}件</span></div>
        <div className="attendance-filters"><label>ユーザー<select value={userFilter} onChange={(event) => setUserFilter(event.currentTarget.value === "all" ? "all" : Number(event.currentTarget.value))}><option value="all">すべてのユーザー</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>承認状況<select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as AttendanceStatusFilter)}><option value="all">すべて</option><option value="attention">要対応</option><option value="approved">承認済み</option></select></label></div>
        {leaves.length === 0 ? <div className="attendance-list-empty"><strong>休暇はまだ登録されていません</strong><span>「休暇を登録」から最初の予定を追加できます。</span></div> : visibleLeaves.length === 0 ? <div className="attendance-list-empty"><strong>条件に合う休暇はありません</strong><button className="quiet-button" onClick={() => { setUserFilter("all"); setStatusFilter("all"); }}>絞り込みを解除</button></div> : <ul className="attendance-list">{visibleLeaves.map(({ leave, approval }) => <li key={leave.id}><button className={selectedLeaveId === leave.id ? "active" : ""} onClick={() => selectLeave(leave)} aria-pressed={selectedLeaveId === leave.id}><span className={`approval-chip ${approval.state}`}>{approval.state === "urgent" ? "本日中" : approval.state === "pending" ? "承認待ち" : "承認済み"}</span><span className="attendance-person"><strong>{leave.userName}</strong><small>{leave.type === "planned" ? "計画休" : "計画外"} · {leaveUnitLabel(leave.unit)}{!isBusinessDay(leave.date, countryCode) ? " · 休日" : ""}</small></span><time dateTime={leave.date}>{leave.date}</time>{approval.state !== "complete" && <small className="attendance-approval-detail">未完了: {pendingApprovalLabel(approval.state === "urgent" ? approval.urgent : approval.pending)}</small>}{leave.reason && <small className="attendance-reason">{leave.reason}</small>}</button></li>)}</ul>}
      </section>
      <form className="attendance-editor" onSubmit={submit}><div className="panel-title"><div><p className="eyebrow">LEAVE EDITOR</p><h2 ref={editorRef} tabIndex={-1}>{selectedLeave ? "休暇を編集" : "休暇を登録"}</h2><p>{selectedLeave ? `${selectedLeave.userName}さんの${selectedLeave.date}` : "予定と必要な承認を1か所で登録します。"}</p></div>{selectedLeave && <button type="button" className="danger-text" onClick={() => void remove()}>削除</button>}</div>
        <div className="attendance-fields"><label>ユーザー<select required value={form.userId || ""} onChange={(event) => setForm({ ...form, userId: Number(event.currentTarget.value) })}><option value="">選択してください</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>休暇日<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.currentTarget.value })} /></label><label>休暇種別<select value={form.type} onChange={(event) => setForm({ ...form, type: event.currentTarget.value as UserLeaveInput["type"] })}><option value="planned">計画休</option><option value="unplanned">計画外</option></select></label><label>取得単位<select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.currentTarget.value as UserLeaveInput["unit"] })}><option value="full_day">全休</option><option value="morning">午前半休</option><option value="afternoon">午後半休</option></select></label><label>理由{form.type === "unplanned" ? "（必須）" : "（任意）"}<textarea required={form.type === "unplanned"} maxLength={500} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.currentTarget.value })} placeholder={form.type === "unplanned" ? "計画外となった理由を入力" : "必要に応じて補足を入力"} /></label></div>
        <fieldset className="approval-checklist"><legend>承認状況</legend><p>未承認のままでも登録し、あとから更新できます。</p><label><input type="checkbox" checked={form.customerApproved} onChange={(event) => setForm({ ...form, customerApproved: event.currentTarget.checked })} /><span><strong>顧客承認</strong><small>休暇日の5営業日前から要対応</small></span></label><label><input type="checkbox" checked={form.managerApproved} onChange={(event) => setForm({ ...form, managerApproved: event.currentTarget.checked })} /><span><strong>上長承認</strong><small>休暇日の5営業日前から要対応</small></span></label><label><input type="checkbox" checked={form.workflowApproved} onChange={(event) => setForm({ ...form, workflowApproved: event.currentTarget.checked })} /><span><strong>業務フロー承認</strong><small>登録から3営業日後に要対応</small></span></label></fieldset>
        <div className="attendance-editor-actions">{selectedLeave && <button type="button" className="quiet-button" onClick={() => startCreate(selectedLeave.userId)}>編集をやめる</button>}<button className="primary-button" disabled={saving}>{saving ? "保存中…" : selectedLeave ? "変更を保存" : "休暇を登録"}</button></div>
      </form>
    </div>}
  </main>;
}

function leaveUnitLabel(unit: UserLeave["unit"]) { return { full_day: "全休", morning: "午前半休", afternoon: "午後半休" }[unit]; }
