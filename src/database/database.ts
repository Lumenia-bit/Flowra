import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite'
import { migrations } from './migrations.js'
import type {
  Broadcast,
  BroadcastContent,
  BroadcastStatus,
  BroadcastType,
  PaginatedUsers,
  Project,
  SegmentFilter,
  TelegramUser,
  UserQuery,
  Workflow
} from '../shared/types.js'
import { parseWorkflow } from '../shared/workflow.js'

type Row = Record<string, unknown>
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export interface InternalProject extends Project {
  token: string
}

export interface UpsertUserInput {
  projectId: string
  telegramUserId: string
  chatId: string
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  languageCode?: string | null
}

export class FlowraDatabase {
  readonly connection: DatabaseSyncType

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.connection = new DatabaseSync(path)
    this.connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    this.migrate()
  }

  close(): void {
    this.connection.close()
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `)
    const applied = new Set((this.connection.prepare('SELECT version FROM schema_migrations').all() as Row[]).map(row => Number(row.version)))
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue
      this.connection.exec('BEGIN IMMEDIATE')
      try {
        this.connection.exec(migration.sql)
        this.connection.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, new Date().toISOString())
        this.connection.exec('COMMIT')
      } catch (error) {
        this.connection.exec('ROLLBACK')
        throw error
      }
    }
  }

  migrationVersions(): number[] {
    return (this.connection.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Row[]).map(row => Number(row.version))
  }

  listProjects(): Project[] {
    const rows = this.connection.prepare(`
      SELECT p.*, COUNT(u.id) AS user_count
      FROM projects p
      LEFT JOIN users u ON u.project_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all() as Row[]
    return rows.map(row => this.mapProject(row))
  }

  getProject(id: string): Project {
    const row = this.connection.prepare(`
      SELECT p.*, COUNT(u.id) AS user_count
      FROM projects p
      LEFT JOIN users u ON u.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(id) as Row | undefined
    if (!row) throw new Error('Проект не найден')
    return this.mapProject(row)
  }

  getInternalProject(id: string): InternalProject {
    const row = this.connection.prepare(`
      SELECT p.*, COUNT(u.id) AS user_count
      FROM projects p
      LEFT JOIN users u ON u.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(id) as Row | undefined
    if (!row) throw new Error('Проект не найден')
    return { ...this.mapProject(row), token: String(row.token) }
  }

  createProject(id: string, name: string, token: string, botUsername: string | null, workflow: Workflow): Project {
    const now = new Date().toISOString()
    this.connection.prepare(`
      INSERT INTO projects (id, name, token, bot_username, workflow, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?)
    `).run(id, name, token, botUsername, JSON.stringify(parseWorkflow(workflow)), now, now)
    return this.getProject(id)
  }

  updateProject(id: string, values: { name?: string; token?: string; botUsername?: string | null; workflow?: Workflow; status?: string }): Project {
    const fields: string[] = []
    const params: SQLInputValue[] = []
    if (values.name !== undefined) { fields.push('name = ?'); params.push(values.name) }
    if (values.token !== undefined) { fields.push('token = ?'); params.push(values.token) }
    if (values.botUsername !== undefined) { fields.push('bot_username = ?'); params.push(values.botUsername) }
    if (values.workflow !== undefined) { fields.push('workflow = ?'); params.push(JSON.stringify(parseWorkflow(values.workflow))) }
    if (values.status !== undefined) { fields.push('status = ?'); params.push(values.status) }
    if (fields.length === 0) return this.getProject(id)
    fields.push('updated_at = ?')
    params.push(new Date().toISOString(), id)
    const result = this.connection.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    if (result.changes === 0) throw new Error('Проект не найден')
    return this.getProject(id)
  }

  deleteProject(id: string): void {
    this.connection.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  duplicateProject(sourceId: string, newId: string, name: string): Project {
    const source = this.getInternalProject(sourceId)
    return this.createProject(newId, name, source.token, source.botUsername, source.workflow)
  }

  addAsset(id: string, projectId: string, relativePath: string, originalName: string, mimeType: string, size: number): void {
    this.connection.prepare(`
      INSERT INTO assets (id, project_id, relative_path, original_name, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, relativePath, originalName, mimeType, size, new Date().toISOString())
  }

  removeAsset(projectId: string, relativePath: string): void {
    this.connection.prepare('DELETE FROM assets WHERE project_id = ? AND relative_path = ?').run(projectId, relativePath)
  }

  listAssets(projectId: string): Row[] {
    return this.connection.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at').all(projectId) as Row[]
  }

  upsertUser(input: UpsertUserInput): TelegramUser {
    const now = new Date().toISOString()
    this.connection.prepare(`
      INSERT INTO users (
        project_id, telegram_user_id, chat_id, username, first_name, last_name,
        language_code, first_started_at, last_activity_at, message_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(project_id, telegram_user_id) DO UPDATE SET
        chat_id = excluded.chat_id,
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        language_code = excluded.language_code,
        last_activity_at = excluded.last_activity_at,
        message_count = users.message_count + 1,
        blocked = 0
    `).run(
      input.projectId, input.telegramUserId, input.chatId, input.username ?? null,
      input.firstName ?? null, input.lastName ?? null, input.languageCode ?? null, now, now
    )
    const row = this.connection.prepare('SELECT * FROM users WHERE project_id = ? AND telegram_user_id = ?').get(input.projectId, input.telegramUserId) as Row
    return this.mapUser(row)
  }

  markUserBlocked(userId: number): void {
    this.connection.prepare('UPDATE users SET blocked = 1 WHERE id = ?').run(userId)
  }

  setCurrentNode(userId: number, nodeId: string | null): void {
    this.connection.prepare('UPDATE users SET current_node = ? WHERE id = ?').run(nodeId, userId)
  }

  setSession(userId: number, nodeId: string, type: string): void {
    this.connection.prepare(`
      INSERT INTO user_sessions (user_id, pending_node_id, pending_type, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET pending_node_id = excluded.pending_node_id, pending_type = excluded.pending_type, updated_at = excluded.updated_at
    `).run(userId, nodeId, type, new Date().toISOString())
  }

  getSession(userId: number): { nodeId: string; type: string } | null {
    const row = this.connection.prepare('SELECT pending_node_id, pending_type FROM user_sessions WHERE user_id = ?').get(userId) as Row | undefined
    if (!row?.pending_node_id || !row.pending_type) return null
    return { nodeId: String(row.pending_node_id), type: String(row.pending_type) }
  }

  clearSession(userId: number): void {
    this.connection.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId)
  }

  getVariables(projectId: string, userId: number): Record<string, unknown> {
    const rows = this.connection.prepare('SELECT key, value FROM user_variables WHERE project_id = ? AND user_id = ?').all(projectId, userId) as Row[]
    return Object.fromEntries(rows.map(row => {
      try { return [String(row.key), JSON.parse(String(row.value))] }
      catch { return [String(row.key), row.value] }
    }))
  }

  setVariable(projectId: string, userId: number, key: string, value: unknown): void {
    this.connection.prepare(`
      INSERT INTO user_variables (project_id, user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(projectId, userId, key, JSON.stringify(value), new Date().toISOString())
  }

  listUsers(query: UserQuery): PaginatedUsers {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const search = query.search?.trim() ?? ''
    const where = search ? `AND (telegram_user_id LIKE ? OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)` : ''
    const searchParams = search ? Array(4).fill(`%${search}%`) : []
    const countRow = this.connection.prepare(`SELECT COUNT(*) AS total FROM users WHERE project_id = ? ${where}`).get(query.projectId, ...searchParams) as Row
    const sortMap: Record<string, string> = {
      telegramUserId: 'telegram_user_id', username: 'username', firstName: 'first_name', lastName: 'last_name',
      firstStartedAt: 'first_started_at', lastActivityAt: 'last_activity_at', messageCount: 'message_count'
    }
    const sort = sortMap[query.sortBy ?? 'lastActivityAt'] ?? 'last_activity_at'
    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const rows = this.connection.prepare(`
      SELECT * FROM users WHERE project_id = ? ${where}
      ORDER BY ${sort} ${direction}
      LIMIT ? OFFSET ?
    `).all(query.projectId, ...searchParams, pageSize, (page - 1) * pageSize) as Row[]
    return {
      items: rows.map(row => this.mapUser(row)),
      total: Number(countRow.total),
      page,
      pageSize
    }
  }

  getUser(projectId: string, userId: number): TelegramUser {
    const row = this.connection.prepare('SELECT * FROM users WHERE project_id = ? AND id = ?').get(projectId, userId) as Row | undefined
    if (!row) throw new Error('Пользователь не найден')
    return this.mapUser(row)
  }

  segmentUserIds(projectId: string, filters: SegmentFilter[]): number[] {
    const clauses: string[] = ['u.project_id = ?', 'u.blocked = 0']
    const params: SQLInputValue[] = [projectId]
    for (const filter of filters) {
      const value = filter.value ?? ''
      if (filter.operator === 'all') continue
      if (filter.operator === 'username_exists') clauses.push("u.username IS NOT NULL AND u.username <> ''")
      if (filter.operator === 'username_missing') clauses.push("(u.username IS NULL OR u.username = '')")
      if (filter.operator === 'language_code') { clauses.push('u.language_code = ?'); params.push(value) }
      if (filter.operator === 'first_started_after') { clauses.push('u.first_started_at >= ?'); params.push(value) }
      if (filter.operator === 'first_started_before') { clauses.push('u.first_started_at <= ?'); params.push(value) }
      if (filter.operator === 'last_activity_after') { clauses.push('u.last_activity_at >= ?'); params.push(value) }
      if (filter.operator === 'last_activity_before') { clauses.push('u.last_activity_at <= ?'); params.push(value) }
      if (filter.operator.startsWith('variable_')) {
        if (!filter.field) continue
        const valueClause = filter.operator === 'variable_equals' ? 'AND uv.value = ?' : filter.operator === 'variable_contains' ? 'AND uv.value LIKE ?' : ''
        clauses.push(`EXISTS (SELECT 1 FROM user_variables uv WHERE uv.user_id = u.id AND uv.project_id = u.project_id AND uv.key = ? ${valueClause})`)
        params.push(filter.field)
        if (valueClause) params.push(filter.operator === 'variable_contains' ? `%${JSON.stringify(value).slice(1, -1)}%` : JSON.stringify(value))
      }
    }
    return (this.connection.prepare(`SELECT u.id FROM users u WHERE ${clauses.join(' AND ')}`).all(...params) as Row[]).map(row => Number(row.id))
  }

  countSegment(projectId: string, filters: SegmentFilter[]): number {
    return this.segmentUserIds(projectId, filters).length
  }

  createBroadcast(id: string, projectId: string, type: BroadcastType, content: BroadcastContent, filters: SegmentFilter[]): Broadcast {
    const createdAt = new Date().toISOString()
    this.connection.prepare(`
      INSERT INTO broadcasts (id, project_id, type, content, filters, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?)
    `).run(id, projectId, type, JSON.stringify(content), JSON.stringify(filters), createdAt)
    return this.getBroadcast(id)
  }

  getBroadcast(id: string): Broadcast {
    const row = this.connection.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id) as Row | undefined
    if (!row) throw new Error('Рассылка не найдена')
    return this.mapBroadcast(row)
  }

  listBroadcasts(projectId: string): Broadcast[] {
    return (this.connection.prepare('SELECT * FROM broadcasts WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Row[]).map(row => this.mapBroadcast(row))
  }

  prepareBroadcast(id: string): Broadcast {
    const broadcast = this.getBroadcast(id)
    const users = this.segmentUserIds(broadcast.projectId, broadcast.filters)
    this.connection.exec('BEGIN IMMEDIATE')
    try {
      this.connection.prepare('DELETE FROM broadcast_recipients WHERE broadcast_id = ?').run(id)
      const insert = this.connection.prepare('INSERT INTO broadcast_recipients (broadcast_id, user_id, status) VALUES (?, ?, ?)')
      users.forEach(userId => insert.run(id, userId, 'pending'))
      this.connection.prepare(`
        UPDATE broadcasts SET status = 'running', total = ?, sent = 0, failed = 0, started_at = ?, completed_at = NULL WHERE id = ?
      `).run(users.length, new Date().toISOString(), id)
      this.connection.exec('COMMIT')
    } catch (error) {
      this.connection.exec('ROLLBACK')
      throw error
    }
    return this.getBroadcast(id)
  }

  nextBroadcastRecipient(id: string): { recipientId: number; userId: number; chatId: string } | null {
    const row = this.connection.prepare(`
      SELECT br.id AS recipient_id, u.id AS user_id, u.chat_id
      FROM broadcast_recipients br
      JOIN users u ON u.id = br.user_id
      WHERE br.broadcast_id = ? AND br.status = 'pending'
      ORDER BY br.id LIMIT 1
    `).get(id) as Row | undefined
    if (!row) return null
    return { recipientId: Number(row.recipient_id), userId: Number(row.user_id), chatId: String(row.chat_id) }
  }

  completeRecipient(broadcastId: string, recipientId: number, success: boolean, error?: string): Broadcast {
    const status = success ? 'sent' : 'failed'
    this.connection.prepare('UPDATE broadcast_recipients SET status = ?, error = ?, sent_at = ? WHERE id = ?').run(status, error ?? null, new Date().toISOString(), recipientId)
    this.connection.prepare(`
      UPDATE broadcasts SET
        sent = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'sent'),
        failed = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'failed')
      WHERE id = ?
    `).run(broadcastId, broadcastId, broadcastId)
    return this.getBroadcast(broadcastId)
  }

  setBroadcastStatus(id: string, status: BroadcastStatus): Broadcast {
    const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : null
    this.connection.prepare('UPDATE broadcasts SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?').run(status, completedAt, id)
    return this.getBroadcast(id)
  }

  addInteraction(projectId: string, userId: number | null, direction: string, eventType: string, nodeId: string | null, payload: unknown): void {
    this.connection.prepare(`
      INSERT INTO interactions (project_id, user_id, direction, event_type, node_id, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, userId, direction, eventType, nodeId, JSON.stringify(payload), new Date().toISOString())
  }

  private mapProject(row: Row): Project {
    return {
      id: String(row.id),
      name: String(row.name),
      botUsername: row.bot_username ? String(row.bot_username) : null,
      workflow: parseWorkflow(String(row.workflow)),
      status: String(row.status) as Project['status'],
      userCount: Number(row.user_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }
  }

  private mapUser(row: Row): TelegramUser {
    const projectId = String(row.project_id)
    const id = Number(row.id)
    return {
      id,
      projectId,
      telegramUserId: String(row.telegram_user_id),
      chatId: String(row.chat_id),
      username: row.username ? String(row.username) : null,
      firstName: row.first_name ? String(row.first_name) : null,
      lastName: row.last_name ? String(row.last_name) : null,
      languageCode: row.language_code ? String(row.language_code) : null,
      firstStartedAt: String(row.first_started_at),
      lastActivityAt: String(row.last_activity_at),
      messageCount: Number(row.message_count),
      currentNode: row.current_node ? String(row.current_node) : null,
      blocked: Boolean(row.blocked),
      variables: this.getVariables(projectId, id)
    }
  }

  private mapBroadcast(row: Row): Broadcast {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      type: String(row.type) as BroadcastType,
      content: JSON.parse(String(row.content)) as BroadcastContent,
      filters: JSON.parse(String(row.filters)) as SegmentFilter[],
      status: String(row.status) as BroadcastStatus,
      total: Number(row.total),
      sent: Number(row.sent),
      failed: Number(row.failed),
      createdAt: String(row.created_at),
      startedAt: row.started_at ? String(row.started_at) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null
    }
  }
}
