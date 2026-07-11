import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { resolveAppPaths } from '../electron/lib/app-paths'

describe('resolveAppPaths', () => {
  it('dev mode uses project-local cache directory under node_modules', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', isPackaged: false })
    expect(paths.configDir).toBe(path.join('/project'))
    expect(paths.userData).toBe(path.join('/project', 'node_modules', '.electron-cache', 'userData'))
    expect(paths.cache).toBe(path.join('/project', 'node_modules', '.electron-cache', 'cache'))
  })

  it('e2e mode uses E2E_CONFIG_DIR', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', e2eConfigDir: '/tmp/e2e', isPackaged: false })
    expect(paths.configDir).toBe(path.join('/tmp/e2e'))
    expect(paths.userData).toBe(path.join('/tmp/e2e', 'userData'))
    expect(paths.cache).toBe(path.join('/tmp/e2e', 'cache'))
  })

  it('packaged mode uses home directory', () => {
    const paths = resolveAppPaths({ cwd: '/project', homeDir: '/home/user', isPackaged: true })
    expect(paths.configDir).toBe(path.join('/home/user', '.studyparlor'))
    expect(paths.userData).toContain('study-parlor')
  })
})
