import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { nodeDefinitionMap } from '../../shared/nodeRegistry'
import type { NodeType, WorkflowNodeData } from '../../shared/types'

export type EditorNode = Node<WorkflowNodeData, NodeType>

export function FlowNode({ type, data, selected }: NodeProps<EditorNode>) {
  const definition = nodeDefinitionMap[type]
  const outputs = type === 'random'
    ? Array.from({ length: Math.max(1, Math.min(10, Number(data.branches) || 2)) }, (_, index) => ({ id: `branch_${index}`, label: String(index + 1) }))
    : type === 'switch' && Array.isArray(data.cases)
      ? [...(data.cases as Array<{ handle?: string; value?: unknown }>).map((item, index) => ({ id: item.handle ?? `case_${index}`, label: String(item.value || index + 1) })), { id: 'default', label: 'DEFAULT' }]
      : definition.outputs
  const summary = nodeSummary(type, data)
  return <div className={`flow-node ${selected ? 'selected' : ''}`}>
    {definition.inputs > 0 && <Handle type="target" position={Position.Left} className="node-handle input" />}
    <div className="node-accent" style={{ background: definition.color }} />
    <div className="node-content"><strong>{definition.label}</strong>{summary && <span>{summary}</span>}</div>
    <div className="output-handles">
      {outputs.map((output, index) => <div className="output-row" key={output.id} style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}>
        {output.label && <span>{output.label}</span>}
        <Handle id={output.id} type="source" position={Position.Right} className="node-handle output" />
      </div>)}
    </div>
  </div>
}

function nodeSummary(type: NodeType, data: WorkflowNodeData): string {
  if (type === 'command') return String(data.command ?? '')
  if (type === 'sendMessage') return String(data.text ?? '').slice(0, 42)
  if (type.startsWith('send') && data.asset) return String(data.asset).split('/').pop() ?? ''
  if (type === 'condition') return `${data.variable ?? ''} ${data.operator ?? ''} ${data.value ?? ''}`.slice(0, 46)
  if (type === 'setVariable' || type === 'variable') return String(data.key ?? '')
  if (type === 'textInput') return `${data.inputType ?? 'text'} → ${data.variable ?? ''}`
  if (type === 'httpRequest') return `${data.method ?? 'GET'} ${data.url ?? ''}`.slice(0, 46)
  return ''
}
