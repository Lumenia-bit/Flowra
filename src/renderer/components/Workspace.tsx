import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, Download, Play, Radio, Square, Terminal, Users } from 'lucide-react'
import type { Project, RuntimeLog } from '../../shared/types'
import { WorkflowEditor } from '../editor/WorkflowEditor'
import { UsersPage } from '../users/UsersPage'
import { BroadcastPage } from '../broadcast/BroadcastPage'
import { ConsolePanel } from './ConsolePanel'
import { Modal } from './Modal'

type Section = 'editor' | 'users' | 'broadcast'

interface WorkspaceProps {
  project: Project
  onBack(): void
  onProjectChange(project: Project): void
}

export function Workspace({ project, onBack, onProjectChange }: WorkspaceProps) {
  const [section, setSection] = useState<Section>('editor')
  const [status, setStatus] = useState(project.status)
  const [logs, setLogs] = useState<RuntimeLog[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState(false)

  useEffect(() => {
    const offLog = window.flowra.runtime.onLog(log => {
      if (log.projectId === project.id) {
        setLogs(items => [...items.slice(-999), log])
        setConsoleOpen(true)
      }
    })
    const offStatus = window.flowra.runtime.onStatus(event => {
      if (event.projectId === project.id) setStatus(event.status as Project['status'])
    })
    return () => { offLog(); offStatus() }
  }, [project.id])

  const toggleRuntime = async () => {
    setRuntimeBusy(true)
    setConsoleOpen(true)
    try {
      if (status === 'running') await window.flowra.runtime.stop(project.id)
      else await window.flowra.runtime.start(project.id)
    } catch (reason) {
      setLogs(items => [...items, { projectId: project.id, timestamp: new Date().toISOString(), level: 'ERROR', message: reason instanceof Error ? reason.message : String(reason) }])
    } finally { setRuntimeBusy(false) }
  }

  return <div className="workspace-shell">
    <header className="workspace-topbar">
      <div className="workspace-identity">
        <button className="icon-button back-button" onClick={onBack}><ArrowLeft size={18} /></button>
        <div className="brand-mark small">F</div>
        <div><strong>{project.name}</strong><span>{project.botUsername ? `@${project.botUsername}` : 'Telegram bot'}</span></div>
      </div>
      <nav className="workspace-nav">
        <button className={section === 'editor' ? 'active' : ''} onClick={() => setSection('editor')}>Workflow</button>
        <button className={section === 'users' ? 'active' : ''} onClick={() => setSection('users')}><Users size={15} /> Users</button>
        <button className={section === 'broadcast' ? 'active' : ''} onClick={() => setSection('broadcast')}><Radio size={15} /> Broadcast</button>
      </nav>
      <div className="workspace-actions">
        <button className="toolbar-button" onClick={() => setConsoleOpen(value => !value)}><Terminal size={16} /> Console</button>
        <button className="toolbar-button" onClick={() => setExportOpen(true)}><Download size={16} /> Скачать <ChevronDown size={14} /></button>
        <button className={status === 'running' ? 'stop-button' : 'run-button'} onClick={() => void toggleRuntime()} disabled={runtimeBusy}>
          {status === 'running' ? <><Square size={14} fill="currentColor" /> Остановить</> : <><Play size={15} fill="currentColor" /> Запустить</>}
        </button>
      </div>
    </header>
    <div className={`workspace-body ${consoleOpen ? 'with-console' : ''}`}>
      <div className="workspace-main">
        {section === 'editor' && <WorkflowEditor project={project} onProjectChange={onProjectChange} />}
        {section === 'users' && <UsersPage projectId={project.id} />}
        {section === 'broadcast' && <BroadcastPage projectId={project.id} />}
      </div>
      {consoleOpen && <ConsolePanel projectId={project.id} logs={logs} onClear={() => setLogs([])} onClose={() => setConsoleOpen(false)} />}
    </div>
    {exportOpen && <ExportDialog project={project} onClose={() => setExportOpen(false)} />}
  </div>
}

function ExportDialog({ project, onClose }: { project: Project; onClose(): void }) {
  const [target, setTarget] = useState<'javascript' | 'python'>('javascript')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError(''); setResult('')
    try {
      const path = await window.flowra.export.bot(project.id, target)
      if (path) setResult(`ZIP сохранён: ${path}`)
      else setBusy(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }
  return <Modal title="Export Bot" onClose={onClose} width={520}>
    <div className="modal-body form-stack">
      <div className="choice-grid">
        <button className={target === 'javascript' ? 'choice-card active' : 'choice-card'} onClick={() => setTarget('javascript')}><strong>JavaScript / Node.js</strong><span>Node 22+, встроенный SQLite</span></button>
        <button className={target === 'python' ? 'choice-card active' : 'choice-card'} onClick={() => setTarget('python')}><strong>Python</strong><span>Python 3.10+, standard library</span></button>
      </div>
      <p className="field-hint">В ZIP попадут workflow, используемые assets, runtime, README и .env.example. Настоящий токен и база пользователей не экспортируются.</p>
      {result && <div className="success-banner">{result}</div>}
      {error && <div className="form-error">{error}</div>}
      <footer className="modal-actions"><button className="secondary-button" onClick={onClose}>Закрыть</button><button className="primary-button" onClick={() => void submit()} disabled={busy}>{busy ? 'Экспортируем…' : 'Сохранить ZIP'}</button></footer>
    </div>
  </Modal>
}
