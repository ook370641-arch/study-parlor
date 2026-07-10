import * as path from 'node:path'
import * as os from 'node:os'

export interface AppPathConfig {
  configDir: string
  stateDir: string
  userData: string
  cache: string
}

export function resolveAppPaths(options: {
  cwd: string
  homeDir: string
  e2eConfigDir?: string
  isPackaged: boolean
}): AppPathConfig {
  const { cwd, homeDir, e2eConfigDir, isPackaged } = options

  if (e2eConfigDir) {
    return {
      configDir: path.normalize(e2eConfigDir),
      stateDir: path.normalize(e2eConfigDir),
      userData: path.join(e2eConfigDir, 'userData'),
      cache: path.join(e2eConfigDir, 'cache'),
    }
  }

  if (isPackaged) {
    return {
      configDir: path.join(homeDir, '.studyparlor'),
      stateDir: path.join(homeDir, '.studyparlor'),
      userData: path.join(homeDir, 'AppData', 'Roaming', 'study-parlor'),
      cache: path.join(homeDir, 'AppData', 'Local', 'study-parlor'),
    }
  }

  // Dev mode
  const devCacheDir = path.join(cwd, '.electron-cache')
  return {
    configDir: path.normalize(cwd),
    stateDir: path.join(homeDir, '.studyparlor'),
    userData: path.join(devCacheDir, 'userData'),
    cache: path.join(devCacheDir, 'cache'),
  }
}
