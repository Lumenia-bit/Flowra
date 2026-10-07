import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { FlowraDatabase } from '../database/database.js'
import type { Broadcast } from '../shared/types.js'
import { TelegramApi, TelegramError, type FilePart } from '../bot/telegram.js'

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export class BroadcastManager {
  private readonly cancelled = new Set<string>()
  private readonly running = new Set<string>()

  constructor(
    private readonly database: FlowraDatabase,
    private readonly projectsRoot: string,
    private readonly window: () => BrowserWindow | null
  ) {}

  start(id: string): void {
    if (this.running.has(id)) throw new Error('Рассылка уже запущена')
    this.cancelled.delete(id)
    this.running.add(id)
    void this.run(id).finally(() => this.running.delete(id))
  }

  stop(id: string): void {
    this.cancelled.add(id)
    const current = this.database.getBroadcast(id)
    if (current.status === 'running') this.emit(this.database.setBroadcastStatus(id, 'cancelled'))
  }

  private async run(id: string): Promise<void> {
    let broadcast: Broadcast
    try {
      broadcast = this.database.prepareBroadcast(id)
      this.emit(broadcast)
      const project = this.database.getInternalProject(broadcast.projectId)
      const api = new TelegramApi(project.token)
      if (broadcast.total === 0) {
        this.emit(this.database.setBroadcastStatus(id, 'completed'))
        return
      }
      while (!this.cancelled.has(id)) {
        const recipient = this.database.nextBroadcastRecipient(id)
        if (!recipient) break
        let success = false
        let errorMessage: string | undefined
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await this.send(api, broadcast, recipient.chatId)
            success = true
            break
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error)
            if (error instanceof TelegramError && error.retryAfter) {
              await wait((error.retryAfter + 1) * 1000)
              continue
            }
            if (error instanceof TelegramError && error.blocked) this.database.markUserBlocked(recipient.userId)
            break
          }
        }
        broadcast = this.database.completeRecipient(id, recipient.recipientId, success, errorMessage)
        this.emit(broadcast)
        await wait(40)
      }
      if (!this.cancelled.has(id)) this.emit(this.database.setBroadcastStatus(id, 'completed'))
    } catch (error) {
      try { this.emit(this.database.setBroadcastStatus(id, 'failed')) }
      catch (statusError) { void statusError }
      this.window()?.webContents.send('runtime:log', {
        projectId: this.database.getBroadcast(id).projectId,
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `Broadcast: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  private async send(api: TelegramApi, broadcast: Broadcast, chatId: string): Promise<void> {
    const content = broadcast.content
    const mode = content.parseMode && content.parseMode !== 'none' ? content.parseMode : undefined
    if (broadcast.type === 'text') {
      await api.call('sendMessage', { chat_id: chatId, text: content.text ?? '', parse_mode: mode })
      return
    }
    if (!content.asset) throw new Error('Asset для рассылки не выбран')
    const path = join(this.projectsRoot, broadcast.projectId, content.asset)
    if (!existsSync(path)) throw new Error(`Asset не найден: ${content.asset}`)
    const methodMap = { photo: 'sendPhoto', video: 'sendVideo', document: 'sendDocument', audio: 'sendAudio', voice: 'sendVoice' } as const
    const method = methodMap[broadcast.type as keyof typeof methodMap]
    if (!method) throw new Error('Тип рассылки не поддерживается')
    const field = broadcast.type
    const files: FilePart[] = [{ field, path }]
    await api.call(method, { chat_id: chatId, [field]: `attach://${field}`, caption: content.caption, parse_mode: mode }, files)
  }

  private emit(broadcast: Broadcast): void {
    this.window()?.webContents.send('broadcast:progress', broadcast)
  }
}
