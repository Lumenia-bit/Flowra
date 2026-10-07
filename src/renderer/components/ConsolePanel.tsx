import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Eraser, X } from 'lucide-react'
import type { RuntimeLog } from '../../shared/types'

interface ConsolePanelProps {
  projectId: string
  logs: RuntimeLog[]
  onClear(): void
  onClose(): void
}

export function ConsolePanel({ projectId, logs, onClear, onClose }: ConsolePanelProps) {
  const [autoscroll, setAutoscroll] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const current = logs.filter(log => log.projectId === projectId)
  useEffect(() => { if (autoscroll) end.current?.scrollIntoView({ behavior: 'smooth' }) }, [current.length, autoscroll])
  return <section className="console-panel">
    <header className="console-header">
      <div><span className="console-title">Console</span><span className="console-count">{current.length}</span></div>
      <div className="console-actions">
        <button className={autoscroll ? 'active' : ''} onClick={() => setAutoscroll(value => !value)}><ChevronDown size={14} /> Autoscroll</button>
        <button onClick={onClear}><Eraser size={14} /> Очистить</button>
        <button className="icon-button" onClick={onClose}><X size={15} /></button>
      </div>
    </header>
    <div className="console-output">
      {!current.length && <div className="console-empty">Логи появятся после запуска бота.</div>}
      {current.map((log, index) => <div key={`${log.timestamp}-${index}`} className={`console-line ${log.level.toLowerCase()}`}>
        <time>{new Date(log.timestamp).toLocaleTimeString('ru')}</time><span className="log-level">{log.level}</span><span>{log.message}</span>
      </div>)}
      <div ref={end} />
    </div>
  </section>
}
