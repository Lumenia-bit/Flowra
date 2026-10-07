import { resolveValue } from '../../shared/variables.js'
import { templateContext } from '../context.js'
import type { NodeHandler } from './types.js'

function resolveObject(value: unknown, context: Parameters<NodeHandler>[1]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(resolveValue(item, templateContext(context))) ]))
}

export const httpRequest: NodeHandler = async (node, context) => {
  const rawUrl = String(resolveValue(node.data.url, templateContext(context)))
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('HTTP Request URL некорректен') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Разрешены только HTTP и HTTPS URL')
  const query = resolveObject(node.data.query, context)
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))
  const method = String(node.data.method ?? 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('HTTP метод не поддерживается')
  const headers = resolveObject(node.data.headers, context)
  const body = ['GET', 'DELETE'].includes(method) ? undefined : String(resolveValue(node.data.body ?? '', templateContext(context)))
  try {
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    let value: unknown = text
    try { value = JSON.parse(text) } catch { value = text }
    const target = String(node.data.responseVariable ?? '').trim()
    if (target) {
      context.variables[target] = value
      context.db.setVariable(context.projectId, context.user.id, target, value)
    }
    return { handle: response.ok ? 'success' : 'error' }
  } catch (error) {
    const target = String(node.data.responseVariable ?? '').trim()
    if (target) {
      const value = { error: error instanceof Error ? error.message : String(error) }
      context.variables[target] = value
      context.db.setVariable(context.projectId, context.user.id, target, value)
    }
    return { handle: 'error' }
  }
}
