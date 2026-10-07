import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow } from 'electron'
import type { FlowraDatabase } from '../database/database.js'
import type { RuntimeLog } from '../shared/types.js'

export class RuntimeManager {
  private readonly processes = new Map<string, ChildProcessByStdio<null, Readable, Readable>>()

  constructor(
    private readonly database: FlowraDatabase,
    private readonly databasePath: string,
    private readonly projectsRoot: string,
    private readonly window: () => BrowserWindow | null
  ) {}

  start(projectId: string): void {
    if (this.processes.has(projectId)) throw new Error('Бот уже запущен')
    const project = this.database.getInternalProject(projectId)
    if (!project.token) throw new Error('Telegram Bot Token не задан')
    const runner = this.runnerPath()
    if (!existsSync(runner)) throw new Error(`Runtime не собран: ${runner}`)
    const child = spawn(process.execPath, [runner, this.databasePath, projectId, this.projectsRoot], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.processes.set(projectId, child)
    this.database.updateProject(projectId, { status: 'running' })
    this.emitStatus(projectId, 'running')
    this.emitLog(projectId, 'INFO', 'Bot process started')
    let stdoutBuffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''
      lines.filter(Boolean).forEach(line => this.parseLine(projectId, line, 'INFO'))
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => String(chunk).split(/\r?\n/).filter(Boolean).forEach(line => this.emitLog(projectId, 'ERROR', this.redact(line, project.token))))
    child.on('error', error => this.emitLog(projectId, 'ERROR', this.redact(error.message, project.token)))
    child.on('exit', code => {
      this.processes.delete(projectId)
      const status = code === 0 || code === null ? 'stopped' : 'error'
      try { this.database.updateProject(projectId, { status }) }
      catch (error) { this.emitLog(projectId, 'ERROR', error instanceof Error ? error.message : String(error)) }
      this.emitStatus(projectId, status)
      this.emitLog(projectId, code === 0 || code === null ? 'INFO' : 'ERROR', `Bot process stopped${code === null ? '' : ` (code ${code})`}`)
    })
  }

  async stop(projectId: string): Promise<void> {
    const child = this.processes.get(projectId)
    if (!child) {
      this.database.updateProject(projectId, { status: 'stopped' })
      this.emitStatus(projectId, 'stopped')
      return
    }
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        if (!child.killed) child.kill()
        resolve()
      }, 3000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }

  status(projectId: string): string {
    return this.processes.has(projectId) ? 'running' : this.database.getProject(projectId).status
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map(id => this.stop(id)))
  }

  private runnerPath(): string {
    const base = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'bot', 'runner.js')
    if (!process.resourcesPath || !base.includes('app.asar')) return base
    return base.replace('app.asar', 'app.asar.unpacked')
  }

  private parseLine(projectId: string, line: string, fallback: RuntimeLog['level']): void {
    try {
      const parsed = JSON.parse(line) as Partial<RuntimeLog>
      this.emitLog(projectId, parsed.level ?? fallback, String(parsed.message ?? line), parsed.timestamp)
    } catch {
      this.emitLog(projectId, fallback, line)
    }
  }

  private redact(value: string, token: string): string {
    return token ? value.replaceAll(token, '[REDACTED]') : value
  }

  private emitLog(projectId: string, level: RuntimeLog['level'], message: string, timestamp = new Date().toISOString()): void {
    this.window()?.webContents.send('runtime:log', { projectId, level, message, timestamp } satisfies RuntimeLog)
  }

  private emitStatus(projectId: string, status: string): void {
    this.window()?.webContents.send('runtime:status', { projectId, status })
  }
}
