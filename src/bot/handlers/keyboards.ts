import { resolveValue } from '../../shared/variables.js'
import { templateContext } from '../context.js'
import type { NodeHandler } from './types.js'

export const inlineButtons: NodeHandler = async (node, context) => {
  const rows = Array.isArray(node.data.rows) ? node.data.rows as any[][] : []
  const inlineKeyboard = rows.map(row => row.map(button => {
    const text = String(resolveValue(button.text, templateContext(context)))
    if (button.action === 'url') return { text, url: String(resolveValue(button.value, templateContext(context))) }
    if (button.action === 'node') return { text, callback_data: `node:${button.value}` }
    return { text, callback_data: String(resolveValue(button.value, templateContext(context))) }
  }))
  if (context.lastMessageId) {
    await context.api.call('editMessageReplyMarkup', {
      chat_id: context.message.chat.id,
      message_id: context.lastMessageId,
      reply_markup: { inline_keyboard: inlineKeyboard }
    })
  } else {
    const result = await context.api.call<{ message_id: number }>('sendMessage', {
      chat_id: context.message.chat.id,
      text: 'Выберите действие',
      reply_markup: { inline_keyboard: inlineKeyboard }
    })
    context.lastMessageId = result.message_id
  }
  return {}
}

export const replyKeyboard: NodeHandler = async (node, context) => {
  const rows = Array.isArray(node.data.rows) ? node.data.rows as any[][] : []
  const keyboard = rows.map(row => row.map(button => ({
    text: String(resolveValue(button.text, templateContext(context))),
    request_contact: button.action === 'contact' || undefined,
    request_location: button.action === 'location' || undefined
  })))
  const result = await context.api.call<{ message_id: number }>('sendMessage', {
    chat_id: context.message.chat.id,
    text: 'Выберите действие',
    reply_markup: {
      keyboard,
      resize_keyboard: Boolean(node.data.resize),
      one_time_keyboard: Boolean(node.data.oneTime)
    }
  })
  context.lastMessageId = result.message_id
  return {}
}

export const urlButton: NodeHandler = async (node, context) => {
  const text = String(resolveValue(node.data.text, templateContext(context)))
  const url = String(resolveValue(node.data.url, templateContext(context)))
  try { new URL(url) } catch { throw new Error('URL кнопки некорректен') }
  const result = await context.api.call<{ message_id: number }>('sendMessage', {
    chat_id: context.message.chat.id,
    text,
    reply_markup: { inline_keyboard: [[{ text, url }]] }
  })
  context.lastMessageId = result.message_id
  return {}
}
