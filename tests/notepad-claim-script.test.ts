import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const script = path.resolve(__dirname, '..', 'scripts', 'notepad-claim.cjs')
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-cli-'))
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [{ id: 'n4', text: '设置中心', category: 'feature', createdAt: 'now' }] }))
  return dir
}
function run(dir: string, args: string[]) {
  return execFileSync(process.execPath, [script, ...args], { env: { ...process.env, E2E_CONFIG_DIR: dir }, encoding: 'utf8' })
}

describe('notepad-claim CLI', () => {
  it('同 Agent 幂等，异 Agent 冲突，force 才接管', () => {
    const dir = fixture()
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('codex/a')
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('codex/a')
    expect(() => run(dir, ['claim', 'n4', 'codex/b'])).toThrow()
    expect(run(dir, ['claim', 'n4', 'codex/b', '--force'])).toContain('codex/b')
  })

  it('release 只能释放自己的认领，也允许待办已归档', () => {
    const dir = fixture()
    run(dir, ['claim', 'n4', 'codex/a'])
    expect(() => run(dir, ['release', 'n4', 'codex/b'])).toThrow()
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [] }))
    expect(run(dir, ['release', 'n4', 'codex/a'])).toContain('已释放')
  })

  it('claim 不存在的待办会失败', () => {
    const dir = fixture()
    expect(() => run(dir, ['claim', 'missing', 'codex/a'])).toThrow()
  })
})
