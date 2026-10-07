import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { dialog } from 'electron'
import type { FlowraDatabase } from '../database/database.js'
import { referencedAssets } from '../shared/workflow.js'
import { pythonRuntimeTemplate } from './python/template.js'

const nodeBootstrap = `import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlowraDatabase } from './runtime/database/database.js'

const root = dirname(fileURLToPath(import.meta.url))
const envPath = join(root, '.env')
const env = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\\r?\\n/)) {
    const index = line.indexOf('=')
    if (index > 0 && !line.trimStart().startsWith('#')) env[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
}
const token = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN in .env or environment')
const workflow = JSON.parse(readFileSync(join(root, 'workflow.json'), 'utf8'))
const databasePath = join(root, 'data.sqlite')
const projectId = basename(root)
const db = new FlowraDatabase(databasePath)
try { db.getProject(projectId); db.updateProject(projectId, { token, workflow }) }
catch { db.createProject(projectId, 'Exported bot', token, null, workflow) }
db.close()
process.argv[2] = databasePath
process.argv[3] = projectId
process.argv[4] = dirname(root)
await import('./runtime/bot/runner.js')
`

export class ExportService {
  constructor(private readonly database: FlowraDatabase, private readonly projectsRoot: string) {}

  async export(projectId: string, target: 'javascript' | 'python'): Promise<string | null> {
    const project = this.database.getProject(projectId)
    const defaultName = `${this.slug(project.name)}-${target === 'javascript' ? 'node' : 'python'}.zip`
    const save = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] })
    if (save.canceled || !save.filePath) return null
    const zip = new JSZip()
    zip.file('workflow.json', JSON.stringify(project.workflow, null, 2))
    zip.file('.env.example', 'TELEGRAM_BOT_TOKEN=\n')
    zip.file('.gitignore', '.env\ndata.sqlite\n__pycache__/\n')
    if (target === 'javascript') this.addJavaScript(zip, project.name)
    else this.addPython(zip, project.name)
    for (const relativePath of referencedAssets(project.workflow)) {
      const root = resolve(this.projectsRoot, projectId)
      const path = resolve(root, relativePath)
      const scoped = relative(root, path)
      if (scoped.startsWith('..') || isAbsolute(scoped)) throw new Error(`Некорректный asset path: ${relativePath}`)
      try { zip.file(relativePath, readFileSync(path)) }
      catch { throw new Error(`Не удалось добавить asset: ${relativePath}`) }
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    writeFileSync(save.filePath, output)
    return save.filePath
  }

  private addJavaScript(zip: JSZip, name: string): void {
    zip.file('index.js', nodeBootstrap)
    zip.file('package.json', JSON.stringify({
      name: this.slug(name), version: '1.0.0', private: true, type: 'module',
      scripts: { start: 'node index.js' }, engines: { node: '>=22.5' }
    }, null, 2))
    const compiledRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    for (const folder of ['bot', 'database', 'shared']) this.addDirectory(zip, join(compiledRoot, folder), `runtime/${folder}`)
    zip.file('README.md', this.readme(name, 'Node.js 22.5+', 'npm start', 'В экспортированном проекте используется встроенный node:sqlite, поэтому npm install не требуется.'))
  }

  private addPython(zip: JSZip, name: string): void {
    zip.file('index.py', pythonRuntimeTemplate())
    zip.file('requirements.txt', '')
    zip.file('README.md', this.readme(name, 'Python 3.10+', 'python index.py', 'Runtime использует только стандартную библиотеку Python; pip install выполнять не требуется.'))
  }

  private addDirectory(zip: JSZip, path: string, destination: string): void {
    for (const entry of readdirSync(path)) {
      const source = join(path, entry)
      const target = `${destination}/${entry}`
      if (statSync(source).isDirectory()) this.addDirectory(zip, source, target)
      else if (extname(entry) === '.js') zip.file(target, readFileSync(source))
    }
  }

  private readme(name: string, requirement: string, command: string, runtimeNote: string): string {
    return `# ${name}\n\nStandalone Telegram-бот, экспортированный из Flowra.\n\n## Требования\n\n- ${requirement}\n\n## Запуск\n\n1. Скопируйте \`.env.example\` в \`.env\`.\n2. Вставьте токен: \`TELEGRAM_BOT_TOKEN=...\`.\n3. Запустите \`${command}\`.\n\n${runtimeNote}\n\nWorkflow находится в \`workflow.json\`, локальные файлы — в \`assets/\`, пользовательские переменные сохраняются в \`data.sqlite\`. Реальный токен и база пользователей из Flowra не экспортируются. Broadcast — функция desktop-приложения и в standalone runtime не включён.\n`
  }

  private slug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '') || 'flowra-bot'
  }
}
