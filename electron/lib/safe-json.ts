import fs from 'node:fs'
import path from 'node:path'

export function safeReadJson<T>(filePath: string, opts: { fallback: T }): T {
  if (!fs.existsSync(filePath)) return opts.fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    const bak = filePath + '.bak'
    if (fs.existsSync(bak)) {
      try { return JSON.parse(fs.readFileSync(bak, 'utf8')) } catch { /* fallthrough */ }
    }
    return opts.fallback
  }
}

export function safeWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + '.bak')
  }

  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}
