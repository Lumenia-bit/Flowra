export interface VariableContext {
  user: Record<string, unknown>
  chat: Record<string, unknown>
  message: Record<string, unknown>
  variables: Record<string, unknown>
  [key: string]: unknown
}

function pathValue(context: VariableContext, path: string): unknown {
  const normalized = path.startsWith('variable.') ? path.slice(9) : path
  if (!normalized.includes('.') && normalized in context.variables) return context.variables[normalized]
  const parts = normalized.split('.')
  let current: unknown = context
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function resolveValue(value: unknown, context: VariableContext): unknown {
  if (typeof value !== 'string') return value
  const exact = value.match(/^{{\s*([^{}]+?)\s*}}$/)
  if (exact) return pathValue(context, exact[1])
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, (_, path: string) => {
    const resolved = pathValue(context, path)
    if (resolved === undefined || resolved === null) return ''
    return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved)
  })
}

export type ConditionOperator = 'equals' | 'notEquals' | 'contains' | 'greater' | 'less' | 'greaterOrEqual' | 'lessOrEqual' | 'exists'

export function evaluateCondition(left: unknown, operator: ConditionOperator, right: unknown): boolean {
  if (operator === 'exists') return left !== undefined && left !== null && left !== ''
  if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''))
  if (operator === 'equals') return String(left ?? '') === String(right ?? '')
  if (operator === 'notEquals') return String(left ?? '') !== String(right ?? '')
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false
  if (operator === 'greater') return leftNumber > rightNumber
  if (operator === 'less') return leftNumber < rightNumber
  if (operator === 'greaterOrEqual') return leftNumber >= rightNumber
  return leftNumber <= rightNumber
}

export function variableByName(name: string, context: VariableContext): unknown {
  return resolveValue(`{{${name.replace(/^{{|}}$/g, '')}}}`, context)
}
