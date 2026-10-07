import { isAbsolute, relative, resolve } from 'node:path'
import type { FlowraDatabase } from '../database/database.js'
import type { TelegramUser, Workflow } from '../shared/types.js'
import type { VariableContext } from '../shared/variables.js'
import type { TelegramApi, TelegramMessage, TelegramUpdate } from './telegram.js'

export interface EngineContext {
  projectId: string
  projectRoot: string
  workflow: Workflow
  api: TelegramApi
  db: FlowraDatabase
  user: TelegramUser
  update: TelegramUpdate
  message: TelegramMessage
  variables: Record<string, unknown>
  lastMessageId?: number
  stop: boolean
}

export function templateContext(context: EngineContext): VariableContext {
  const sourceUser = context.update.message?.from ?? context.update.callback_query?.from
  return {
    user: {
      id: sourceUser?.id,
      username: sourceUser?.username,
      first_name: sourceUser?.first_name,
      last_name: sourceUser?.last_name
    },
    chat: { id: context.message.chat.id },
    message: { id: context.message.message_id, text: context.message.text },
    variables: context.variables,
    location: context.message.location ?? {},
    contact: context.message.contact ?? {}
  }
}

export function assetPath(context: EngineContext, relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/')
  if (!normalized.startsWith('assets/')) throw new Error('Некорректный путь к asset')
  const root = resolve(context.projectRoot)
  const path = resolve(root, normalized)
  const scoped = relative(root, path)
  if (scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('Некорректный путь к asset')
  return path
}
