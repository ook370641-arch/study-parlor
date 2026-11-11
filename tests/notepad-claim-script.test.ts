import { describe, expect, it } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
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
function claimConcurrently(dir: string, agent: string, barrier: string) {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [script, 'claim', 'n4', agent], {
      env: { ...process.env, E2E_CONFIG_DIR: dir, NODE_OPTIONS: `--require=${barrier}` },
      stdio: 'ignore'
    })
    child.on('error', reject)
    child.on('close', resolve)
  })
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

  it.each([null, []])('claims 根节点为 %s 时 claim 从空对象开始', value => {
    const dir = fixture()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify(value))
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('已认领')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notepad-claims.json'), 'utf8'))).toEqual({
      n4: { claimedBy: 'codex/a', claimedAt: expect.any(String) }
    })
  })

  it('claim 忽略畸形目标条目并清理其他无效条目', () => {
    const dir = fixture()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({
      n4: { claimedBy: 1, claimedAt: null },
      stale: null
    }))
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('已认领')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notepad-claims.json'), 'utf8'))).toEqual({
      n4: { claimedBy: 'codex/a', claimedAt: expect.any(String) }
    })
  })

  it('release 将畸形目标条目视为未认领', () => {
    const dir = fixture()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({ n4: [] }))
    expect(run(dir, ['release', 'n4', 'codex/a'])).toContain('无需释放')
  })

  it('并发认领只允许一个 Agent 成功', async () => {
    const dir = fixture()
    const claims = Object.fromEntries(Array.from({ length: 20000 }, (_, index) => [`old-${index}`, { claimedBy: 'codex/old', claimedAt: 'now' }]))
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify(claims))
    const barrier = path.join(dir, 'barrier.cjs')
    fs.writeFileSync(barrier, `
      const fs = require('node:fs')
      const path = require('node:path')
      const dir = process.env.E2E_CONFIG_DIR
      fs.writeFileSync(path.join(dir, 'ready-' + process.pid), '')
      while (!fs.existsSync(path.join(dir, 'go'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    `)
    const agents = Array.from({ length: 12 }, (_, index) => `codex/${index}`)
    const pending = agents.map(agent => claimConcurrently(dir, agent, barrier))
    while (fs.readdirSync(dir).filter(file => file.startsWith('ready-')).length < agents.length) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    fs.writeFileSync(path.join(dir, 'go'), '')
    const results = await Promise.all(pending)
    const successful = agents.filter((_, index) => results[index] === 0)
    expect(successful).toHaveLength(1)
  }, 15000)

  it('清理异常进程留下的 stale lock', () => {
    const dir = fixture()
    const lock = path.join(dir, 'notepad-claims.json.lock')
    fs.writeFileSync(lock, 'stale')
    const staleTime = new Date(Date.now() - 60000)
    fs.utimesSync(lock, staleTime, staleTime)
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('codex/a')
    expect(fs.existsSync(lock)).toBe(false)
  })
})
