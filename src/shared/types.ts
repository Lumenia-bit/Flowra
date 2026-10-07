export type NodeType =
  | 'start'
  | 'command'
  | 'messageTrigger'
  | 'callbackTrigger'
  | 'sendMessage'
  | 'sendPhoto'
  | 'sendVideo'
  | 'sendAudio'
  | 'sendVoice'
  | 'sendDocument'
  | 'sendLocation'
  | 'sendContact'
  | 'sendPoll'
  | 'sendQuiz'
  | 'sendMediaGroup'
  | 'editMessage'
  | 'deleteMessage'
  | 'inlineButtons'
  | 'replyKeyboard'
  | 'urlButton'
  | 'condition'
  | 'switch'
  | 'delay'
  | 'random'
  | 'variable'
  | 'setVariable'
  | 'getVariable'
  | 'textInput'
  | 'httpRequest'

export interface Position {
  x: number
  y: number
}

export interface WorkflowNodeData {
  label?: string
  [key: string]: unknown
}

export interface WorkflowNode {
  id: string
  type: NodeType
  position: Position
  data: WorkflowNodeData
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface Workflow {
  version: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface Project {
  id: string
  name: string
  botUsername: string | null
  workflow: Workflow
  status: 'stopped' | 'running' | 'error'
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectCreateInput {
  name: string
  token: string
}

export interface ProjectUpdateInput {
  id: string
  name?: string
  token?: string
  workflow?: Workflow
}

export interface TelegramUser {
  id: number
  projectId: string
  telegramUserId: string
  chatId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  languageCode: string | null
  firstStartedAt: string
  lastActivityAt: string
  messageCount: number
  currentNode: string | null
  blocked: boolean
  variables: Record<string, unknown>
}

export type SegmentOperator =
  | 'all'
  | 'username_exists'
  | 'username_missing'
  | 'language_code'
  | 'first_started_after'
  | 'first_started_before'
  | 'last_activity_after'
  | 'last_activity_before'
  | 'variable_exists'
  | 'variable_equals'
  | 'variable_contains'

export interface SegmentFilter {
  operator: SegmentOperator
  field?: string
  value?: string
}

export type BroadcastType = 'text' | 'photo' | 'video' | 'document' | 'audio' | 'voice'
export type BroadcastStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface BroadcastContent {
  text?: string
  caption?: string
  asset?: string
  parseMode?: 'none' | 'Markdown' | 'HTML'
}

export interface Broadcast {
  id: string
  projectId: string
  type: BroadcastType
  content: BroadcastContent
  filters: SegmentFilter[]
  status: BroadcastStatus
  total: number
  sent: number
  failed: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface AssetInfo {
  path: string
  filename: string
  mimeType: string
  size: number
  previewUrl?: string
}

export interface RuntimeLog {
  projectId: string
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

export interface PaginatedUsers {
  items: TelegramUser[]
  total: number
  page: number
  pageSize: number
}

export interface UserQuery {
  projectId: string
  search?: string
  sortBy?: 'telegramUserId' | 'username' | 'firstName' | 'lastName' | 'firstStartedAt' | 'lastActivityAt' | 'messageCount'
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface BotApi {
  projects: {
    list(): Promise<Project[]>
    create(input: ProjectCreateInput): Promise<Project>
    update(input: ProjectUpdateInput): Promise<Project>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<Project>
  }
  assets: {
    choose(projectId: string, kind: string): Promise<AssetInfo | null>
    inspect(projectId: string, path: string): Promise<AssetInfo>
    unused(projectId: string): Promise<AssetInfo[]>
    cleanup(projectId: string): Promise<number>
  }
  runtime: {
    start(projectId: string): Promise<void>
    stop(projectId: string): Promise<void>
    status(projectId: string): Promise<string>
    onLog(callback: (log: RuntimeLog) => void): () => void
    onStatus(callback: (event: { projectId: string; status: string }) => void): () => void
  }
  users: {
    list(query: UserQuery): Promise<PaginatedUsers>
    get(projectId: string, userId: number): Promise<TelegramUser>
    count(projectId: string, filters: SegmentFilter[]): Promise<number>
  }
  broadcasts: {
    list(projectId: string): Promise<Broadcast[]>
    create(input: Omit<Broadcast, 'id' | 'status' | 'total' | 'sent' | 'failed' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<Broadcast>
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    onProgress(callback: (broadcast: Broadcast) => void): () => void
  }
  export: {
    bot(projectId: string, target: 'javascript' | 'python'): Promise<string | null>
  }
  system: {
    appVersion(): Promise<string>
  }
}

declare global {
  interface Window {
    flowra: BotApi
  }
}
