import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, Controls, MiniMap, ReactFlow,
  ReactFlowProvider, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange, type OnSelectionChangeParams
} from '@xyflow/react'
import { Check, Copy, HardDrive, Redo2, Search, Trash2, Undo2 } from 'lucide-react'
import { nodeDefinitions, nodeDefinitionMap, type NodeCategory } from '../../shared/nodeRegistry'
import type { Project, WorkflowEdge } from '../../shared/types'
import { FlowNode, type EditorNode } from './FlowNode'
import { PropertiesPanel } from './PropertiesPanel'

const nodeTypes = Object.fromEntries(nodeDefinitions.map(item => [item.type, FlowNode]))
const categories: NodeCategory[] = ['Triggers', 'Telegram', 'Keyboards', 'Logic', 'Data', 'Input', 'Network']

interface Snapshot { nodes: EditorNode[]; edges: Edge[] }

export function WorkflowEditor(props: { project: Project; onProjectChange(project: Project): void }) {
  return <ReactFlowProvider><EditorInner {...props} /></ReactFlowProvider>
}

function EditorInner({ project, onProjectChange }: { project: Project; onProjectChange(project: Project): void }) {
  const [nodes, setNodes] = useState<EditorNode[]>(() => project.workflow.nodes.map(node => ({ ...node, data: { ...node.data } })) as EditorNode[])
  const [edges, setEdges] = useState<Edge[]>(() => project.workflow.edges.map(edge => ({ ...edge })) as Edge[])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [assetNotice, setAssetNotice] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const clipboard = useRef<EditorNode[]>([])
  const lastSaved = useRef(JSON.stringify(project.workflow))
  const { screenToFlowPosition } = useReactFlow()

  const snapshot = useCallback((): Snapshot => ({ nodes: structuredClone(nodes), edges: structuredClone(edges) }), [nodes, edges])
  const checkpoint = useCallback(() => { undoStack.current.push(snapshot()); undoStack.current = undoStack.current.slice(-50); redoStack.current = [] }, [snapshot])

  useEffect(() => {
    const workflow = {
      version: 1,
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })) as WorkflowEdge[]
    }
    const serialized = JSON.stringify(workflow)
    if (serialized === lastSaved.current) return
    setSaveState('saving')
    const timer = setTimeout(async () => {
      try {
        const updated = await window.flowra.projects.update({ id: project.id, workflow })
        lastSaved.current = serialized
        setSaveState('saved')
        onProjectChange(updated)
      } catch { setSaveState('error') }
    }, 650)
    return () => clearTimeout(timer)
  }, [nodes, edges, project.id, onProjectChange])

  const onNodesChange = useCallback((changes: NodeChange<EditorNode>[]) => {
    if (changes.some(change => change.type === 'remove')) checkpoint()
    setNodes(items => applyNodeChanges(changes, items))
  }, [checkpoint])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (changes.some(change => change.type === 'remove')) checkpoint()
    setEdges(items => applyEdgeChanges(changes, items))
  }, [checkpoint])
  const onConnect = useCallback((connection: Connection) => { checkpoint(); setEdges(items => addEdge({ ...connection, id: crypto.randomUUID() }, items)) }, [checkpoint])

  const addNode = useCallback((type: EditorNode['type'], position: { x: number; y: number }) => {
    checkpoint()
    const definition = nodeDefinitionMap[type]
    const id = `${type}_${crypto.randomUUID().slice(0, 8)}`
    const node: EditorNode = { id, type, position, data: structuredClone(definition.defaults) }
    setNodes(items => [...items, node])
    setSelectedId(id)
  }, [checkpoint])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(snapshot())
    setNodes(previous.nodes); setEdges(previous.edges); setSelectedId(null)
  }, [snapshot])
  const redo = useCallback(() => {
    const following = redoStack.current.pop()
    if (!following) return
    undoStack.current.push(snapshot())
    setNodes(following.nodes); setEdges(following.edges); setSelectedId(null)
  }, [snapshot])

  const copySelected = useCallback(() => {
    clipboard.current = structuredClone(nodes.filter(node => node.selected || node.id === selectedId))
  }, [nodes, selectedId])
  const paste = useCallback(() => {
    if (!clipboard.current.length) return
    checkpoint()
    const mapping = new Map<string, string>()
    const copies = clipboard.current.map(node => {
      const id = `${node.type}_${crypto.randomUUID().slice(0, 8)}`
      mapping.set(node.id, id)
      return { ...structuredClone(node), id, selected: true, position: { x: node.position.x + 36, y: node.position.y + 36 } }
    })
    setNodes(items => [...items.map(item => ({ ...item, selected: false })), ...copies])
    setSelectedId(copies[0].id)
  }, [checkpoint])
  const removeSelected = useCallback(() => {
    const ids = new Set(nodes.filter(node => node.selected || node.id === selectedId).map(node => node.id))
    if (!ids.size) return
    checkpoint()
    setNodes(items => items.filter(node => !ids.has(node.id)))
    setEdges(items => items.filter(edge => !ids.has(edge.source) && !ids.has(edge.target)))
    setSelectedId(null)
  }, [nodes, selectedId, checkpoint])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelected() }
      if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); paste() }
      if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); copySelected(); setTimeout(paste) }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [undo, redo, copySelected, paste, removeSelected])

  const selection = useCallback((value: OnSelectionChangeParams<EditorNode, Edge>) => setSelectedId(value.nodes[0]?.id ?? null), [])
  const selected = nodes.find(node => node.id === selectedId) ?? null
  const matchingDefinitions = nodeDefinitions.filter(item => item.label.toLowerCase().includes(paletteSearch.toLowerCase()))

  return <div className="editor-layout">
    <aside className="node-palette">
      <div className="palette-header"><span className="eyebrow">BLOCKS</span><label><Search size={14} /><input placeholder="Найти блок" value={paletteSearch} onChange={event => setPaletteSearch(event.target.value)} /></label></div>
      <div className="palette-list">{categories.map(category => {
        const items = matchingDefinitions.filter(item => item.category === category)
        if (!items.length) return null
        return <section key={category}><h3>{category}</h3>{items.map(item => <button key={item.type} draggable onDragStart={event => { event.dataTransfer.setData('application/flowra-node', item.type); event.dataTransfer.effectAllowed = 'move' }} onDoubleClick={() => addNode(item.type, { x: 320, y: 180 })}><span style={{ background: item.color }} />{item.label}</button>)}</section>
      })}</div>
      <div className="palette-footer"><button onClick={async () => {
        const unused = await window.flowra.assets.unused(project.id)
        if (!unused.length) { setAssetNotice('Неиспользуемых файлов нет'); return }
        if (window.confirm(`Удалить ${unused.length} неиспользуемых файлов из assets?`)) {
          const count = await window.flowra.assets.cleanup(project.id)
          setAssetNotice(`Удалено файлов: ${count}`)
        }
      }}><HardDrive size={14} /> Очистить assets</button>{assetNotice && <span>{assetNotice}</span>}</div>
    </aside>
    <div className="canvas-wrap" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={event => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/flowra-node') as EditorNode['type']
      if (type && nodeDefinitionMap[type]) addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    }}>
      <div className="canvas-toolbar">
        <button className="icon-button" onClick={undo} disabled={!undoStack.current.length} title="Undo"><Undo2 size={16} /></button>
        <button className="icon-button" onClick={redo} disabled={!redoStack.current.length} title="Redo"><Redo2 size={16} /></button>
        <span className="toolbar-separator" />
        <button className="icon-button" onClick={copySelected} title="Copy"><Copy size={15} /></button>
        <button className="icon-button" onClick={removeSelected} title="Delete"><Trash2 size={15} /></button>
        <span className={`save-state ${saveState}`}><Check size={13} /> {saveState === 'saved' ? 'Сохранено' : saveState === 'saving' ? 'Сохраняем…' : 'Ошибка сохранения'}</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={selection}
        onNodeDragStart={checkpoint}
        fitView
        minZoom={0.2}
        maxZoom={2}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        selectionOnDrag
        panOnDrag={[1, 2]}
        defaultEdgeOptions={{ animated: false, style: { stroke: '#64748b', strokeWidth: 1.6 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#303540" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={node => nodeDefinitionMap[node.type as EditorNode['type']]?.color ?? '#64748b'} />
      </ReactFlow>
    </div>
    <PropertiesPanel projectId={project.id} node={selected} onChange={(id, data) => { checkpoint(); setNodes(items => items.map(node => node.id === id ? { ...node, data } : node)) }} onDelete={id => {
      checkpoint(); setNodes(items => items.filter(node => node.id !== id)); setEdges(items => items.filter(edge => edge.source !== id && edge.target !== id)); setSelectedId(null)
    }} />
  </div>
}
