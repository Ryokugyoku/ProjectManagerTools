import { FormEvent, useEffect, useState } from "react";
import { createAssignee, createUserLeave, deleteAssignee, deleteUserLeave, updateAssignee, updateUserLeave, type Assignee, type UserLeave, type UserLeaveInput, type UserProfileInput } from "../../lib/wbs";
import { formatISODate, isBusinessDay } from "../../lib/calendar";
import { pendingApprovalLabel, summarizeLeaveApprovals } from "../../lib/leaveApprovals";

const emptyUser: UserProfileInput = { name: "", email: "", birthday: null, department: "", role: "", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" };

const emptyLeave = (userId = 0): UserLeaveInput => ({
  userId, date: formatISODate(new Date()), type: "planned", unit: "full_day", reason: "",
  customerApproved: false, managerApproved: false, workflowApproved: false,
});

export function UsersScreen({ users, leaves, countryCode, today, onChanged, onError }: { users: Assignee[]; leaves: UserLeave[]; countryCode: string; today: string; onChanged: () => Promise<void>; onError: (value: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<UserProfileInput>(emptyUser);
  const [saving, setSaving] = useState(false);
  const [selectedLeaveId, setSelectedLeaveId] = useState<number | null>(null);
  const [leaveForm, setLeaveForm] = useState<UserLeaveInput>(emptyLeave());
  const [savingLeave, setSavingLeave] = useState(false);
  const selected = users.find((user) => user.id === selectedId) ?? null;
  const selectedLeave = leaves.find((leave) => leave.id === selectedLeaveId) ?? null;
  useEffect(() => { if (selected) setForm({ ...selected }); else setForm(emptyUser); }, [selectedId, users]);
  useEffect(() => {
    if (selectedLeave) setLeaveForm({
      userId: selectedLeave.userId, date: selectedLeave.date, type: selectedLeave.type, unit: selectedLeave.unit,
      reason: selectedLeave.reason, customerApproved: selectedLeave.customerApproved,
      managerApproved: selectedLeave.managerApproved, workflowApproved: selectedLeave.workflowApproved,
    });
    else setLeaveForm(emptyLeave(selectedId ?? users[0]?.id ?? 0));
  }, [selectedId, selectedLeaveId, leaves, users]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { selected ? await updateAssignee(selected.id, form) : await createAssignee(form); setSelectedId(null); setForm(emptyUser); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } finally { setSaving(false); }
  }
  async function remove() {
    if (!selected || !window.confirm(`${selected.name}さんを削除しますか？ WBSは未割当になります。`)) return;
    try { await deleteAssignee(selected.id); setSelectedId(null); await onChanged(); } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function saveLeave(event: FormEvent) {
    event.preventDefault(); setSavingLeave(true);
    try {
      selectedLeave ? await updateUserLeave(selectedLeave.id, leaveForm) : await createUserLeave(leaveForm);
      setSelectedLeaveId(null); await onChanged(); onError(null);
    } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } finally { setSavingLeave(false); }
  }

  async function removeLeave(leave: UserLeave) {
    if (!window.confirm(`${leave.userName}さんの${leave.date}の休暇を削除しますか？`)) return;
    try { await deleteUserLeave(leave.id); setSelectedLeaveId(null); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
  }

  return <main className="page-screen"><header className="page-header"><div><p className="eyebrow">PEOPLE DIRECTORY</p><h1>ユーザー</h1><p>担当者情報と、チーム分析に使う任意プロフィールを管理します。</p></div><button className="primary-button" onClick={() => { setSelectedId(null); setForm(emptyUser); }}>＋ 新規ユーザー</button></header>
    <div className="users-layout"><section className="user-list-card"><div className="list-title"><strong>登録ユーザー</strong><span>{users.length} people</span></div>{users.length === 0 ? <p className="simple-empty">ユーザーはまだ登録されていません。</p> : <ul>{users.map((user) => <li key={user.id}><button className={selectedId === user.id ? "active" : ""} onClick={() => setSelectedId(user.id)}><span className="avatar">{user.name.slice(0, 2)}</span><span><strong>{user.name}</strong><small>{user.role || user.email}</small></span></button></li>)}</ul>}</section>
      <form className="profile-card" onSubmit={submit}><div className="panel-title"><div><p className="eyebrow">PROFILE</p><h2>{selected ? "ユーザー情報を編集" : "ユーザーを登録"}</h2></div>{selected && <button type="button" className="danger-text" onClick={() => void remove()}>削除</button>}</div>
        <div className="profile-grid"><label>氏名<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} /></label><label>メールアドレス<input required type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} /></label><label>誕生日（任意）<input type="date" value={form.birthday ?? ""} onChange={(e) => setForm({ ...form, birthday: e.currentTarget.value || null })} /></label><label>部署<input value={form.department} onChange={(e) => setForm({ ...form, department: e.currentTarget.value })} placeholder="プロダクト開発" /></label><label>役割<input value={form.role} onChange={(e) => setForm({ ...form, role: e.currentTarget.value })} placeholder="デザイナー" /></label><label>タイムゾーン<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.currentTarget.value })} placeholder="Asia/Tokyo" /></label><label className="wide">好きなもの・関心<input value={form.interests} onChange={(e) => setForm({ ...form, interests: e.currentTarget.value })} placeholder="読書、旅行、データ分析" /></label><label className="wide">スキル<input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.currentTarget.value })} placeholder="要件定義、React、ファシリテーション" /></label><label className="wide">働き方・得意な行動<textarea rows={3} value={form.workStyle} onChange={(e) => setForm({ ...form, workStyle: e.currentTarget.value })} placeholder="午前中に集中しやすい、対話で整理するのが得意 など" /></label><label className="wide">メモ<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} /></label></div>
        <div className="privacy-note">プロフィール情報はこの端末内にのみ保存されます。本人の同意がある情報だけを登録してください。</div><button className="primary-button" disabled={saving}>{saving ? "保存中…" : selected ? "変更を保存" : "ユーザーを登録"}</button>
      </form></div>
    <section className="leave-card" aria-labelledby="leave-heading"><div className="panel-title"><div><p className="eyebrow">AVAILABILITY</p><h2 id="leave-heading">休暇設定</h2><p>期日は変更せず、担当者の稼働可能時間に合わせてWBSの計画進捗を再配分します。</p></div><button type="button" className="quiet-button" onClick={() => { setSelectedLeaveId(null); setLeaveForm(emptyLeave(selectedId ?? users[0]?.id ?? 0)); }}>＋ 休暇を登録</button></div>
      <form className="leave-form" onSubmit={saveLeave}><label>ユーザー<select required value={leaveForm.userId || ""} onChange={(event) => setLeaveForm({ ...leaveForm, userId: Number(event.currentTarget.value) })}><option value="">選択してください</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>休暇日<input required type="date" value={leaveForm.date} onChange={(event) => setLeaveForm({ ...leaveForm, date: event.currentTarget.value })} /></label><label>休暇種別<select value={leaveForm.type} onChange={(event) => setLeaveForm({ ...leaveForm, type: event.currentTarget.value as UserLeaveInput["type"] })}><option value="planned">計画休</option><option value="unplanned">計画外</option></select></label><label>取得単位<select value={leaveForm.unit} onChange={(event) => setLeaveForm({ ...leaveForm, unit: event.currentTarget.value as UserLeaveInput["unit"] })}><option value="full_day">全休</option><option value="morning">午前半休</option><option value="afternoon">午後半休</option></select></label><label className="wide">理由{leaveForm.type === "unplanned" ? "（必須）" : "（任意）"}<textarea required={leaveForm.type === "unplanned"} maxLength={500} rows={2} value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.currentTarget.value })} placeholder={leaveForm.type === "unplanned" ? "計画外となった理由を入力" : "必要に応じて補足を入力"} /></label>
        <fieldset className="leave-approvals wide"><legend>承認状況（未承認でも登録できます）</legend><label><input type="checkbox" checked={leaveForm.customerApproved} onChange={(event) => setLeaveForm({ ...leaveForm, customerApproved: event.currentTarget.checked })} />顧客承認</label><label><input type="checkbox" checked={leaveForm.managerApproved} onChange={(event) => setLeaveForm({ ...leaveForm, managerApproved: event.currentTarget.checked })} />上長承認</label><label><input type="checkbox" checked={leaveForm.workflowApproved} onChange={(event) => setLeaveForm({ ...leaveForm, workflowApproved: event.currentTarget.checked })} />業務フロー承認（社内手続き）</label><p>顧客・上長承認は休暇の5営業日前から、業務フロー承認は登録から3営業日後に未承認なら「本日中の対応」として赤く表示します。</p></fieldset>
        <div className="leave-form-actions">{selectedLeave && <button type="button" className="quiet-button" onClick={() => setSelectedLeaveId(null)}>編集をやめる</button>}<button className="primary-button" disabled={savingLeave || users.length === 0}>{savingLeave ? "保存中…" : selectedLeave ? "休暇を更新" : "休暇を登録"}</button></div></form>
      <div className="leave-list"><div className="list-title"><strong>登録済みの休暇</strong><span>{leaves.length} days</span></div>{leaves.length === 0 ? <p className="simple-empty">休暇はまだ登録されていません。</p> : <ul>{leaves.map((leave) => {
        const approval = summarizeLeaveApprovals(leave, today, countryCode);
        return <li key={leave.id} className={`leave-${approval.state}`}><button type="button" onClick={() => setSelectedLeaveId(leave.id)}><time dateTime={leave.date}>{leave.date}</time><span><strong>{leave.userName}</strong><small>{leave.type === "planned" ? "計画休" : "計画外"} · {leaveUnitLabel(leave.unit)}{!isBusinessDay(leave.date, countryCode) ? " · 休日" : ""}</small>{approval.state !== "complete" && <small className="leave-approval-state">{approval.state === "urgent" ? "本日中の対応：" : "承認待ち："}{pendingApprovalLabel(approval.state === "urgent" ? approval.urgent : approval.pending)}</small>}{leave.reason && <small>{leave.reason}</small>}</span></button><button type="button" className="danger-text" aria-label={`${leave.userName}さんの${leave.date}の休暇を削除`} onClick={() => void removeLeave(leave)}>削除</button></li>;
      })}</ul>}</div>
    </section>
  </main>;
}

function leaveUnitLabel(unit: UserLeave["unit"]) { return { full_day: "全休", morning: "午前半休", afternoon: "午後半休" }[unit]; }
