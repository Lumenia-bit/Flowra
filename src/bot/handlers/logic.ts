import { evaluateCondition, resolveValue, variableByName } from '../../shared/variables.js'
import { templateContext } from '../context.js'
import type { NodeHandler } from './types.js'

export const condition: NodeHandler = async (node, context) => {
  const variable = variableByName(String(node.data.variable ?? ''), templateContext(context))
  const value = resolveValue(node.data.value, templateContext(context))
  const result = evaluateCondition(variable, node.data.operator as any, value)
  return { handle: result ? 'true' : 'false' }
}

export const switchHandler: NodeHandler = async (node, context) => {
  const current = variableByName(String(node.data.variable ?? ''), templateContext(context))
  const cases = Array.isArray(node.data.cases) ? node.data.cases as Array<{ value: unknown; handle: string }> : []
  const match = cases.find(item => String(resolveValue(item.value, templateContext(context))) === String(current))
  return { handle: match?.handle ?? 'default' }
}

export const delay: NodeHandler = async (node) => {
  const milliseconds = Math.max(0, Math.min(300_000, Number(node.data.milliseconds) || 0))
  await new Promise(resolve => setTimeout(resolve, milliseconds))
  return {}
}

export const random: NodeHandler = async (node) => {
  const branches = Math.max(1, Math.min(10, Number(node.data.branches) || 2))
  return { handle: `branch_${Math.floor(Math.random() * branches)}` }
}
