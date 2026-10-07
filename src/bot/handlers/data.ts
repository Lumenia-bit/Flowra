import { resolveValue, variableByName } from '../../shared/variables.js'
import { templateContext } from '../context.js'
import type { NodeHandler } from './types.js'

export const setVariable: NodeHandler = async (node, context) => {
  const key = String(node.data.key ?? '').trim()
  if (!key) throw new Error('Имя переменной не задано')
  const value = resolveValue(node.data.value, templateContext(context))
  context.variables[key] = value
  context.db.setVariable(context.projectId, context.user.id, key, value)
  return {}
}

export const getVariable: NodeHandler = async (node, context) => {
  const key = String(node.data.key ?? '').trim()
  const target = String(node.data.target ?? '').trim()
  if (target) {
    const value = variableByName(key, templateContext(context))
    context.variables[target] = value
    context.db.setVariable(context.projectId, context.user.id, target, value)
  }
  return {}
}
