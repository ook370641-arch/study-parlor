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

export function saveSession(session: UnsavedSession): void {
  ensureDir()
  const fp = path.join(SESSIONS_DIR, `${session.id}.json`)
  fs.writeFileSync(fp, JSON.stringify(session, null, 2), 'utf8')
}

export function loadSessions(): UnsavedSession[] {
  ensureDir()
  if (!fs.existsSync(SESSIONS_DIR)) return []

  const sessions: UnsavedSession[] = []
  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, name), 'utf8')
      sessions.push(JSON.parse(raw))
    } catch (err) {
      console.error('[session-persist] failed to load', name, err)
    }
  }
  return sessions.sort((a, b) => b.id.localeCompare(a.id))
}

export function deleteSession(id: string): void {
  const fp = path.join(SESSIONS_DIR, `${id}.json`)
  if (fs.existsSync(fp)) fs.unlinkSync(fp)
}
