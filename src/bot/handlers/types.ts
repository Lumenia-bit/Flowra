import type { WorkflowNode } from '../../shared/types.js'
import type { EngineContext } from '../context.js'

export interface HandlerResult {
  handle?: string
  stop?: boolean
}

export type NodeHandler = (node: WorkflowNode, context: EngineContext) => Promise<HandlerResult>
