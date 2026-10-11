// electron/lib/fitness-store.ts —— fitness.json 的 fs 包装；逻辑全在 src/lib/fitness.ts
import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import { normalizeFitnessData, DEFAULT_FITNESS_DATA } from '../../src/lib/fitness'
import type { FitnessData } from '@shared/index'

export function fitnessFile(dir: string): string {
  return path.join(dir, 'fitness.json')
}

export function loadFitness(dir: string): FitnessData {
  const file = fitnessFile(dir)
  if (!fs.existsSync(file)) {
    const data = structuredClone(DEFAULT_FITNESS_DATA)
    safeWriteJson(file, data)
    return data
  }
  // safeReadJson 内部已处理损坏 → .bak → fallback；normalize 兜底形状
  return normalizeFitnessData(safeReadJson<unknown>(file, { fallback: null }))
}

export function writeFitness(dir: string, data: FitnessData): void {
  safeWriteJson(fitnessFile(dir), data)
}
