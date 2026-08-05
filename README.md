# Project Manager Tools

Tauri 2、React 19、TypeScript、SQLite で作ったローカルファーストのデスクトップ・タスク管理アプリです。

## 主な機能

- タスクの追加・完了・未完了への復帰・削除
- すべて／未完了／完了の表示フィルター
- SQLite による端末内への永続保存
- Rust 側で管理するバージョン付き DB マイグレーション
- Tauri capability による必要最小限の SQL 権限

## 技術構成

- [Tauri 2](https://v2.tauri.app/)
- [React](https://react.dev/) + TypeScript
- [Vite](https://vite.dev/)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/) + SQLite

SQLite データベース `project-manager.db` は、OS ごとのアプリ用データディレクトリに作成されます。

## 開発を始める

### 必要なもの

- Node.js 20 以上
- Rust 1.77.2 以上
- [Tauri の OS 別 prerequisites](https://v2.tauri.app/start/prerequisites/)

### セットアップ

```bash
npm install
npm run tauri dev
```

Codex デスクトップでは、プロジェクトの `Run` アクションからビルドと起動をまとめて実行できます。

### 検証とビルド

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## ディレクトリ

```text
src/                        React UI
src/lib/tasks.ts            SQLite アクセス
src-tauri/src/lib.rs        Tauri / SQL プラグイン初期化
src-tauri/migrations/       SQLite マイグレーション
src-tauri/capabilities/     Tauri 権限設定
```

## License

[MIT](LICENSE)
