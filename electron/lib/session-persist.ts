import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { UnsavedSession } from '@shared/index'

const SESSIONS_DIR = path.join(os.homedir(), '.studyparlor', 'sessions')

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

function sessionFileName(topic: string): string {
  return `${topic.replace(/[^\w一-龥]/g, '_')}.json`
}

export function getSessionPath(topic: string): string {
  ensureDir()
  return path.join(SESSIONS_DIR, sessionFileName(topic))
}

export function saveSession(session: UnsavedSession): void {
  ensureDir()
  const fp = getSessionPath(session.topic)
  fs.writeFileSync(fp, JSON.stringify(session, null, 2), 'utf8')
}

export function loadSessions(): UnsavedSession[] {
  ensureDir()
  if (!fs.existsSync(SESSIONS_DIR)) return []

  const entries = fs.readdirSync(SESSIONS_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => ({
      name,
      mtime: fs.statSync(path.join(SESSIONS_DIR, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime)

  const sessions: UnsavedSession[] = []
  for (const entry of entries) {
    const fp = path.join(SESSIONS_DIR, entry.name)
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
  if (!fs.existsSync(SESSIONS_DIR)) return
  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue
    const fp = path.join(SESSIONS_DIR, name)
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
