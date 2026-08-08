use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:project-manager-v2.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "v2_baseline",
            sql: include_str!("../migrations/0001_v2_baseline.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_early_start_reason",
            sql: include_str!("../migrations/0002_add_early_start_reason.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
