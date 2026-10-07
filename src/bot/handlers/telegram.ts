import { access } from 'node:fs/promises'
import type { WorkflowNode } from '../../shared/types.js'
import { resolveValue } from '../../shared/variables.js'
import { assetPath, templateContext, type EngineContext } from '../context.js'
import type { FilePart } from '../telegram.js'
import type { HandlerResult, NodeHandler } from './types.js'

type Data = Record<string, any>

function parseMode(value: unknown): string | undefined {
  return value === 'Markdown' || value === 'HTML' ? value : undefined
}

function resolved(value: unknown, context: EngineContext): any {
  return resolveValue(value, templateContext(context))
}

function mediaInput(data: Data, context: EngineContext, field: string): { value: string; files: FilePart[] } {
  if (data.source === 'asset') {
    const path = assetPath(context, String(data.asset ?? ''))
    return { value: `attach://${field}`, files: [{ field, path }] }
  }
  if (data.source === 'url') return { value: String(resolved(data.url, context)), files: [] }
  return { value: String(resolved(data.fileId, context)), files: [] }
}

async function sendMedia(node: WorkflowNode, context: EngineContext, method: string, field: string): Promise<HandlerResult> {
  const data = node.data as Data
  const media = mediaInput(data, context, field)
  if (media.files.length) await access(media.files[0].path)
  const payload: Record<string, unknown> = { chat_id: context.message.chat.id, [field]: media.value }
  if (data.caption) payload.caption = resolved(data.caption, context)
  const mode = parseMode(data.parseMode)
  if (mode) payload.parse_mode = mode
  const result = await context.api.call<{ message_id: number }>(method, payload, media.files)
  context.lastMessageId = result.message_id
  return {}
}

export const sendMessage: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const payload: Record<string, unknown> = { chat_id: context.message.chat.id, text: String(resolved(data.text ?? '', context)) }
  const mode = parseMode(data.parseMode)
  if (mode) payload.parse_mode = mode
  const result = await context.api.call<{ message_id: number }>('sendMessage', payload)
  context.lastMessageId = result.message_id
  return {}
}

export const sendPhoto: NodeHandler = (node, context) => sendMedia(node, context, 'sendPhoto', 'photo')
export const sendVideo: NodeHandler = (node, context) => sendMedia(node, context, 'sendVideo', 'video')
export const sendAudio: NodeHandler = (node, context) => sendMedia(node, context, 'sendAudio', 'audio')
export const sendVoice: NodeHandler = (node, context) => sendMedia(node, context, 'sendVoice', 'voice')
export const sendDocument: NodeHandler = (node, context) => sendMedia(node, context, 'sendDocument', 'document')

export const sendLocation: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const latitude = Number(resolved(data.latitude, context))
  const longitude = Number(resolved(data.longitude, context))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Latitude и longitude должны быть числами')
  const result = await context.api.call<{ message_id: number }>('sendLocation', { chat_id: context.message.chat.id, latitude, longitude })
  context.lastMessageId = result.message_id
  return {}
}

export const sendContact: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const result = await context.api.call<{ message_id: number }>('sendContact', {
    chat_id: context.message.chat.id,
    phone_number: String(resolved(data.phoneNumber, context)),
    first_name: String(resolved(data.firstName, context)),
    last_name: String(resolved(data.lastName, context) ?? '') || undefined
  })
  context.lastMessageId = result.message_id
  return {}
}

export const sendPoll: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const result = await context.api.call<{ message_id: number }>('sendPoll', {
    chat_id: context.message.chat.id,
    question: String(resolved(data.question, context)),
    options: (data.answers ?? []).map((answer: unknown) => String(resolved(answer, context))),
    is_anonymous: Boolean(data.anonymous),
    allows_multiple_answers: Boolean(data.multipleAnswers)
  })
  context.lastMessageId = result.message_id
  return {}
}

export const sendQuiz: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const result = await context.api.call<{ message_id: number }>('sendPoll', {
    chat_id: context.message.chat.id,
    question: String(resolved(data.question, context)),
    options: (data.answers ?? []).map((answer: unknown) => String(resolved(answer, context))),
    type: 'quiz',
    correct_option_id: Math.max(0, Number(data.correctAnswer ?? 1) - 1),
    explanation: String(resolved(data.explanation ?? '', context)),
    is_anonymous: Boolean(data.anonymous)
  })
  context.lastMessageId = result.message_id
  return {}
}

export const sendMediaGroup: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const items = Array.isArray(data.items) ? data.items : []
  if (items.length < 2 || items.length > 10) throw new Error('Media Group должен содержать от 2 до 10 элементов')
  const files: FilePart[] = []
  const media = items.map((item: Data, index: number) => {
    const field = `media_${index}`
    const input = mediaInput(item, context, field)
    files.push(...input.files)
    return {
      type: item.type === 'video' ? 'video' : 'photo',
      media: input.value,
      caption: item.caption ? String(resolved(item.caption, context)) : undefined,
      parse_mode: parseMode(item.parseMode)
    }
  })
  for (const file of files) await access(file.path)
  const result = await context.api.call<Array<{ message_id: number }>>('sendMediaGroup', { chat_id: context.message.chat.id, media }, files)
  context.lastMessageId = result.at(-1)?.message_id
  return {}
}

export const editMessage: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const messageId = Number(resolved(data.messageId, context) ?? context.lastMessageId)
  await context.api.call('editMessageText', { chat_id: context.message.chat.id, message_id: messageId, text: String(resolved(data.text, context)) })
  return {}
}

export const deleteMessage: NodeHandler = async (node, context) => {
  const data = node.data as Data
  const messageId = Number(resolved(data.messageId, context) ?? context.lastMessageId)
  await context.api.call('deleteMessage', { chat_id: context.message.chat.id, message_id: messageId })
  return {}
}

export const telegramHandlers = {
  sendMessage, sendPhoto, sendVideo, sendAudio, sendVoice, sendDocument,
  sendLocation, sendContact, sendPoll, sendQuiz, sendMediaGroup, editMessage, deleteMessage
}
