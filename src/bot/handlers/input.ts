import type { NodeHandler } from './types.js'

export const textInput: NodeHandler = async (node, context) => {
  const variable = String(node.data.variable ?? '').trim()
  const inputType = String(node.data.inputType ?? 'text')
  if (!variable) throw new Error('Переменная Input не задана')
  context.db.setSession(context.user.id, node.id, inputType)
  context.db.setCurrentNode(context.user.id, node.id)
  return { stop: true }
}
