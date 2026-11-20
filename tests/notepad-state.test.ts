import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { setConfigDir, setStateDir } from '../electron/env'
import type { AppConfig } from '../electron/env'
import { registerStateIpc, getCurrentState, patchState } from '../electron/ipc/state'

const item = { id: 'n1', text: '独立记事板', category: 'improvement' as const, createdAt: '2026-11-19T00:00:00Z' }
const logEntry = { ...item, id: 'n0', resolvedAt: '2026-11-18T00:00:00Z', source: 'agent' as const }

let configDir: string
let stateDir: string
let lib: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-config-'))
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-state-'))
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-lib-'))
  setConfigDir(configDir)
  setStateDir(stateDir)
  registerStateIpc({ libraryPath: lib } as AppConfig)
})

afterEach(() => {
  setConfigDir(null)
  setStateDir(null)
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.rmSync(stateDir, { recursive: true, force: true })
  fs.rmSync(lib, { recursive: true, force: true })
})

function readJson(dir: string, name: string): Record<string, any> {
  const file = path.join(dir, name)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

describe('记事板独立存储', () => {
  it('首次读取迁移待办和档案，并从 state.json 剥离', () => {
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      writingFontSize: 'lg', notepadItems: [item], notepadLog: [logEntry],
    }))

    expect(getCurrentState().notepadItems).toEqual([item])
    expect(getCurrentState().notepadLog).toEqual([logEntry])
    expect(readJson(configDir, 'notepad.json')).toEqual({ notepadItems: [item], notepadLog: [logEntry] })
    expect(readJson(stateDir, 'state.json')).toEqual({ writingFontSize: 'lg' })
  })

  it('记事板更新只写 notepad.json，其他设置仍写 state.json', () => {
    patchState({ notepadItems: [item], notepadLog: [logEntry], writingFontSize: 'lg' })

    expect(readJson(configDir, 'notepad.json')).toEqual({ notepadItems: [item], notepadLog: [logEntry] })
    expect(readJson(stateDir, 'state.json').writingFontSize).toBe('lg')
    expect(readJson(stateDir, 'state.json').notepadItems).toBeUndefined()
    expect(readJson(stateDir, 'state.json').notepadLog).toBeUndefined()
  })

  it('已有独立文件时以其为准，并清理 state.json 的旧残留', () => {
    fs.writeFileSync(path.join(configDir, 'notepad.json'), JSON.stringify({ notepadItems: [item], notepadLog: [] }))
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      notepadItems: [{ ...item, id: 'stale' }], notepadLog: [logEntry],
    }))

    expect(getCurrentState().notepadItems).toEqual([item])
    expect(getCurrentState().notepadLog).toEqual([])
    patchState({ writingFontSize: 'lg' })
    expect(readJson(stateDir, 'state.json').notepadItems).toBeUndefined()
    expect(readJson(stateDir, 'state.json').notepadLog).toBeUndefined()
    expect(readJson(configDir, 'notepad.json').notepadItems).toEqual([item])
  })

  it('迁移失败时保留 state.json 原值，不用空默认值覆盖', () => {
    fs.mkdirSync(path.join(configDir, 'notepad.json.tmp'))
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ notepadItems: [item], notepadLog: [logEntry] }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getCurrentState().notepadItems).toEqual([item])
    expect(getCurrentState().notepadLog).toEqual([logEntry])

    errSpy.mockRestore()
    expect(readJson(stateDir, 'state.json').notepadItems).toEqual([item])
    expect(readJson(stateDir, 'state.json').notepadLog).toEqual([logEntry])
  })
})
