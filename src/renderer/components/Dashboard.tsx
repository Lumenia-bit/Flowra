import { useMemo, useState } from 'react'
import { Bot, Copy, MoreHorizontal, Plus, Search, Trash2, Users } from 'lucide-react'
import type { Project, ProjectCreateInput } from '../../shared/types'
import { Modal } from './Modal'

interface DashboardProps {
  projects: Project[]
  error: string
  onOpen(project: Project): void
  onRefresh(): Promise<void>
}

export function Dashboard({ projects, error, onOpen, onRefresh }: DashboardProps) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? projects.filter(project => `${project.name} ${project.botUsername ?? ''}`.toLowerCase().includes(query)) : projects
  }, [projects, search])

  const remove = async (project: Project) => {
    setMenu(null)
    if (!window.confirm(`Удалить «${project.name}» и локальные assets? Это действие нельзя отменить.`)) return
    await window.flowra.projects.remove(project.id)
    await onRefresh()
  }

  const duplicate = async (project: Project) => {
    setMenu(null)
    const copy = await window.flowra.projects.duplicate(project.id)
    await onRefresh()
    onOpen(copy)
  }

  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div className="brand"><div className="brand-mark">F</div><span>Flowra</span></div>
      <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Создать бота</button>
    </header>
    <section className="dashboard-content">
      <div className="page-heading">
        <div><h1>Ваши боты</h1><p>Создавайте и запускайте Telegram-ботов визуально.</p></div>
        <label className="search-field"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск проектов" /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {visible.length === 0 ? <div className="empty-state">
        <div className="empty-icon"><Bot size={30} /></div>
        <h2>{projects.length ? 'Ничего не найдено' : 'Создайте первого бота'}</h2>
        <p>{projects.length ? 'Измените поисковый запрос.' : 'Добавьте токен от BotFather и соберите первый workflow.'}</p>
        {!projects.length && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Создать бота</button>}
      </div> : <div className="project-grid">
        {visible.map(project => <article key={project.id} className="project-card" onClick={() => onOpen(project)}>
          <div className="project-card-top">
            <div className="project-avatar"><Bot size={21} /></div>
            <div className="project-menu-wrap">
              <button className="icon-button" onClick={event => { event.stopPropagation(); setMenu(menu === project.id ? null : project.id) }}><MoreHorizontal size={18} /></button>
              {menu === project.id && <div className="context-menu">
                <button onClick={event => { event.stopPropagation(); void duplicate(project) }}><Copy size={15} /> Дублировать</button>
                <button className="danger-item" onClick={event => { event.stopPropagation(); void remove(project) }}><Trash2 size={15} /> Удалить</button>
              </div>}
            </div>
          </div>
          <h2>{project.name}</h2>
          <p className="bot-username">{project.botUsername ? `@${project.botUsername}` : 'Username не получен'}</p>
          <div className="project-meta">
            <span className={`status-dot ${project.status}`} />
            <span>{project.status === 'running' ? 'Запущен' : project.status === 'error' ? 'Ошибка' : 'Остановлен'}</span>
            <span className="meta-divider" />
            <Users size={14} />
            <span>{project.userCount}</span>
          </div>
          <time>Изменён {new Date(project.updatedAt).toLocaleString('ru', { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </article>)}
      </div>}
    </section>
    {creating && <CreateProject onClose={() => setCreating(false)} onCreated={async project => { setCreating(false); await onRefresh(); onOpen(project) }} />}
  </main>
}

function CreateProject({ onClose, onCreated }: { onClose(): void; onCreated(project: Project): void }) {
  const [form, setForm] = useState<ProjectCreateInput>({ name: '', token: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try { onCreated(await window.flowra.projects.create(form)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setSubmitting(false) }
  }

  return <Modal title="Новый Telegram-бот" onClose={onClose}>
    <form className="modal-body form-stack" onSubmit={submit}>
      <label className="field-label">Название бота<input autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, Support Bot" required /></label>
      <label className="field-label">Telegram Bot Token<input type="password" value={form.token} onChange={event => setForm({ ...form, token: event.target.value })} placeholder="123456789:AA…" required autoComplete="off" /></label>
      <p className="field-hint">Flowra проверит токен через getMe. Токен хранится локально и не попадает в workflow или экспорт.</p>
      {error && <div className="form-error">{error}</div>}
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={submitting}>{submitting ? 'Проверяем…' : 'Создать'}</button></footer>
    </form>
  </Modal>
}
