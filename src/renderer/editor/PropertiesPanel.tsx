import { useEffect, useState } from 'react'
import { FileImage, Plus, Trash2, Upload, X } from 'lucide-react'
import { nodeDefinitionMap, type NodeField } from '../../shared/nodeRegistry'
import type { AssetInfo, WorkflowNodeData } from '../../shared/types'
import type { EditorNode } from './FlowNode'

interface PropertiesPanelProps {
  projectId: string
  node: EditorNode | null
  onChange(id: string, data: WorkflowNodeData): void
  onDelete(id: string): void
}

export function PropertiesPanel({ projectId, node, onChange, onDelete }: PropertiesPanelProps) {
  if (!node) return <aside className="properties-panel empty-properties"><div><span className="properties-empty-icon">⌁</span><h3>Выберите блок</h3><p>Параметры выбранного блока появятся здесь.</p></div></aside>
  const definition = nodeDefinitionMap[node.type]
  const update = (key: string, value: unknown) => onChange(node.id, { ...node.data, [key]: value })
  return <aside className="properties-panel">
    <header className="properties-header"><div><span className="eyebrow">PROPERTIES</span><h2>{definition.label}</h2></div><button className="icon-button danger" title="Удалить блок" onClick={() => onDelete(node.id)}><Trash2 size={16} /></button></header>
    <div className="properties-body">
      <label className="property-field"><span>Название блока</span><input value={String(node.data.label ?? '')} placeholder={definition.label} onChange={event => update('label', event.target.value)} /></label>
      {node.type === 'sendMediaGroup' ? <MediaGroupEditor projectId={projectId} value={Array.isArray(node.data.items) ? node.data.items as any[] : []} onChange={value => update('items', value)} /> : definition.fields.map(field => {
        if (field.key === 'asset' && node.data.source !== 'asset') return null
        if (field.key === 'url' && node.data.source !== 'url') return null
        if (field.key === 'fileId' && node.data.source !== 'fileId') return null
        return <PropertyField key={field.key} projectId={projectId} field={field} value={node.data[field.key]} onChange={value => update(field.key, value)} />
      })}
    </div>
    <footer className="properties-footer"><code>{node.id}</code></footer>
  </aside>
}

function PropertyField({ projectId, field, value, onChange }: { projectId: string; field: NodeField; value: unknown; onChange(value: unknown): void }) {
  if (field.type === 'boolean') return <label className="toggle-field"><span>{field.label}</span><button className={value ? 'toggle active' : 'toggle'} onClick={() => onChange(!value)}><span /></button></label>
  if (field.type === 'select') return <label className="property-field"><span>{field.label}</span><select value={String(value ?? '')} onChange={event => onChange(event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  if (field.type === 'textarea') return <label className="property-field"><span>{field.label}</span><textarea value={String(value ?? '')} placeholder={field.placeholder} rows={5} onChange={event => onChange(event.target.value)} /></label>
  if (field.type === 'number') return <label className="property-field"><span>{field.label}</span><input type="number" value={Number(value ?? 0)} onChange={event => onChange(Number(event.target.value))} /></label>
  if (field.type === 'json') return <JsonField field={field} value={value} onChange={onChange} />
  if (field.type === 'stringList') return <StringList label={field.label} value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />
  if (field.type === 'asset') return <AssetField projectId={projectId} kind={field.assetKind ?? 'document'} value={String(value ?? '')} onChange={onChange} />
  return <label className="property-field"><span>{field.label}</span><input value={String(value ?? '')} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} /></label>
}

function JsonField({ field, value, onChange }: { field: NodeField; value: unknown; onChange(value: unknown): void }) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2))
  const [error, setError] = useState(false)
  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value])
  const commit = () => {
    try { onChange(JSON.parse(text)); setError(false) } catch { setError(true) }
  }
  return <label className={`property-field ${error ? 'invalid' : ''}`}><span>{field.label}</span><textarea className="code-input" value={text} placeholder={field.placeholder} rows={8} onChange={event => setText(event.target.value)} onBlur={commit} /><small>{error ? 'Некорректный JSON' : 'JSON применяется после выхода из поля'}</small></label>
}

function StringList({ label, value, onChange }: { label: string; value: string[]; onChange(value: string[]): void }) {
  return <div className="property-field"><span>{label}</span><div className="string-list">
    {value.map((item, index) => <div key={index}><input value={item} onChange={event => onChange(value.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /><button className="icon-button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}
    <button className="inline-add" onClick={() => onChange([...value, ''])}><Plus size={14} /> Добавить вариант</button>
  </div></div>
}

function AssetField({ projectId, kind, value, onChange }: { projectId: string; kind: string; value: string; onChange(value: string): void }) {
  const [info, setInfo] = useState<AssetInfo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!value) { setInfo(null); return }
    window.flowra.assets.inspect(projectId, value).then(result => { if (active) setInfo(result) }).catch(() => { if (active) setInfo(null) })
    return () => { active = false }
  }, [projectId, value])
  const choose = async () => {
    setError('')
    try { const asset = await window.flowra.assets.choose(projectId, kind); if (asset) { setInfo(asset); onChange(asset.path) } }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  if (!value) return <div className="property-field"><span>Файл</span><button className="asset-picker" onClick={() => void choose()}><Upload size={17} /><span>Выбрать файл</span><small>Файл будет скопирован в assets проекта</small></button>{error && <small className="field-error">{error}</small>}</div>
  return <div className="property-field"><span>Файл</span><div className="asset-card">
    {info?.previewUrl ? <img src={info.previewUrl} alt="Preview" /> : <div className="asset-file-icon"><FileImage size={22} /></div>}
    <div className="asset-details"><strong>{info?.filename ?? value.split('/').pop()}</strong><small>{info ? `${info.mimeType} · ${formatBytes(info.size)}` : value}</small></div>
    <button className="icon-button" title="Убрать из node" onClick={() => onChange('')}><X size={15} /></button>
  </div><button className="text-button" onClick={() => void choose()}>Заменить</button>{error && <small className="field-error">{error}</small>}</div>
}

function MediaGroupEditor({ projectId, value, onChange }: { projectId: string; value: any[]; onChange(value: any[]): void }) {
  const add = async (type: 'photo' | 'video') => {
    const asset = await window.flowra.assets.choose(projectId, type)
    if (asset) onChange([...value, { type, source: 'asset', asset: asset.path, caption: '', parseMode: 'none' }])
  }
  return <div className="property-field"><span>Элементы альбома ({value.length}/10)</span><div className="media-items">
    {value.map((item, index) => <div className="media-item" key={`${item.asset}-${index}`}><div><strong>{item.type === 'video' ? 'Видео' : 'Фото'}</strong><small>{String(item.asset ?? item.url ?? item.fileId ?? '')}</small></div><input placeholder="Подпись" value={item.caption ?? ''} onChange={event => onChange(value.map((entry, itemIndex) => itemIndex === index ? { ...entry, caption: event.target.value } : entry))} /><button className="icon-button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}
  </div><div className="split-buttons"><button className="secondary-button" disabled={value.length >= 10} onClick={() => void add('photo')}>+ Фото</button><button className="secondary-button" disabled={value.length >= 10} onClick={() => void add('video')}>+ Видео</button></div>{value.length > 0 && value.length < 2 && <small className="field-error">Для album нужно минимум 2 элемента</small>}</div>
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`
  return `${(value / 1024 / 1024).toFixed(1)} МБ`
}
