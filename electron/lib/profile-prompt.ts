import type { Message, Profile } from '@shared/index'

export function withProfilePrompt(messages: Message[], profile: Profile): Message[] {
  const fields = [
    profile.name.trim() && `姓名:${profile.name.trim()}`,
    profile.profile_text.trim() && `画像:${profile.profile_text.trim()}`,
    profile.preferred_topics.length > 0 && `偏好领域:${profile.preferred_topics.join(' / ')}`,
  ].filter((field): field is string => Boolean(field))
  if (fields.length === 0) return messages
  const block = `# 学习者卷宗\n${fields.join('\n')}`
  const systemIndex = messages.findIndex(message => message.role === 'system')
  if (systemIndex < 0) return [{ role: 'system', content: block }, ...messages]
  return messages.map((message, index) => index === systemIndex
    ? { ...message, content: `${message.content}\n\n---\n\n${block}` }
    : message)
}
