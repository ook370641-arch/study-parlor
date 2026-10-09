// electron/ipc/fitness.ts
import { ipcMain } from 'electron'
import { getStateDir } from '../env'
import { loadFitness, writeFitness } from '../lib/fitness-store'
import { upsertRecord, removeRecord, upsertBodyMetric, removeBodyMetric, replacePlan } from '../../src/lib/fitness'
import type { FitnessData, FitnessRecord, BodyMetric, FitnessRoutine, FitnessScheduleEntry } from '@shared/index'

export function registerFitnessIpc() {
  ipcMain.handle('fitness:load', async (): Promise<FitnessData> => loadFitness(getStateDir()))

  ipcMain.handle('fitness:saveRecord', async (_, rec: FitnessRecord): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = upsertRecord(loadFitness(dir), rec)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:deleteRecord', async (_, id: string): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = removeRecord(loadFitness(dir), id)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:saveBodyMetric', async (_, m: BodyMetric): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = upsertBodyMetric(loadFitness(dir), m)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:deleteBodyMetric', async (_, date: string): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = removeBodyMetric(loadFitness(dir), date)
    writeFitness(dir, data)
    return data
  })

  ipcMain.handle('fitness:savePlan', async (_, p: { routines: FitnessRoutine[]; schedule: FitnessScheduleEntry[] }): Promise<FitnessData> => {
    const dir = getStateDir()
    const data = replacePlan(loadFitness(dir), p.routines, p.schedule)
    writeFitness(dir, data)
    return data
  })
}
