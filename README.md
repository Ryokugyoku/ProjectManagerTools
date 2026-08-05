# Project Manager Tools

Tauri 2、React 19、TypeScript、SQLite で作ったローカルファーストのデスクトップ・タスク管理アプリです。

## 主な機能

- 担当者でグループ化したロードマップでの WBS 登録・表示・編集・削除
- バー中央のドラッグによる開始日移動と、左右端による営業日数変更
- 国・地域ごとの週末と祝日を除外した営業日計算
- 終了予定日・1日平均進捗率のプレビューと、5営業日以上の分解警告
- 開始／終了実績日、状態、進捗率、日次進捗メモの記録
- 氏名・メールアドレス・誕生日・部署・役割・関心・スキルなどを持つユーザープロフィール
- ユーザーの WBS への担当者割り当て
- 案件の基本情報、状態、優先度、予定期間、案件メンバーと役割の管理
- 案件メンバーに限定したWBS担当者の選択
- 独立した設定画面での祝日対象国と通知時刻の管理
- 指定時刻の日次進捗デスクトップ通知（アプリ起動中）
- SQLite による端末内への永続保存
- Rust 側で管理するバージョン付き DB マイグレーション
- Tauri capability による必要最小限の SQL・通知権限

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

### VS Code でデバッグする

1. VS Code でこのフォルダを開き、推奨される `CodeLLDB`、`rust-analyzer`、`Tauri` 拡張機能をインストールします。
2. Rust コードにブレークポイントを設定します。
3. 「実行とデバッグ」で `Tauri: Development Debug` を選択し、`F5` を押します。

デバッグ開始時には Vite 開発サーバーも自動起動します。React／TypeScript 側は、起動したアプリで `Command + Option + I` を押して Web Inspector からデバッグできます。リリース相当の構成を調べる場合は `Tauri: Production Debug` を選択してください。

### 検証とビルド

```bash
npm run verify
```

個別に実行する場合:

```bash
npm run test:cui
npm run test:ct
npm run test:coverage
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## ディレクトリ

```text
src/                        React UI
src/lib/wbs.ts              WBS・担当者・設定の SQLite アクセス
src/lib/calendar.ts         祝日・営業日・カレンダー計算
src/features/wbs/           担当者別ロードマップ
src/features/users/         ユーザープロフィール画面
src/features/projects/      案件・案件メンバー管理画面
src/features/settings/      共通設定画面
src-tauri/src/lib.rs        Tauri / SQL / 通知プラグイン初期化
src-tauri/migrations/       SQLite マイグレーション
src-tauri/capabilities/     Tauri 権限設定
```

## License

[MIT](LICENSE)
