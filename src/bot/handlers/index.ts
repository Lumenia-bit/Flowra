import type { NodeType } from '../../shared/types.js'
import type { NodeHandler } from './types.js'
import { telegramHandlers } from './telegram.js'
import { inlineButtons, replyKeyboard, urlButton } from './keyboards.js'
import { condition, delay, random, switchHandler } from './logic.js'
import { getVariable, setVariable } from './data.js'
import { textInput } from './input.js'
import { httpRequest } from './network.js'

const passthrough: NodeHandler = async () => ({})

export const handlers: Partial<Record<NodeType, NodeHandler>> = {
  start: passthrough,
  command: passthrough,
  messageTrigger: passthrough,
  callbackTrigger: passthrough,
  ...telegramHandlers,
  inlineButtons,
  replyKeyboard,
  urlButton,
  condition,
  switch: switchHandler,
  delay,
  random,
  variable: setVariable,
  setVariable,
  getVariable,
  textInput,
  httpRequest
}
