import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

export class TelegramError extends Error {
  readonly code: number
  readonly retryAfter?: number

  constructor(message: string, code: number, retryAfter?: number) {
    super(message)
    this.code = code
    this.retryAfter = retryAfter
  }

  get blocked(): boolean {
    return this.code === 403
  }
}

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

export interface TelegramUserData {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramChat {
  id: number
  type: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUserData
  chat: TelegramChat
  text?: string
  contact?: { phone_number: string; first_name: string; last_name?: string; user_id?: number }
  location?: { latitude: number; longitude: number }
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: {
    id: string
    from: TelegramUserData
    message?: TelegramMessage
    data?: string
  }
}

export interface FilePart {
  field: string
  path: string
}

export class TelegramApi {
  private readonly baseUrl: string

  constructor(token: string) {
    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Некорректный формат Telegram Bot Token')
    this.baseUrl = `https://api.telegram.org/bot${token}`
  }

  async call<T>(method: string, payload: Record<string, unknown> = {}, files: FilePart[] = [], signal?: AbortSignal): Promise<T> {
    let body: BodyInit
    let headers: HeadersInit | undefined
    if (files.length) {
      const form = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null) continue
        form.set(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
      for (const file of files) {
        const data = await readFile(file.path)
        form.set(file.field, new Blob([data]), basename(file.path))
      }
      body = form
    } else {
      body = JSON.stringify(payload)
      headers = { 'content-type': 'application/json' }
    }
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/${method}`, { method: 'POST', headers, body, signal })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new Error(`Не удалось подключиться к Telegram: ${error instanceof Error ? error.message : String(error)}`)
    }
    const result = await response.json() as TelegramResponse<T>
    if (!result.ok || !response.ok) {
      throw new TelegramError(result.description ?? `Telegram API error ${response.status}`, result.error_code ?? response.status, result.parameters?.retry_after)
    }
    return result.result as T
  }

  getMe(signal?: AbortSignal): Promise<TelegramUserData> {
    return this.call('getMe', {}, [], signal)
  }

  getUpdates(offset: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, [], signal)
  }
}
