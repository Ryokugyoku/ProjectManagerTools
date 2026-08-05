# AI 作業ガイド

このリポジトリでコードや文書を生成・変更する AI は、最初にこのファイルを読みます。

## 読む順序

1. `git status --short` で既存作業を確認し、無関係な変更を触らない。
2. [Documentation/INDEX.md](Documentation/INDEX.md) を読み、作業に必要な文書だけを選ぶ。
3. ファイルの追加・移動時は [Documentation/FOLDER_RULES.md](Documentation/FOLDER_RULES.md) を読む。
4. UI の追加・変更時は [Documentation/LAYOUT_CONCEPT.md](Documentation/LAYOUT_CONCEPT.md) を読む。
5. コード変更時は [Documentation/TEST_STRATEGY.md](Documentation/TEST_STRATEGY.md) を読み、対応する自動テストを同時に変更する。

## 基本方針

- 現在の小規模な構成を優先し、将来のためだけの階層や抽象化を作らない。
- UI、タスク操作、Tauri 起動、DB マイグレーションの責務境界を越えて処理を混在させない。
- 既存の日本語表示、ローカルファースト、ダークテーマ、キーボード操作を維持する。
- 仕様と実装が食い違う場合は、黙って一方に合わせず差異を報告する。
- 変更範囲に応じた最小限の検証を行い、未実施の目視・実機確認を成功扱いしない。
- コード変更は自動テスト必須とし、テストなしで完了扱いにしない。公開メソッドはCUIテスト、条件分岐を持つ計算はCT観点を用意する。
- 完了前に `npm run verify` を実行する。実行できない場合は作業を完了扱いにせず、理由と未確認範囲を報告する。

## 完了報告

変更ファイル、利用者への影響、実行した検証、未確認事項を簡潔に報告します。コミットや大規模な整形は、依頼に含まれる場合だけ行います。
