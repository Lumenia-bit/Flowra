import { useCallback, useEffect, useState } from 'react'
import { FileUp, Image, Plus, Radio, Send, Square, Trash2, Video } from 'lucide-react'
import type { AssetInfo, Broadcast, BroadcastContent, BroadcastType, SegmentFilter, SegmentOperator } from '../../shared/types'

const operators: Array<{ value: SegmentOperator; label: string; field?: boolean; valueField?: boolean }> = [
  { value: 'all', label: 'Все пользователи' },
  { value: 'username_exists', label: 'Username есть' },
  { value: 'username_missing', label: 'Username отсутствует' },
  { value: 'language_code', label: 'Язык равен', valueField: true },
  { value: 'first_started_after', label: 'Первый запуск после', valueField: true },
  { value: 'first_started_before', label: 'Первый запуск до', valueField: true },
  { value: 'last_activity_after', label: 'Активность после', valueField: true },
  { value: 'last_activity_before', label: 'Активность до', valueField: true },
  { value: 'variable_exists', label: 'Переменная существует', field: true },
  { value: 'variable_equals', label: 'Переменная равна', field: true, valueField: true },
  { value: 'variable_contains', label: 'Переменная содержит', field: true, valueField: true }
]

const typeOptions: Array<{ type: BroadcastType; label: string; icon: typeof Send }> = [
  { type: 'text', label: 'Текст', icon: Send }, { type: 'photo', label: 'Фото', icon: Image },
  { type: 'video', label: 'Видео', icon: Video }, { type: 'document', label: 'Документ', icon: FileUp },
  { type: 'audio', label: 'Аудио', icon: Radio }, { type: 'voice', label: 'Voice', icon: Radio }
]

export function BroadcastPage({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<Broadcast[]>([])
  const [type, setType] = useState<BroadcastType>('text')
  const [content, setContent] = useState<BroadcastContent>({ text: '', caption: '', parseMode: 'none' })
  const [filters, setFilters] = useState<SegmentFilter[]>([{ operator: 'all' }])
  const [recipients, setRecipients] = useState(0)
  const [asset, setAsset] = useState<AssetInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => window.flowra.broadcasts.list(projectId).then(setHistory).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))), [projectId])
  useEffect(() => { void load(); return window.flowra.broadcasts.onProgress(value => { if (value.projectId === projectId) setHistory(items => [value, ...items.filter(item => item.id !== value.id)]) }) }, [projectId, load])
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => window.flowra.users.count(projectId, filters).then(value => { if (active) setRecipients(value) }).catch(() => { if (active) setRecipients(0) }), 220)
    return () => { active = false; clearTimeout(timer) }
  }, [projectId, filters])

  const chooseAsset = async () => {
    const selected = await window.flowra.assets.choose(projectId, type)
    if (selected) { setAsset(selected); setContent(value => ({ ...value, asset: selected.path })) }
  }
  const send = async () => {
    if (type === 'text' && !content.text?.trim()) { setError('Введите текст сообщения'); return }
    if (type !== 'text' && !content.asset) { setError('Выберите медиафайл'); return }
    if (recipients === 0) { setError('В выбранном сегменте нет получателей'); return }
    if (!window.confirm(`Отправить рассылку ${recipients} получателям?`)) return
    setBusy(true); setError('')
    try {
      const broadcast = await window.flowra.broadcasts.create({ projectId, type, content, filters })
      setHistory(items => [broadcast, ...items])
      await window.flowra.broadcasts.start(broadcast.id)
      setContent({ text: '', caption: '', parseMode: 'none' }); setAsset(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return <div className="data-page broadcast-page">
    <header className="data-page-header"><div><h1>Broadcast</h1><p>Рассылка по пользователям текущего проекта</p></div></header>
    <div className="broadcast-grid">
      <section className="composer-card">
        <header><h2>Новое сообщение</h2><span className="recipient-badge">Recipients: {recipients.toLocaleString('ru')}</span></header>
        <div className="composer-section"><span className="section-label">Тип сообщения</span><div className="type-picker">{typeOptions.map(option => <button key={option.type} className={type === option.type ? 'active' : ''} onClick={() => { setType(option.type); setContent(value => ({ ...value, asset: undefined })); setAsset(null) }}><option.icon size={15} />{option.label}</button>)}</div></div>
        <div className="composer-section"><span className="section-label">Аудитория</span><div className="filters-list">{filters.map((filter, index) => <FilterRow key={index} filter={filter} onChange={value => setFilters(items => items.map((item, itemIndex) => itemIndex === index ? value : item))} onRemove={() => setFilters(items => items.filter((_, itemIndex) => itemIndex !== index))} removable={filters.length > 1} />)}</div><button className="inline-add" onClick={() => setFilters(items => [...items.filter(item => item.operator !== 'all'), { operator: 'language_code', value: '' }])}><Plus size={14} /> Добавить фильтр</button></div>
        <div className="composer-section"><span className="section-label">Сообщение</span>
          {type !== 'text' && <button className="broadcast-asset" onClick={() => void chooseAsset()}>{asset ? <><strong>{asset.filename}</strong><small>{asset.mimeType} · {(asset.size / 1024 / 1024).toFixed(1)} МБ</small></> : <><FileUp size={20} /><strong>Выбрать файл</strong><small>Он будет скопирован в assets проекта</small></>}</button>}
          <textarea rows={5} value={type === 'text' ? content.text ?? '' : content.caption ?? ''} onChange={event => setContent(value => type === 'text' ? { ...value, text: event.target.value } : { ...value, caption: event.target.value })} placeholder={type === 'text' ? 'Текст рассылки' : 'Подпись к медиа (необязательно)'} />
          <select value={content.parseMode ?? 'none'} onChange={event => setContent(value => ({ ...value, parseMode: event.target.value as BroadcastContent['parseMode'] }))}><option value="none">Без форматирования</option><option value="Markdown">Markdown</option><option value="HTML">HTML</option></select>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button broadcast-send" onClick={() => void send()} disabled={busy}><Send size={16} /> {busy ? 'Запускаем…' : 'Send Broadcast'}</button>
      </section>
      <section className="preview-card"><header><h2>Preview</h2></header><div className="phone-preview"><div className="telegram-preview">
        {asset?.previewUrl && <img src={asset.previewUrl} alt="Broadcast" />}
        {type !== 'text' && !asset?.previewUrl && asset && <div className="file-preview"><FileUp size={24} /><span>{asset.filename}</span></div>}
        <p>{type === 'text' ? content.text || 'Текст сообщения…' : content.caption || 'Подпись…'}</p><time>12:34 ✓</time>
      </div></div></section>
    </div>
    <section className="history-section"><header><div><h2>История</h2><p>Все рассылки проекта</p></div></header><div className="table-card"><table><thead><tr><th>Message</th><th>Created</th><th>Recipients</th><th>Sent</th><th>Failed</th><th>Progress</th><th>Status</th><th /></tr></thead><tbody>{history.map(item => {
      const complete = item.sent + item.failed
      const percent = item.total ? Math.round(complete / item.total * 100) : item.status === 'completed' ? 100 : 0
      return <tr key={item.id}><td><strong>{item.type}</strong><span className="message-excerpt">{item.content.text ?? item.content.caption ?? item.content.asset ?? ''}</span></td><td>{new Date(item.createdAt).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{item.total}</td><td>{item.sent}</td><td>{item.failed}</td><td><div className="progress-cell"><div><span style={{ width: `${percent}%` }} /></div><small>{percent}%</small></div></td><td><span className={`broadcast-status ${item.status}`}>{item.status}</span></td><td>{item.status === 'running' && <button className="icon-button" title="Остановить" onClick={() => void window.flowra.broadcasts.stop(item.id)}><Square size={14} fill="currentColor" /></button>}</td></tr>
    })}</tbody></table>{!history.length && <div className="table-empty"><Radio size={27} /><strong>Рассылок пока нет</strong></div>}</div></section>
  </div>
}

function FilterRow({ filter, onChange, onRemove, removable }: { filter: SegmentFilter; onChange(value: SegmentFilter): void; onRemove(): void; removable: boolean }) {
  const definition = operators.find(item => item.value === filter.operator) ?? operators[0]
  return <div className="filter-row"><select value={filter.operator} onChange={event => onChange({ operator: event.target.value as SegmentOperator })}>{operators.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{definition.field && <input placeholder="Имя переменной" value={filter.field ?? ''} onChange={event => onChange({ ...filter, field: event.target.value })} />}{definition.valueField && <input type={filter.operator.includes('_at_') || filter.operator.includes('started_') || filter.operator.includes('activity_') ? 'date' : 'text'} placeholder="Значение" value={filter.value ?? ''} onChange={event => onChange({ ...filter, value: event.target.value })} />}{removable && <button className="icon-button" onClick={onRemove}><Trash2 size={14} /></button>}</div>
}
