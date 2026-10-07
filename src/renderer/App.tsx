import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../shared/types'
import { Dashboard } from './components/Dashboard'
import { Workspace } from './components/Workspace'

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [current, setCurrent] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const value = await window.flowra.projects.list()
      setProjects(value)
      setCurrent(previous => previous ? value.find(item => item.id === previous.id) ?? previous : null)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <div className="splash"><div className="brand-mark">F</div><span>Flowra</span></div>

  if (current) {
    return <Workspace project={current} onBack={() => { setCurrent(null); void refresh() }} onProjectChange={project => {
      setCurrent(project)
      setProjects(items => items.map(item => item.id === project.id ? project : item))
    }} />
  }

  return <Dashboard projects={projects} error={error} onOpen={setCurrent} onRefresh={refresh} />
}
