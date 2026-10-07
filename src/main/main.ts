import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain } from 'electron'
import { FlowraDatabase } from '../database/database.js'
import { createInitialWorkflow } from '../shared/nodeRegistry.js'
import type { Broadcast, ProjectCreateInput, ProjectUpdateInput } from '../shared/types.js'
import { TelegramApi } from '../bot/telegram.js'
import { AssetService } from './assetService.js'
import { RuntimeManager } from './runtimeManager.js'
import { BroadcastManager } from './broadcastManager.js'
import { ExportService } from '../exporter/exportService.js'

let window: BrowserWindow | null = null
let database: FlowraDatabase
let runtime: RuntimeManager

const userData = app.getPath('userData')
const databasePath = join(userData, 'flowra.sqlite')
const projectsRoot = join(userData, 'projects')

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#111318',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  window.setMenuBarVisibility(false)
  window.once('ready-to-show', () => window?.show())
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(import.meta.dirname, '../../dist/index.html'))
  window.on('closed', () => { window = null })
}

function safeProjectDirectory(id: string): string {
  const root = resolve(projectsRoot)
  const target = resolve(root, id)
  const scoped = relative(root, target)
  if (!scoped || scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('Некорректный project id')
  return target
}

function registerIpc(): void {
  const assets = new AssetService(database, projectsRoot)
  const broadcaster = new BroadcastManager(database, projectsRoot, () => window)
  const exporter = new ExportService(database, projectsRoot)

  ipcMain.handle('projects:list', () => database.listProjects())
  ipcMain.handle('projects:create', async (_event, input: ProjectCreateInput) => {
    const name = input.name.trim()
    const token = input.token.trim()
    if (!name) throw new Error('Введите название бота')
    const api = new TelegramApi(token)
    const me = await api.getMe(AbortSignal.timeout(15_000))
    const id = randomUUID()
    mkdirSync(join(projectsRoot, id, 'assets'), { recursive: true })
    return database.createProject(id, name, token, me.username ?? null, createInitialWorkflow())
  })
  ipcMain.handle('projects:update', async (_event, input: ProjectUpdateInput) => {
    let botUsername: string | null | undefined
    if (input.token !== undefined) {
      const me = await new TelegramApi(input.token.trim()).getMe(AbortSignal.timeout(15_000))
      botUsername = me.username ?? null
    }
    return database.updateProject(input.id, {
      name: input.name?.trim(), token: input.token?.trim(), workflow: input.workflow, botUsername
    })
  })
  ipcMain.handle('projects:remove', async (_event, id: string) => {
    await runtime.stop(id)
    database.deleteProject(id)
    const directory = safeProjectDirectory(id)
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true })
  })
  ipcMain.handle('projects:duplicate', (_event, id: string) => {
    const source = database.getProject(id)
    const newId = randomUUID()
    const project = database.duplicateProject(id, newId, `${source.name} — копия`)
    const sourceDirectory = safeProjectDirectory(id)
    const targetDirectory = safeProjectDirectory(newId)
    if (existsSync(sourceDirectory)) cpSync(sourceDirectory, targetDirectory, { recursive: true })
    else mkdirSync(join(targetDirectory, 'assets'), { recursive: true })
    for (const row of database.listAssets(id)) {
      database.addAsset(randomUUID(), newId, String(row.relative_path), String(row.original_name), String(row.mime_type), Number(row.size))
    }
    return project
  })
  ipcMain.handle('assets:choose', (_event, projectId: string, kind: string) => assets.choose(projectId, kind))
  ipcMain.handle('assets:inspect', (_event, projectId: string, path: string) => assets.info(projectId, path))
  ipcMain.handle('assets:unused', (_event, projectId: string) => assets.unused(projectId))
  ipcMain.handle('assets:cleanup', (_event, projectId: string) => assets.cleanup(projectId))

  ipcMain.handle('runtime:start', (_event, projectId: string) => runtime.start(projectId))
  ipcMain.handle('runtime:stop', (_event, projectId: string) => runtime.stop(projectId))
  ipcMain.handle('runtime:status', (_event, projectId: string) => runtime.status(projectId))

  ipcMain.handle('users:list', (_event, query) => database.listUsers(query))
  ipcMain.handle('users:get', (_event, projectId: string, userId: number) => database.getUser(projectId, userId))
  ipcMain.handle('users:count', (_event, projectId: string, filters) => database.countSegment(projectId, filters))

  ipcMain.handle('broadcasts:list', (_event, projectId: string) => database.listBroadcasts(projectId))
  ipcMain.handle('broadcasts:create', (_event, input: Omit<Broadcast, 'id' | 'status' | 'total' | 'sent' | 'failed' | 'createdAt' | 'startedAt' | 'completedAt'>) =>
    database.createBroadcast(randomUUID(), input.projectId, input.type, input.content, input.filters)
  )
  ipcMain.handle('broadcasts:start', (_event, id: string) => broadcaster.start(id))
  ipcMain.handle('broadcasts:stop', (_event, id: string) => broadcaster.stop(id))
  ipcMain.handle('export:bot', (_event, projectId: string, target: 'javascript' | 'python') => exporter.export(projectId, target))
  ipcMain.handle('system:version', () => app.getVersion())
}

app.whenReady().then(() => {
  mkdirSync(projectsRoot, { recursive: true })
  database = new FlowraDatabase(databasePath)
  runtime = new RuntimeManager(database, databasePath, projectsRoot, () => window)
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => { void runtime?.stopAll() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
