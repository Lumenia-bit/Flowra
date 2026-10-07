import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlowraDatabase } from '../database/database'
import { createInitialWorkflow } from '../shared/nodeRegistry'
import { referencedAssets, parseWorkflow } from '../shared/workflow'
import { evaluateCondition, resolveValue } from '../shared/variables'
import { pythonRuntimeTemplate } from '../exporter/python/template'

describe('workflow primitives', () => {
  it('validates workflows and resolves assets', () => {
    const workflow = createInitialWorkflow()
    workflow.nodes.push({ id: 'photo_1', type: 'sendPhoto', position: { x: 0, y: 0 }, data: { source: 'asset', asset: 'assets/photo.jpg' } })
    expect(parseWorkflow(workflow).nodes).toHaveLength(3)
    expect([...referencedAssets(workflow)]).toEqual(['assets/photo.jpg'])
    expect(() => parseWorkflow({ version: 1, nodes: [], edges: [{ id: 'bad', source: 'a', target: 'b' }] })).toThrow('отсутствующий node')
  })

  it('resolves built-in and user variables without evaluation', () => {
    const context = { user: { first_name: 'Ada' }, chat: { id: 42 }, message: {}, variables: { city: 'London', age: 18 } }
    expect(resolveValue('Привет, {{user.first_name}} из {{city}}', context)).toBe('Привет, Ada из London')
    expect(resolveValue('{{age}}', context)).toBe(18)
    expect(evaluateCondition(18, 'greaterOrEqual', 18)).toBe(true)
    expect(evaluateCondition('London', 'contains', 'don')).toBe(true)
  })

  it('generates syntactically valid Python', () => {
    const result = spawnSync('python', ['-c', 'import sys; compile(sys.stdin.read(), "<flowra>", "exec")'], { input: pythonRuntimeTemplate(), encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  })
})

describe('SQLite data layer', () => {
  let directory: string
  let database: FlowraDatabase

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'flowra-test-'))
    database = new FlowraDatabase(join(directory, 'test.sqlite'))
    database.createProject('project-1', 'Test', '123:token', 'test_bot', createInitialWorkflow())
  })

  afterEach(() => {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('applies migrations without recreating the database', () => {
    expect(database.migrationVersions()).toEqual([1])
    expect(database.listProjects()).toHaveLength(1)
  })

  it('upserts users, persists variables and filters real segments', () => {
    const ada = database.upsertUser({ projectId: 'project-1', telegramUserId: '1', chatId: '11', username: 'ada', firstName: 'Ada', languageCode: 'en' })
    database.upsertUser({ projectId: 'project-1', telegramUserId: '1', chatId: '11', username: 'ada', firstName: 'Ada', languageCode: 'en' })
    const bob = database.upsertUser({ projectId: 'project-1', telegramUserId: '2', chatId: '22', firstName: 'Bob', languageCode: 'de' })
    database.setVariable('project-1', ada.id, 'city', 'London')
    database.setVariable('project-1', bob.id, 'city', 'Berlin')
    expect(database.getUser('project-1', ada.id).messageCount).toBe(2)
    expect(database.countSegment('project-1', [{ operator: 'username_exists' }])).toBe(1)
    expect(database.countSegment('project-1', [{ operator: 'language_code', value: 'de' }])).toBe(1)
    expect(database.countSegment('project-1', [{ operator: 'variable_equals', field: 'city', value: 'London' }])).toBe(1)
    expect(database.countSegment('project-1', [{ operator: 'variable_contains', field: 'city', value: 'erl' }])).toBe(1)
  })

  it('creates a durable broadcast queue and progress', () => {
    database.upsertUser({ projectId: 'project-1', telegramUserId: '1', chatId: '11', username: 'ada' })
    database.upsertUser({ projectId: 'project-1', telegramUserId: '2', chatId: '22', username: 'bob' })
    database.createBroadcast('broadcast-1', 'project-1', 'text', { text: 'Hello' }, [{ operator: 'all' }])
    const prepared = database.prepareBroadcast('broadcast-1')
    expect(prepared.total).toBe(2)
    const recipient = database.nextBroadcastRecipient('broadcast-1')
    expect(recipient).not.toBeNull()
    const progress = database.completeRecipient('broadcast-1', recipient!.recipientId, true)
    expect(progress.sent).toBe(1)
    expect(progress.failed).toBe(0)
  })
})
