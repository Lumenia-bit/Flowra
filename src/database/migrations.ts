export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL,
        bot_username TEXT,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'stopped',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        telegram_user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT,
        first_started_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        current_node TEXT,
        blocked INTEGER NOT NULL DEFAULT 0,
        UNIQUE(project_id, telegram_user_id)
      );
      CREATE TABLE user_variables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, user_id, key)
      );
      CREATE TABLE user_sessions (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        pending_node_id TEXT,
        pending_type TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        direction TEXT NOT NULL,
        event_type TEXT NOT NULL,
        node_id TEXT,
        payload TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE broadcasts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        filters TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        total INTEGER NOT NULL DEFAULT 0,
        sent INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );
      CREATE TABLE broadcast_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        sent_at TEXT,
        UNIQUE(broadcast_id, user_id)
      );
      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, relative_path)
      );
      CREATE INDEX idx_users_project ON users(project_id);
      CREATE INDEX idx_users_project_activity ON users(project_id, last_activity_at);
      CREATE INDEX idx_users_project_started ON users(project_id, first_started_at);
      CREATE INDEX idx_users_username ON users(project_id, username);
      CREATE INDEX idx_variables_lookup ON user_variables(project_id, key, value);
      CREATE INDEX idx_interactions_project_created ON interactions(project_id, created_at);
      CREATE INDEX idx_broadcasts_project_created ON broadcasts(project_id, created_at);
      CREATE INDEX idx_recipients_broadcast_status ON broadcast_recipients(broadcast_id, status);
    `
  }
]
