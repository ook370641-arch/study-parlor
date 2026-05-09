import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DIR = path.join(os.homedir(), '.studyparlor', 'recovery')

export function dumpRecovery(filename: string, content: string) {
  fs.mkdirSync(DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(DIR, `${ts}-${filename}`), content, 'utf8')
}
