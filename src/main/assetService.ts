import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dialog } from 'electron'
import type { FlowraDatabase } from '../database/database.js'
import { mediaRules, mimeTypes } from '../shared/media.js'
import type { AssetInfo } from '../shared/types.js'
import { referencedAssets } from '../shared/workflow.js'

export class AssetService {
  constructor(private readonly database: FlowraDatabase, private readonly projectsRoot: string) {}

  async choose(projectId: string, kind: string): Promise<AssetInfo | null> {
    const rule = mediaRules[kind] ?? mediaRules.document
    const filters = rule.extensions.length ? [{ name: kind, extensions: rule.extensions.map(item => item.slice(1)) }] : undefined
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (result.canceled || !result.filePaths[0]) return null
    const source = result.filePaths[0]
    const extension = extname(source).toLowerCase()
    if (rule.extensions.length && !rule.extensions.includes(extension)) throw new Error(`Формат ${extension || 'без расширения'} не подходит для ${kind}`)
    const stat = statSync(source)
    if (stat.size > rule.maxSize) throw new Error(`Файл превышает лимит ${Math.round(rule.maxSize / 1024 / 1024)} МБ`)
    const id = randomUUID()
    const safeBase = basename(source, extension).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || kind
    const filename = `${safeBase}-${id.slice(0, 8)}${extension}`
    const relativePath = `assets/${filename}`
    const directory = join(this.projectsRoot, projectId, 'assets')
    mkdirSync(directory, { recursive: true })
    copyFileSync(source, join(directory, filename))
    const mimeType = mimeTypes[extension] ?? 'application/octet-stream'
    this.database.addAsset(id, projectId, relativePath, basename(source), mimeType, stat.size)
    return this.info(projectId, relativePath)
  }

  info(projectId: string, relativePath: string): AssetInfo {
    const path = this.resolveAsset(projectId, relativePath)
    if (!existsSync(path)) throw new Error('Asset не найден')
    const extension = extname(path).toLowerCase()
    const mimeType = mimeTypes[extension] ?? 'application/octet-stream'
    const result: AssetInfo = {
      path: relativePath.replaceAll('\\', '/'),
      filename: basename(path),
      mimeType,
      size: statSync(path).size
    }
    if (mimeType.startsWith('image/')) result.previewUrl = `data:${mimeType};base64,${readFileSync(path).toString('base64')}`
    return result
  }

  unused(projectId: string): AssetInfo[] {
    const used = referencedAssets(this.database.getProject(projectId).workflow)
    return this.database.listAssets(projectId)
      .filter(row => !used.has(String(row.relative_path).replaceAll('\\', '/')))
      .map(row => this.info(projectId, String(row.relative_path)))
  }

  cleanup(projectId: string): number {
    const unused = this.unused(projectId)
    for (const asset of unused) {
      const path = this.resolveAsset(projectId, asset.path)
      if (existsSync(path)) rmSync(path)
      this.database.removeAsset(projectId, asset.path)
    }
    return unused.length
  }

  private resolveAsset(projectId: string, relativePath: string): string {
    const root = resolve(this.projectsRoot, projectId)
    const path = resolve(root, relativePath)
    const scoped = relative(root, path)
    if (!scoped || scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('Некорректный путь к asset')
    return path
  }
}
