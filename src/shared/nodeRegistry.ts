import type { NodeType, Workflow, WorkflowNodeData } from './types.js'

export type NodeCategory = 'Triggers' | 'Telegram' | 'Keyboards' | 'Logic' | 'Data' | 'Input' | 'Network'
export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'asset' | 'json' | 'stringList'

export interface NodeField {
  key: string
  label: string
  type: FieldType
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  assetKind?: string
}

export interface NodeDefinition {
  type: NodeType
  label: string
  category: NodeCategory
  color: string
  inputs: number
  outputs: Array<{ id: string; label?: string }>
  defaults: WorkflowNodeData
  fields: NodeField[]
}

const parseModes = [
  { value: 'none', label: 'Без форматирования' },
  { value: 'Markdown', label: 'Markdown' },
  { value: 'HTML', label: 'HTML' }
]

const mediaSource = [
  { value: 'asset', label: 'Локальный файл' },
  { value: 'url', label: 'URL' },
  { value: 'fileId', label: 'Telegram file_id' }
]

const trigger = (type: NodeType, label: string, defaults: WorkflowNodeData = {}, fields: NodeField[] = []): NodeDefinition => ({
  type,
  label,
  category: 'Triggers',
  color: '#a78bfa',
  inputs: 0,
  outputs: [{ id: 'next' }],
  defaults,
  fields
})

const telegram = (type: NodeType, label: string, defaults: WorkflowNodeData, fields: NodeField[], outputs = [{ id: 'next' }]): NodeDefinition => ({
  type,
  label,
  category: 'Telegram',
  color: '#38bdf8',
  inputs: 1,
  outputs,
  defaults,
  fields
})

const media = (type: NodeType, label: string, kind: string): NodeDefinition => telegram(
  type,
  label,
  { source: 'asset', asset: '', url: '', fileId: '', caption: '', parseMode: 'none' },
  [
    { key: 'source', label: 'Источник', type: 'select', options: mediaSource },
    { key: 'asset', label: 'Файл', type: 'asset', assetKind: kind },
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://…' },
    { key: 'fileId', label: 'Telegram file_id', type: 'text' },
    { key: 'caption', label: 'Подпись', type: 'textarea' },
    { key: 'parseMode', label: 'Формат', type: 'select', options: parseModes }
  ]
)

export const nodeDefinitions: NodeDefinition[] = [
  trigger('start', 'Start'),
  trigger('command', 'Command', { command: '/help' }, [{ key: 'command', label: 'Команда', type: 'text', placeholder: '/help' }]),
  trigger('messageTrigger', 'Message', { contains: '' }, [{ key: 'contains', label: 'Содержит текст', type: 'text' }]),
  trigger('callbackTrigger', 'Callback', { callbackData: '' }, [{ key: 'callbackData', label: 'Callback data', type: 'text' }]),
  telegram('sendMessage', 'Send Message', { text: 'Новое сообщение', parseMode: 'none' }, [
    { key: 'text', label: 'Текст', type: 'textarea' },
    { key: 'parseMode', label: 'Формат', type: 'select', options: parseModes }
  ]),
  media('sendPhoto', 'Send Photo', 'photo'),
  media('sendVideo', 'Send Video', 'video'),
  media('sendAudio', 'Send Audio', 'audio'),
  media('sendVoice', 'Send Voice', 'voice'),
  media('sendDocument', 'Send Document', 'document'),
  telegram('sendLocation', 'Send Location', { latitude: '', longitude: '' }, [
    { key: 'latitude', label: 'Latitude', type: 'text', placeholder: '{{location.latitude}}' },
    { key: 'longitude', label: 'Longitude', type: 'text', placeholder: '{{location.longitude}}' }
  ]),
  telegram('sendContact', 'Send Contact', { phoneNumber: '', firstName: '', lastName: '' }, [
    { key: 'phoneNumber', label: 'Телефон', type: 'text' },
    { key: 'firstName', label: 'Имя', type: 'text' },
    { key: 'lastName', label: 'Фамилия', type: 'text' }
  ]),
  telegram('sendPoll', 'Send Poll', { question: '', answers: ['Вариант 1', 'Вариант 2'], anonymous: true, multipleAnswers: false }, [
    { key: 'question', label: 'Вопрос', type: 'textarea' },
    { key: 'answers', label: 'Ответы', type: 'stringList' },
    { key: 'anonymous', label: 'Анонимный', type: 'boolean' },
    { key: 'multipleAnswers', label: 'Несколько ответов', type: 'boolean' }
  ]),
  telegram('sendQuiz', 'Send Quiz', { question: '', answers: ['Вариант 1', 'Вариант 2'], correctAnswer: 0, explanation: '', anonymous: true }, [
    { key: 'question', label: 'Вопрос', type: 'textarea' },
    { key: 'answers', label: 'Ответы', type: 'stringList' },
    { key: 'correctAnswer', label: 'Номер верного ответа (с 1)', type: 'number' },
    { key: 'explanation', label: 'Пояснение', type: 'textarea' },
    { key: 'anonymous', label: 'Анонимный', type: 'boolean' }
  ]),
  telegram('sendMediaGroup', 'Send Media Group', { items: [] }, [{ key: 'items', label: 'Элементы альбома', type: 'json', placeholder: '[{"type":"photo","source":"asset","asset":"assets/photo.jpg","caption":""}]' }]),
  telegram('editMessage', 'Edit Message', { messageId: '{{message.id}}', text: '' }, [
    { key: 'messageId', label: 'Message ID', type: 'text' },
    { key: 'text', label: 'Новый текст', type: 'textarea' }
  ]),
  telegram('deleteMessage', 'Delete Message', { messageId: '{{message.id}}' }, [{ key: 'messageId', label: 'Message ID', type: 'text' }]),
  {
    type: 'inlineButtons', label: 'Inline Buttons', category: 'Keyboards', color: '#2dd4bf', inputs: 1, outputs: [{ id: 'next' }],
    defaults: { rows: [[{ text: 'Кнопка', action: 'callback', value: 'button_1' }]] },
    fields: [{ key: 'rows', label: 'Строки кнопок', type: 'json', placeholder: '[[{"text":"Кнопка","action":"callback","value":"button_1"}]]' }]
  },
  {
    type: 'replyKeyboard', label: 'Reply Keyboard', category: 'Keyboards', color: '#2dd4bf', inputs: 1, outputs: [{ id: 'next' }],
    defaults: { rows: [[{ text: 'Кнопка', action: 'text' }]], resize: true, oneTime: false },
    fields: [
      { key: 'rows', label: 'Строки кнопок', type: 'json', placeholder: '[[{"text":"Телефон","action":"contact"}]]' },
      { key: 'resize', label: 'Компактная', type: 'boolean' },
      { key: 'oneTime', label: 'Одноразовая', type: 'boolean' }
    ]
  },
  {
    type: 'urlButton', label: 'URL Button', category: 'Keyboards', color: '#2dd4bf', inputs: 1, outputs: [{ id: 'next' }],
    defaults: { text: 'Открыть', url: 'https://example.com' },
    fields: [{ key: 'text', label: 'Текст', type: 'text' }, { key: 'url', label: 'URL', type: 'text' }]
  },
  {
    type: 'condition', label: 'Condition', category: 'Logic', color: '#f59e0b', inputs: 1, outputs: [{ id: 'true', label: 'TRUE' }, { id: 'false', label: 'FALSE' }],
    defaults: { variable: '', operator: 'equals', value: '' },
    fields: [
      { key: 'variable', label: 'Переменная', type: 'text' },
      { key: 'operator', label: 'Оператор', type: 'select', options: [
        { value: 'equals', label: 'Равно' }, { value: 'notEquals', label: 'Не равно' }, { value: 'contains', label: 'Содержит' },
        { value: 'greater', label: 'Больше' }, { value: 'less', label: 'Меньше' }, { value: 'greaterOrEqual', label: 'Больше или равно' },
        { value: 'lessOrEqual', label: 'Меньше или равно' }, { value: 'exists', label: 'Существует' }
      ] },
      { key: 'value', label: 'Значение', type: 'text' }
    ]
  },
  {
    type: 'switch', label: 'Switch', category: 'Logic', color: '#f59e0b', inputs: 1, outputs: [{ id: 'case_0', label: 'CASE 1' }, { id: 'default', label: 'DEFAULT' }],
    defaults: { variable: '', cases: [{ value: '', handle: 'case_0' }] },
    fields: [{ key: 'variable', label: 'Переменная', type: 'text' }, { key: 'cases', label: 'Варианты', type: 'json' }]
  },
  {
    type: 'delay', label: 'Delay', category: 'Logic', color: '#f59e0b', inputs: 1, outputs: [{ id: 'next' }],
    defaults: { milliseconds: 1000 }, fields: [{ key: 'milliseconds', label: 'Миллисекунды', type: 'number' }]
  },
  {
    type: 'random', label: 'Random', category: 'Logic', color: '#f59e0b', inputs: 1, outputs: [{ id: 'branch_0', label: '1' }, { id: 'branch_1', label: '2' }],
    defaults: { branches: 2 }, fields: [{ key: 'branches', label: 'Количество веток', type: 'number' }]
  },
  {
    type: 'variable', label: 'Variable', category: 'Data', color: '#fb7185', inputs: 1, outputs: [{ id: 'next' }], defaults: { key: '', value: '' },
    fields: [{ key: 'key', label: 'Имя', type: 'text' }, { key: 'value', label: 'Значение', type: 'text' }]
  },
  {
    type: 'setVariable', label: 'Set Variable', category: 'Data', color: '#fb7185', inputs: 1, outputs: [{ id: 'next' }], defaults: { key: '', value: '' },
    fields: [{ key: 'key', label: 'Имя', type: 'text' }, { key: 'value', label: 'Значение', type: 'text' }]
  },
  {
    type: 'getVariable', label: 'Get Variable', category: 'Data', color: '#fb7185', inputs: 1, outputs: [{ id: 'next' }], defaults: { key: '', target: '' },
    fields: [{ key: 'key', label: 'Имя', type: 'text' }, { key: 'target', label: 'Сохранить как', type: 'text' }]
  },
  {
    type: 'textInput', label: 'Input', category: 'Input', color: '#34d399', inputs: 1, outputs: [{ id: 'next' }], defaults: { variable: 'answer', inputType: 'text' },
    fields: [
      { key: 'variable', label: 'Переменная', type: 'text' },
      { key: 'inputType', label: 'Тип', type: 'select', options: [
        { value: 'text', label: 'Текст' }, { value: 'number', label: 'Число' }, { value: 'contact', label: 'Контакт' }, { value: 'location', label: 'Геолокация' }
      ] }
    ]
  },
  {
    type: 'httpRequest', label: 'HTTP Request', category: 'Network', color: '#818cf8', inputs: 1, outputs: [{ id: 'success', label: 'SUCCESS' }, { id: 'error', label: 'ERROR' }],
    defaults: { method: 'GET', url: '', headers: {}, query: {}, body: '', responseVariable: 'response' },
    fields: [
      { key: 'method', label: 'Метод', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(value => ({ value, label: value })) },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'headers', label: 'Headers', type: 'json' },
      { key: 'query', label: 'Query params', type: 'json' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'responseVariable', label: 'Response variable', type: 'text' }
    ]
  }
]

export const nodeDefinitionMap = Object.fromEntries(nodeDefinitions.map(item => [item.type, item])) as Record<NodeType, NodeDefinition>

export function createInitialWorkflow(): Workflow {
  return {
    version: 1,
    nodes: [
      { id: 'start_1', type: 'start', position: { x: 180, y: 180 }, data: {} },
      { id: 'sendMessage_1', type: 'sendMessage', position: { x: 480, y: 180 }, data: { text: 'Привет, {{user.first_name}}!', parseMode: 'none' } }
    ],
    edges: [{ id: 'start_1-sendMessage_1', source: 'start_1', target: 'sendMessage_1', sourceHandle: 'next' }]
  }
}
