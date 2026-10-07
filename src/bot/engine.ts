import { nextNode } from '../shared/workflow.js'
import type { WorkflowNode } from '../shared/types.js'
import type { EngineContext } from './context.js'
import { handlers } from './handlers/index.js'

export class WorkflowEngine {
  async execute(startNode: WorkflowNode, context: EngineContext): Promise<void> {
    let current: WorkflowNode | undefined = startNode
    let steps = 0
    while (current && !context.stop) {
      if (++steps > 100) throw new Error('Workflow остановлен: превышено 100 шагов за одно событие')
      const handler = handlers[current.type]
      if (!handler) throw new Error(`Handler для ${current.type} не найден`)
      context.db.setCurrentNode(context.user.id, current.id)
      context.db.addInteraction(context.projectId, context.user.id, 'out', current.type, current.id, {})
      log('INFO', `${current.id} (${current.type})`)
      const result = await handler(current, context)
      if (result.stop) break
      current = nextNode(context.workflow, current.id, result.handle ?? 'next')
    }
    if (!context.stop && !current) context.db.setCurrentNode(context.user.id, null)
  }
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  process.stdout.write(`${JSON.stringify({ level, message, timestamp: new Date().toISOString() })}\n`)
}
