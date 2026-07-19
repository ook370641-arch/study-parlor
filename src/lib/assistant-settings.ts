import type { AssistantThinkingEffort } from '@shared/index'

export function nextThinkingEffort(effort: AssistantThinkingEffort): AssistantThinkingEffort {
  if (effort === 'off') return 'high'
  if (effort === 'high') return 'max'
  return 'off'
}
