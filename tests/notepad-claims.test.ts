import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mergeNotepadClaims, pruneNotepadClaims, readNotepadClaims } from '@electron/lib/notepad-claims'
import type { NotepadItem } from '@shared/index'

const dirs: string[] = []
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-claims-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })) })

const item: NotepadItem = { id: 'n4', text: '设置中心', category: 'feature', createdAt: '2026-11-11T00:00:00Z' }
const projectDir = path.resolve(__dirname, '..')
const claimScript = path.join(projectDir, 'scripts', 'notepad-claim.cjs')

function waitForFile(file: string) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 10000
    const poll = () => {
      if (fs.existsSync(file)) return resolve()
      if (Date.now() >= deadline) return reject(new Error(`等待文件超时: ${file}`))
      setTimeout(poll, 10)
    }
    poll()
  })
}

function processExit(child: ReturnType<typeof spawn>) {
  return new Promise<number | null>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
}

async function interleavePruneAndCli(dir: string, args: string[]) {
  const ready = path.join(dir, 'prune-ready')
  const go = path.join(dir, 'prune-go')
  const runner = path.join(dir, 'prune.ts')
  const hook = path.join(dir, 'pause-prune.cjs')
  const modulePath = path.relative(dir, path.join(projectDir, 'electron', 'lib', 'notepad-claims.ts')).replace(/\\/g, '/')
  fs.writeFileSync(runner, `
    import { pruneNotepadClaims } from ${JSON.stringify(modulePath)}
    pruneNotepadClaims(process.env.E2E_CONFIG_DIR!, [{ id: 'n4', text: '设置中心', category: 'feature', createdAt: 'now' }])
  `)
  fs.writeFileSync(hook, `
    const fs = require('node:fs')
    const path = require('node:path')
    const writeFileSync = fs.writeFileSync
    fs.writeFileSync = function (file, data, options) {
      if (path.resolve(file) === path.resolve(process.env.CLAIMS_TMP)) {
        fs.writeFileSync(process.env.PRUNE_READY, '')
        while (!fs.existsSync(process.env.PRUNE_GO)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
      return writeFileSync.call(this, file, data, options)
    }
  `)
  const prune = spawn(process.execPath, [path.join(projectDir, 'node_modules', 'vite-node', 'vite-node.mjs'), '--script', '--config', path.join(projectDir, 'vitest.config.ts'), runner], {
    cwd: projectDir,
    env: {
      ...process.env,
      E2E_CONFIG_DIR: dir,
      CLAIMS_TMP: path.join(dir, 'notepad-claims.json.tmp'),
      PRUNE_READY: ready,
      PRUNE_GO: go,
      NODE_OPTIONS: `--require=${hook}`
    },
    stdio: 'ignore'
  })
  const pruneExit = processExit(prune)
  await waitForFile(ready)

  const lock = path.join(dir, 'notepad-claims.json.lock')
  const pruneOwnsLock = fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(prune.pid)
  const cli = spawn(process.execPath, [claimScript, ...args], {
    env: { ...process.env, E2E_CONFIG_DIR: dir },
    stdio: 'ignore'
  })
  const cliExit = processExit(cli)
  const earlyCliExit = pruneOwnsLock ? null : await cliExit
  fs.writeFileSync(go, '')
  expect(await pruneExit).toBe(0)
  expect(earlyCliExit ?? await cliExit).toBe(0)
}

describe('notepad claims', () => {
  it('只给仍存在的待办叠加认领', () => {
    const result = mergeNotepadClaims([item], { n4: { claimedBy: 'codex/a', claimedAt: '2026-11-11T01:00:00Z' }, stale: { claimedBy: 'codex/b', claimedAt: '2026-11-11T01:00:00Z' } })
    expect(result[0].claim?.claimedBy).toBe('codex/a')
    expect(result[0]).not.toHaveProperty('stale')
    expect(item.claim).toBeUndefined()
  })

  it('损坏主文件时从 bak 恢复', () => {
    const dir = tempDir()
    const file = path.join(dir, 'notepad-claims.json')
    fs.writeFileSync(file, '{bad')
    fs.writeFileSync(file + '.bak', JSON.stringify({ n4: { claimedBy: 'codex/a', claimedAt: 'now' } }))
    expect(readNotepadClaims(dir).n4.claimedBy).toBe('codex/a')
  })

  it.each([null, []])('合法 JSON 根节点为 %s 时按无认领处理', value => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify(value))
    expect(readNotepadClaims(dir)).toEqual({})
    expect(mergeNotepadClaims([item], readNotepadClaims(dir))[0].claim).toBeUndefined()
  })

  it('忽略 claimedBy 或 claimedAt 不是字符串的畸形条目', () => {
    const dir = tempDir()
    const valid = { claimedBy: 'codex/a', claimedAt: 'now' }
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({
      n4: valid,
      null: null,
      array: [],
      missingBy: { claimedAt: 'now' },
      missingAt: { claimedBy: 'codex/b' },
      wrongBy: { claimedBy: 1, claimedAt: 'now' },
      wrongAt: { claimedBy: 'codex/b', claimedAt: null }
    }))
    expect(readNotepadClaims(dir)).toEqual({ n4: valid })
  })

  it('归档后 prune 只删除不存在的待办 id', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({ n4: { claimedBy: 'codex/a', claimedAt: 'now' }, n5: { claimedBy: 'codex/b', claimedAt: 'now' } }))
    pruneNotepadClaims(dir, [item])
    expect(Object.keys(readNotepadClaims(dir))).toEqual(['n4'])
  })

  it('prune 与 CLI claim 交错时不丢失新认领', async () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [item] }))
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({ stale: { claimedBy: 'codex/b', claimedAt: 'now' } }))
    await interleavePruneAndCli(dir, ['claim', 'n4', 'codex/a'])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notepad-claims.json'), 'utf8'))).toEqual({
      n4: { claimedBy: 'codex/a', claimedAt: expect.any(String) }
    })
  }, 15000)

  it('prune 与 CLI release 交错时不复活已释放认领', async () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [item] }))
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({
      n4: { claimedBy: 'codex/a', claimedAt: 'now' },
      stale: { claimedBy: 'codex/b', claimedAt: 'now' }
    }))
    await interleavePruneAndCli(dir, ['release', 'n4', 'codex/a'])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notepad-claims.json'), 'utf8'))).toEqual({})
  }, 15000)
})
