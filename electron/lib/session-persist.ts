import fs from 'node:fs'
import path from 'node:path'
import { getStateDir } from '../env'
import type { UnsavedSession } from '@shared/index'

function getSessionsDir(): string {
  return path.join(getStateDir(), 'sessions')
}

function ensureDir(): void {
  const dir = getSessionsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function sessionFileName(session: { topic: string; id: string }): string {
  const sanitized = session.topic.replace(/[^\w一-龥]/g, '_')
  return `${sanitized}_${session.id.slice(0, 8)}.json`
}

export function getSessionPath(session: UnsavedSession): string {
  ensureDir()
  return path.join(getSessionsDir(), sessionFileName(session))
}

export function saveSession(session: UnsavedSession): void {
  ensureDir()
  const fp = getSessionPath(session)
  fs.writeFileSync(fp, JSON.stringify(session, null, 2), 'utf8')
}

export function loadSessions(): UnsavedSession[] {
  ensureDir()
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) return []

  const entries = fs.readdirSync(sessionsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => ({
      name,
      mtime: fs.statSync(path.join(sessionsDir, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime)

  const sessions: UnsavedSession[] = []
  for (const entry of entries) {
    const fp = path.join(sessionsDir, entry.name)
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const session: UnsavedSession = JSON.parse(raw)

      // 保守清理：跳过损坏文件和空 history 的 stub
      if (!session.history || session.history.length === 0) {
        fs.unlinkSync(fp)
        continue
      }

      sessions.push(session)
    } catch (err) {
      console.error('[session-persist] failed to load', entry.name, err)
    }
  }
  return sessions
}

export function deleteSession(id: string): void {
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) return
  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith('.json')) continue
    const fp = path.join(sessionsDir, name)
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const session: UnsavedSession = JSON.parse(raw)
      if (session.id === id) {
        fs.unlinkSync(fp)
        return
      }
    } catch {
      // ignore corrupted file
    }
  }
}
