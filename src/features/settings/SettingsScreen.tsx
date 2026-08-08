import { FormEvent, useEffect, useState } from "react";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { countries } from "../../lib/calendar";
import { saveSettings, type AppSettings } from "../../lib/wbs";

export function SettingsScreen({ settings, onSaved, onError }: { settings: AppSettings; onSaved: (settings: AppSettings) => void; onError: (value: string | null) => void }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      let next = form;
      if (next.notificationsEnabled) {
        if (!("__TAURI_INTERNALS__" in window)) throw new Error("通知権限はデスクトップアプリで設定してください。");
        const allowed = await isPermissionGranted() || await requestPermission() === "granted";
        if (!allowed) next = { ...next, notificationsEnabled: false };
      }
      await saveSettings(next); onSaved(next); onError(next.notificationsEnabled === form.notificationsEnabled ? null : "通知が許可されなかったためオフにしました。");
    } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } finally { setSaving(false); }
  }
  return <main className="page-screen settings-screen"><header className="page-header"><div><p className="eyebrow">PREFERENCES</p><h1>設定</h1><p>営業日カレンダー、報告表示、通知の共通設定です。</p></div></header><form className="settings-card" onSubmit={submit}><section><div><h2>カレンダー</h2><p>選択した国の週末と祝日を、WBSの期間計算とロードマップ表示に反映します。</p></div><label>祝日の国・地域<select value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.currentTarget.value })}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label></section><section><div><h2>前日作業報告</h2><p>進行中タスクから親を遡って表示する階層数です。共有する親子経路は報告内で1回にまとめます。</p></div><label>表示する親階層数<select value={form.dailyReportAncestorDepth} onChange={(e) => setForm({ ...form, dailyReportAncestorDepth: Number(e.currentTarget.value) })}>{Array.from({ length: 11 }, (_, depth) => <option key={depth} value={depth}>{depth === 0 ? "親を表示しない" : `${depth}階層`}</option>)}</select><small>既定は3階層。最大10階層まで表示します。</small></label></section><section><div><h2>進捗通知</h2><p>未完了のWBSがある日に、入力を促す通知を表示します。</p></div><div className="settings-fields"><label className="toggle-field"><span>毎日の通知</span><input type="checkbox" checked={form.notificationsEnabled} onChange={(e) => setForm({ ...form, notificationsEnabled: e.currentTarget.checked })} /></label><label>通知時刻<input type="time" disabled={!form.notificationsEnabled} value={form.notificationTime} onChange={(e) => setForm({ ...form, notificationTime: e.currentTarget.value })} /></label></div></section><div className="settings-actions"><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "設定を保存"}</button></div></form></main>;
}
