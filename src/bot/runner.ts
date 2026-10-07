import { join } from 'node:path'
import { FlowraDatabase } from '../database/database.js'
import type { WorkflowNode } from '../shared/types.js'
import { WorkflowEngine, log } from './engine.js'
import { type EngineContext } from './context.js'
import { TelegramApi, type TelegramMessage, type TelegramUpdate } from './telegram.js'

const databasePath = process.argv[2]
const projectId = process.argv[3]
const projectsRoot = process.argv[4]

if (!databasePath || !projectId || !projectsRoot) throw new Error('Runtime arguments are missing')

const db = new FlowraDatabase(databasePath)
const project = db.getInternalProject(projectId)
const api = new TelegramApi(project.token)
const engine = new WorkflowEngine()
const abortController = new AbortController()

function triggerFor(update: TelegramUpdate): WorkflowNode | undefined {
  const callbackData = update.callback_query?.data
  if (callbackData?.startsWith('node:')) return project.workflow.nodes.find(node => node.id === callbackData.slice(5))
  if (callbackData !== undefined) {
    return project.workflow.nodes.find(node => node.type === 'callbackTrigger' && String(node.data.callbackData ?? '') === callbackData)
  }
  const text = update.message?.text ?? ''
  if (text === '/start' || text.startsWith('/start ')) return project.workflow.nodes.find(node => node.type === 'start')
  if (text.startsWith('/')) {
    const command = text.split(/\s/, 1)[0].split('@', 1)[0]
    const node = project.workflow.nodes.find(item => item.type === 'command' && String(item.data.command ?? '').trim() === command)
    if (node) return node
  }
  return project.workflow.nodes.find(node => node.type === 'messageTrigger' && (!node.data.contains || text.includes(String(node.data.contains))))
}

function sourceMessage(update: TelegramUpdate): TelegramMessage | undefined {
  return update.message ?? update.callback_query?.message
}

function inputValue(message: TelegramMessage, type: string): { accepted: boolean; value?: unknown } {
  if (type === 'contact') return { accepted: Boolean(message.contact), value: message.contact }
  if (type === 'location') return { accepted: Boolean(message.location), value: message.location }
  if (type === 'number') {
    const number = Number(message.text)
    return { accepted: Number.isFinite(number), value: number }
  }
  return { accepted: typeof message.text === 'string', value: message.text }
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  const message = sourceMessage(update)
  const from = update.message?.from ?? update.callback_query?.from
  if (!message || !from) return
  const user = db.upsertUser({
    projectId,
    telegramUserId: String(from.id),
    chatId: String(message.chat.id),
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    languageCode: from.language_code
  })
  db.addInteraction(projectId, user.id, 'in', update.callback_query ? 'callback' : 'message', null, {
    text: update.message?.text,
    callbackData: update.callback_query?.data
  })
  const variables = db.getVariables(projectId, user.id)
  const context: EngineContext = {
    projectId,
    projectRoot: join(projectsRoot, projectId),
    workflow: project.workflow,
    api,
    db,
    user,
    update,
    message,
    variables,
    stop: false
  }
  if (update.callback_query) await api.call('answerCallbackQuery', { callback_query_id: update.callback_query.id })
  const session = db.getSession(user.id)
  if (session && update.message) {
    const inputNode = project.workflow.nodes.find(node => node.id === session.nodeId)
    const result = inputValue(message, session.type)
    if (!result.accepted || !inputNode) {
      await api.call('sendMessage', { chat_id: message.chat.id, text: `Ожидается: ${session.type}` })
      return
    }
    const key = String(inputNode.data.variable)
    variables[key] = result.value
    db.setVariable(projectId, user.id, key, result.value)
    db.clearSession(user.id)
    const edge = project.workflow.edges.find(item => item.source === inputNode.id && (!item.sourceHandle || item.sourceHandle === 'next'))
    const next = edge ? project.workflow.nodes.find(node => node.id === edge.target) : undefined
    if (next) await engine.execute(next, context)
    return
  }
  const trigger = triggerFor(update)
  if (!trigger) return
  log('INFO', `${from.username ? `@${from.username}` : from.id} -> ${update.message?.text ?? update.callback_query?.data ?? 'event'}`)
  await engine.execute(trigger, context)
}

async function run(): Promise<void> {
  const me = await api.getMe(abortController.signal)
  db.updateProject(projectId, { status: 'running', botUsername: me.username ?? null })
  log('INFO', `Connected as @${me.username ?? me.first_name}`)
  log('INFO', 'Listening for updates')
  let offset = 0
  while (!abortController.signal.aborted) {
    try {
      const updates = await api.getUpdates(offset, abortController.signal)
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1)
        try { await processUpdate(update) }
        catch (error) { log('ERROR', error instanceof Error ? error.message : String(error)) }
      }
    } catch (error) {
      if (abortController.signal.aborted) break
      log('ERROR', error instanceof Error ? error.message : String(error))
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function shutdown(): Promise<void> {
  abortController.abort()
  try { db.updateProject(projectId, { status: 'stopped' }) }
  catch (error) { log('WARN', `Не удалось обновить статус: ${error instanceof Error ? error.message : String(error)}`) }
  db.close()
}

process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

run().catch(async error => {
  log('ERROR', error instanceof Error ? error.message : String(error))
  try { db.updateProject(projectId, { status: 'error' }) }
  catch (statusError) { log('WARN', `Не удалось записать ошибку статуса: ${statusError instanceof Error ? statusError.message : String(statusError)}`) }
  await shutdown()
  process.exit(1)
})
