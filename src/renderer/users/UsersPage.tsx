import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, UserRound, X } from 'lucide-react'
import type { PaginatedUsers, TelegramUser, UserQuery } from '../../shared/types'

const empty: PaginatedUsers = { items: [], total: 0, page: 1, pageSize: 20 }

export function UsersPage({ projectId }: { projectId: string }) {
  const [data, setData] = useState(empty)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<UserQuery['sortBy']>('lastActivityAt')
  const [direction, setDirection] = useState<UserQuery['sortDirection']>('desc')
  const [selected, setSelected] = useState<TelegramUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = setTimeout(() => {
      window.flowra.users.list({ projectId, search, page, pageSize: 20, sortBy: sort, sortDirection: direction })
        .then(value => { if (active) { setData(value); setError('') } })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
        .finally(() => { if (active) setLoading(false) })
    }, 220)
    return () => { active = false; clearTimeout(timer) }
  }, [projectId, search, page, sort, direction])

  const changeSort = (value: UserQuery['sortBy']) => {
    if (sort === value) setDirection(current => current === 'asc' ? 'desc' : 'asc')
    else { setSort(value); setDirection('asc') }
    setPage(1)
  }
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return <div className="data-page">
    <header className="data-page-header"><div><h1>Users</h1><p>{data.total} пользователей взаимодействовали с ботом</p></div><label className="search-field"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="ID, username или имя" /></label></header>
    {error && <div className="error-banner">{error}</div>}
    <div className="table-card">
      <table><thead><tr>
        <Sortable label="Telegram ID" name="telegramUserId" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="Username" name="username" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="First Name" name="firstName" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="Last Name" name="lastName" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="First Start" name="firstStartedAt" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="Last Activity" name="lastActivityAt" current={sort} direction={direction} onClick={changeSort} />
        <Sortable label="Messages" name="messageCount" current={sort} direction={direction} onClick={changeSort} />
        <th>Variables</th>
      </tr></thead><tbody>
        {data.items.map(user => <tr key={user.id} onClick={() => setSelected(user)}>
          <td className="mono-cell">{user.telegramUserId}</td><td>{user.username ? `@${user.username}` : <span className="muted">—</span>}</td><td>{user.firstName || '—'}</td><td>{user.lastName || '—'}</td>
          <td>{formatDate(user.firstStartedAt)}</td><td>{formatDate(user.lastActivityAt)}</td><td>{user.messageCount}</td><td><span className="count-pill">{Object.keys(user.variables).length}</span></td>
        </tr>)}
      </tbody></table>
      {!loading && !data.items.length && <div className="table-empty"><UserRound size={27} /><strong>Пользователей пока нет</strong><span>Они появятся после первого сообщения боту.</span></div>}
      {loading && <div className="table-empty"><span>Загружаем…</span></div>}
      <footer className="table-footer"><span>{data.total ? `${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} из ${data.total}` : '0 пользователей'}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button><span>{page} / {pages}</span><button className="icon-button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button></div></footer>
    </div>
    {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} />}
  </div>
}

function Sortable({ label, name, current, direction, onClick }: { label: string; name: UserQuery['sortBy']; current: UserQuery['sortBy']; direction: UserQuery['sortDirection']; onClick(value: UserQuery['sortBy']): void }) {
  return <th><button onClick={() => onClick(name)}>{label}{current === name && <span>{direction === 'asc' ? ' ↑' : ' ↓'}</span>}</button></th>
}

function UserDrawer({ user, onClose }: { user: TelegramUser; onClose(): void }) {
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><aside className="user-drawer">
    <header><div className="user-avatar">{(user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()}</div><div><h2>{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Telegram user'}</h2><p>{user.username ? `@${user.username}` : user.telegramUserId}</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header>
    <div className="drawer-body"><section><h3>Профиль</h3><dl>
      <div><dt>Telegram ID</dt><dd>{user.telegramUserId}</dd></div><div><dt>Chat ID</dt><dd>{user.chatId}</dd></div><div><dt>Username</dt><dd>{user.username ? `@${user.username}` : '—'}</dd></div><div><dt>Язык</dt><dd>{user.languageCode ?? '—'}</dd></div><div><dt>Первый запуск</dt><dd>{formatFull(user.firstStartedAt)}</dd></div><div><dt>Активность</dt><dd>{formatFull(user.lastActivityAt)}</dd></div><div><dt>Сообщений</dt><dd>{user.messageCount}</dd></div><div><dt>Текущий node</dt><dd>{user.currentNode ?? '—'}</dd></div>
    </dl></section><section><h3>Variables</h3>{Object.keys(user.variables).length ? <div className="variables-table">{Object.entries(user.variables).map(([key, value]) => <div key={key}><code>{key}</code><span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span></div>)}</div> : <p className="muted">Сохранённых переменных нет.</p>}</section></div>
  </aside></div>
}

function formatDate(value: string): string { return new Date(value).toLocaleDateString('ru', { day: '2-digit', month: 'short', year: '2-digit' }) }
function formatFull(value: string): string { return new Date(value).toLocaleString('ru', { dateStyle: 'medium', timeStyle: 'short' }) }
