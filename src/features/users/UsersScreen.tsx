import { FormEvent, useEffect, useState } from "react";
import { createUser, deleteUser, updateUser, type UserProfile, type UserProfileInput } from "../../lib/wbs";

const emptyUser: UserProfileInput = { name: "", email: "", birthday: null, department: "", role: "", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" };

export function UsersScreen({ users, onChanged, onError }: { users: UserProfile[]; onChanged: () => Promise<void>; onError: (value: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<UserProfileInput>(emptyUser);
  const [saving, setSaving] = useState(false);
  const selected = users.find((user) => user.id === selectedId) ?? null;

  useEffect(() => { if (selected) setForm({ ...selected }); else setForm(emptyUser); }, [selectedId, users]);

  function startCreate() {
    setSelectedId(null);
    setForm(emptyUser);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { selected ? await updateUser(selected.id, form) : await createUser(form); startCreate(); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } finally { setSaving(false); }
  }

  async function remove() {
    if (!selected || !window.confirm(`${selected.name}さんを削除しますか？ WBSは未割当になります。`)) return;
    try { await deleteUser(selected.id); startCreate(); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
  }

  return <main className="page-screen users-screen">
    <header className="page-header"><div><p className="eyebrow">PEOPLE DIRECTORY</p><h1>ユーザー</h1><p>担当者を探し、案件やWBSで使うプロフィールを管理します。休暇と承認状況は勤怠画面にまとめました。</p></div><button className="primary-button" onClick={startCreate}>＋ 新規ユーザー</button></header>
    <div className="users-layout"><section className="user-list-card" aria-labelledby="user-list-heading"><div className="list-title"><strong id="user-list-heading">登録ユーザー</strong><span>{users.length} people</span></div>{users.length === 0 ? <p className="simple-empty">ユーザーはまだ登録されていません。右のフォームから最初のユーザーを登録してください。</p> : <ul>{users.map((user) => <li key={user.id}><button className={selectedId === user.id ? "active" : ""} onClick={() => setSelectedId(user.id)} aria-pressed={selectedId === user.id}><span className="avatar">{user.name.slice(0, 2)}</span><span><strong>{user.name}</strong><small>{user.department && user.role ? `${user.department} · ${user.role}` : user.department || user.role || user.email}</small></span></button></li>)}</ul>}</section>
      <form className="profile-card" onSubmit={submit}><div className="panel-title"><div><p className="eyebrow">PROFILE</p><h2>{selected ? `${selected.name}さんを編集` : "ユーザーを登録"}</h2></div>{selected && <button type="button" className="danger-text" onClick={() => void remove()}>ユーザーを削除</button>}</div>
        <div className="profile-grid"><label>氏名<input required maxLength={80} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} /></label><label>メールアドレス<input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} /></label><label>部署<input value={form.department} onChange={(e) => setForm({ ...form, department: e.currentTarget.value })} placeholder="プロダクト開発" /></label><label>役割<input value={form.role} onChange={(e) => setForm({ ...form, role: e.currentTarget.value })} placeholder="デザイナー" /></label><label>誕生日（任意）<input type="date" value={form.birthday ?? ""} onChange={(e) => setForm({ ...form, birthday: e.currentTarget.value || null })} /></label><label>タイムゾーン<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.currentTarget.value })} placeholder="Asia/Tokyo" /></label><label className="wide">好きなもの・関心<input value={form.interests} onChange={(e) => setForm({ ...form, interests: e.currentTarget.value })} placeholder="読書、旅行、データ分析" /></label><label className="wide">スキル<input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.currentTarget.value })} placeholder="要件定義、React、ファシリテーション" /></label><label className="wide">働き方・得意な行動<textarea rows={3} value={form.workStyle} onChange={(e) => setForm({ ...form, workStyle: e.currentTarget.value })} placeholder="午前中に集中しやすい、対話で整理するのが得意 など" /></label><label className="wide">メモ<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} /></label></div>
        <div className="privacy-note">プロフィール情報はこの端末内にのみ保存されます。本人の同意がある情報だけを登録してください。</div><button className="primary-button" disabled={saving}>{saving ? "保存中…" : selected ? "変更を保存" : "ユーザーを登録"}</button>
      </form></div>
  </main>;
}
