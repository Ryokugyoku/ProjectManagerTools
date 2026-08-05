import { FormEvent, useEffect, useMemo, useState } from "react";
import { createProject, deleteProject, updateProject, type Project, type ProjectInput, type ProjectPriority, type ProjectStatus } from "../../lib/projects";
import type { Assignee } from "../../lib/wbs";

const statusLabels: Record<ProjectStatus, string> = { planning: "計画中", active: "進行中", on_hold: "保留", completed: "完了" };
const priorityLabels: Record<ProjectPriority, string> = { low: "低", medium: "中", high: "高" };
const emptyProject: ProjectInput = { name: "", code: "", clientName: "", description: "", status: "planning", priority: "medium", plannedStart: null, plannedEnd: null, members: [] };

export function ProjectsScreen({ projects, users, onChanged, onError }: { projects: Project[]; users: Assignee[]; onChanged: () => Promise<void>; onError: (value: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectInput>(emptyProject);
  const [saving, setSaving] = useState(false);
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  useEffect(() => {
    if (selected) setForm({ ...selected, members: selected.members.map((member) => ({ userId: member.userId, projectRole: member.projectRole })) });
    else setForm(emptyProject);
  }, [selectedId, projects]);
  const activeCount = useMemo(() => projects.filter((project) => project.status === "active").length, [projects]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { selected ? await updateProject(selected.id, form) : await createProject(form); setSelectedId(null); setForm(emptyProject); await onChanged(); onError(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } finally { setSaving(false); }
  }
  async function remove() {
    if (!selected || !window.confirm(`案件「${selected.name}」を削除しますか？ WBSは案件未設定になります。`)) return;
    try { await deleteProject(selected.id); setSelectedId(null); await onChanged(); } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function toggleMember(userId: number, checked: boolean) {
    setForm((current) => ({ ...current, members: checked ? [...current.members, { userId, projectRole: "" }] : current.members.filter((member) => member.userId !== userId) }));
  }
  function setMemberRole(userId: number, projectRole: string) {
    setForm((current) => ({ ...current, members: current.members.map((member) => member.userId === userId ? { ...member, projectRole } : member) }));
  }

  return <main className="page-screen project-screen"><header className="page-header"><div><p className="eyebrow">PROJECT PORTFOLIO</p><h1>案件</h1><p>{projects.length}件の案件 · {activeCount}件が進行中</p></div><button className="primary-button" onClick={() => { setSelectedId(null); setForm(emptyProject); }}>＋ 新規案件</button></header>
    <div className="projects-layout"><section className="project-list"><div className="list-title"><strong>案件一覧</strong><span>{projects.length} projects</span></div>{projects.length === 0 ? <p className="simple-empty">案件はまだ登録されていません。</p> : projects.map((project) => <button key={project.id} className={selectedId === project.id ? "active" : ""} onClick={() => setSelectedId(project.id)}><div><span className={`priority-dot ${project.priority}`} /><strong>{project.name}</strong><small>{project.code}</small></div><span className={`project-status ${project.status}`}>{statusLabels[project.status]}</span><p>{project.clientName || "顧客未設定"} · {project.members.length}人</p></button>)}</section>
      <form className="project-form" onSubmit={submit}><div className="panel-title"><div><p className="eyebrow">PROJECT DETAILS</p><h2>{selected ? "案件を編集" : "案件を登録"}</h2></div>{selected && <button type="button" className="danger-text" onClick={() => void remove()}>削除</button>}</div>
        <div className="profile-grid"><label>案件名<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} placeholder="新製品リリース" /></label><label>案件コード<input required maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.currentTarget.value })} placeholder="PRJ-2026-001" /></label><label>顧客名<input maxLength={120} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.currentTarget.value })} /></label><label>状態<select value={form.status} onChange={(e) => setForm({ ...form, status: e.currentTarget.value as ProjectStatus })}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>優先度<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.currentTarget.value as ProjectPriority })}>{Object.entries(priorityLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><span /><label>開始予定日<input type="date" value={form.plannedStart ?? ""} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value || null })} /></label><label>終了予定日<input type="date" min={form.plannedStart ?? undefined} value={form.plannedEnd ?? ""} onChange={(e) => setForm({ ...form, plannedEnd: e.currentTarget.value || null })} /></label><label className="wide">概要<textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} placeholder="目的、成果物、完了条件など" /></label></div>
        <fieldset className="member-picker"><legend>案件メンバー</legend>{users.length === 0 ? <p>先にユーザー画面でユーザーを登録してください。</p> : users.map((user) => { const member = form.members.find((item) => item.userId === user.id); return <div className="member-row" key={user.id}><label><input type="checkbox" checked={Boolean(member)} onChange={(e) => toggleMember(user.id, e.currentTarget.checked)} /><span className="avatar">{user.name.slice(0,2)}</span><span><strong>{user.name}</strong><small>{user.role || user.email}</small></span></label><input aria-label={`${user.name}の案件内役割`} disabled={!member} value={member?.projectRole ?? ""} onChange={(e) => setMemberRole(user.id, e.currentTarget.value)} placeholder="案件内の役割" /></div>; })}</fieldset>
        <div className="form-summary"><span>{form.members.length}人を紐づけ</span><button className="primary-button" disabled={saving}>{saving ? "保存中…" : selected ? "変更を保存" : "案件を登録"}</button></div>
      </form></div>
  </main>;
}
