import type { Workflow, WorkflowNode } from './types.js'
import { nodeDefinitionMap } from './nodeRegistry.js'

export function parseWorkflow(value: string | Workflow): Workflow {
  const workflow = typeof value === 'string' ? JSON.parse(value) as Workflow : value
  if (!workflow || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
    throw new Error('Workflow повреждён: ожидаются массивы nodes и edges')
  }
  const ids = new Set<string>()
  for (const node of workflow.nodes) {
    if (!node.id || !node.type || !node.position || typeof node.data !== 'object') {
      throw new Error('Workflow содержит некорректный node')
    }
    if (!(node.type in nodeDefinitionMap)) {
      throw new Error(`Неподдерживаемый node type: ${node.type}`)
    }
    if (ids.has(node.id)) throw new Error(`Повторяющийся node id: ${node.id}`)
    ids.add(node.id)
  }
  for (const edge of workflow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`Edge ${edge.id} ссылается на отсутствующий node`)
    }
  }
  return { version: Number(workflow.version) || 1, nodes: workflow.nodes, edges: workflow.edges }
}

export function nextNode(workflow: Workflow, nodeId: string, handle = 'next'): WorkflowNode | undefined {
  const exact = workflow.edges.find(edge => edge.source === nodeId && edge.sourceHandle === handle)
  const fallback = workflow.edges.find(edge => edge.source === nodeId && (!edge.sourceHandle || edge.sourceHandle === 'next'))
  const edge = exact ?? fallback
  return edge ? workflow.nodes.find(node => node.id === edge.target) : undefined
}

export function referencedAssets(workflow: Workflow): Set<string> {
  const found = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string' && /^assets[/\\]/.test(value)) found.add(value.replaceAll('\\', '/'))
    if (Array.isArray(value)) value.forEach(visit)
    if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  workflow.nodes.forEach(node => visit(node.data))
  return found
}
