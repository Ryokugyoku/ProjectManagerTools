use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:project-manager.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_tasks_table",
            sql: include_str!("../migrations/0001_create_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_wbs_tables",
            sql: include_str!("../migrations/0002_create_wbs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "expand_user_profiles",
            sql: include_str!("../migrations/0003_expand_user_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_projects",
            sql: include_str!("../migrations/0004_create_projects.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_wbs_task_hierarchy",
            sql: include_str!("../migrations/0005_add_wbs_task_hierarchy.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_milestones",
            sql: include_str!("../migrations/0006_create_milestones.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_milestone_color",
            sql: include_str!("../migrations/0007_add_milestone_color.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_wbs_governance",
            sql: include_str!("../migrations/0008_add_wbs_governance.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_wbs_created_history",
            sql: include_str!("../migrations/0009_add_wbs_created_history.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_wbs_prerequisite",
            sql: include_str!("../migrations/0010_add_wbs_prerequisite.sql"),
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
