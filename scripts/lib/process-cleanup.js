const { spawn, exec } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

/**
 * 获取当前项目相关的 Node/Electron 进程列表。
 * 只返回满足以下条件的进程：
 * 1. 进程名为 node.exe 或 electron.exe
 * 2. 命令行包含当前项目根目录路径
 * 这样可以避免误杀其他项目的 Electron 实例。
 */
async function listProjectProcesses(projectRoot, pattern) {
  if (process.platform !== 'win32') {
    const { stdout } = await execAsync(
      `ps -eo pid,ppid,comm,args | grep -E "(node|electron)" | grep "${escapeShell(projectRoot)}" || true`
    )
    return parseUnixPs(stdout, projectRoot, pattern)
  }

  // Use PowerShell instead of WMIC: WMIC's CSV output does not quote command
  // lines correctly when they themselves contain quotes and commas, so a naive
  // split(',') ends up treating part of the command line as the Name/PID
  // columns.
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -or $_.Name -eq 'electron.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"`,
      { maxBuffer: 5 * 1024 * 1024 }
    )
    return parseWin32Json(stdout, projectRoot, pattern)
  } catch (err) {
    console.warn('[process-cleanup] failed to enumerate processes:', err.message)
    return []
  }
}

function escapeShell(str) {
  return str.replace(/"/g, '\\"')
}

function parseUnixPs(stdout, projectRoot, pattern) {
  const result = []
  const normalizedPattern = pattern ? pattern.toLowerCase() : null
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 4) continue
    const pid = parseInt(parts[0], 10)
    const ppid = parseInt(parts[1], 10)
    const name = path.basename(parts[2])
    const commandLine = parts.slice(3).join(' ')
    if (!isProjectProcess(commandLine, name, projectRoot, normalizedPattern)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}

function parseWin32Json(stdout, projectRoot, pattern) {
  const result = []
  const normalizedProjectRoot = projectRoot.toLowerCase()
  const normalizedPattern = pattern ? pattern.toLowerCase() : null
  let parsed
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    return []
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const commandLine = row.CommandLine || ''
    const name = row.Name || ''
    const ppid = parseInt(row.ParentProcessId, 10)
    const pid = parseInt(row.ProcessId, 10)
    if (!isProjectProcess(commandLine, name, normalizedProjectRoot, normalizedPattern)) continue
    if (isNaN(pid)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}


function isProjectProcess(commandLine, name, projectRoot, pattern) {
  const lowerCmd = commandLine.toLowerCase()
  const lowerRoot = projectRoot.toLowerCase()
  const lowerName = name.toLowerCase()
  if (lowerName !== 'node.exe' && lowerName !== 'electron.exe' && lowerName !== 'node' && lowerName !== 'electron') {
    return false
  }
  if (!lowerCmd.includes(lowerRoot)) return false
  if (pattern && !lowerCmd.includes(pattern)) return false
  return true
}

/**
 * 根据命令行模式查找并终止当前项目相关的进程。
 * 用于清理特定测试实例残留的 Electron renderer 等。
 */
async function killProjectProcessesByPattern(projectRoot, pattern) {
  const processes = await listProjectProcesses(projectRoot, pattern)
  const killed = []
  const failed = []
  for (const proc of processes) {
    if (proc.pid === process.pid) continue
    const success = await killProcessTree(proc.pid, 10000)
    if (success) {
      killed.push(proc.pid)
    } else {
      failed.push(proc)
    }
  }
  return { killed, failed }
}

/**
 * 检查指定端口是否被占用，返回监听该端口的 PID 列表。
 */
async function findPortListeners(port) {
  if (process.platform !== 'win32') {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`)
      return stdout
        .split('\n')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n))
    } catch {
      return []
    }
  }

  try {
    const { stdout } = await execAsync(`netstat -ano | findstr ":${port} "`)
    const pids = new Set()
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) continue
      const local = parts[1]
      const state = parts[3]
      if (!local.endsWith(`:${port}`)) continue
      if (state !== 'LISTENING' && state !== 'ESTABLISHED') continue
      const pid = parseInt(parts[4], 10)
      if (!isNaN(pid)) pids.add(pid)
    }
    return Array.from(pids)
  } catch {
    return []
  }
}

/**
 * 强制终止指定 PID 的进程树（Windows: taskkill /F /T；Unix: SIGKILL 进程组）。
 * 返回是否成功终止。
 */
async function killProcessTree(pid, timeoutMs = 10000) {
  if (!pid || pid <= 0) return true

  if (process.platform === 'win32') {
    await runTaskkill(pid)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await isProcessRunning(pid))) return true
      await sleep(200)
    }
    const stillRunning = await isProcessRunning(pid)
    if (stillRunning) {
      console.warn(`[process-cleanup] failed to kill process tree ${pid} after ${timeoutMs}ms`)
    }
    return !stillRunning
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {}
  const deadline = Date.now() + Math.min(timeoutMs, 5000)
  while (Date.now() < deadline) {
    if (!(await isProcessRunning(pid))) return true
    await sleep(200)
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {}
  await sleep(500)
  const stillRunning = await isProcessRunning(pid)
  if (stillRunning) {
    console.warn(`[process-cleanup] failed to kill process tree ${pid}`)
  }
  return !stillRunning
}

function runTaskkill(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
    killer.on('exit', () => resolve())
    killer.on('error', (err) => {
      console.warn(`[process-cleanup] taskkill ${pid} error:`, err.message)
      resolve()
    })
    setTimeout(() => resolve(), 5000)
  })
}

async function isProcessRunning(pid) {
  if (!pid || pid <= 0) return false
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  return new Promise((resolve) => {
    const checker = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { stdio: 'pipe' })
    let output = ''
    checker.stdout?.on('data', (data) => {
      output += data.toString()
    })
    checker.on('exit', () => {
      resolve(output.includes(String(pid)))
    })
    checker.on('error', () => resolve(false))
    setTimeout(() => resolve(false), 2000)
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 清理当前项目相关的孤儿进程。
 * 会保留 currentPids 中指定的进程（通常是当前 dev.js 自己和它直接启动的子进程）。
 * 返回 { killed: pid[], failed: proc[] }，failed 项包含失败进程的完整信息。
 */
async function cleanupProjectOrphans(projectRoot, currentPids = []) {
  const pidsToKeep = new Set(currentPids)
  const processes = await listProjectProcesses(projectRoot)
  const killed = []
  const failed = []
  for (const proc of processes) {
    if (pidsToKeep.has(proc.pid)) continue
    if (proc.pid === process.pid) continue
    const success = await killProcessTree(proc.pid, 10000)
    if (success) {
      killed.push(proc.pid)
    } else {
      failed.push(proc)
      console.warn(`[process-cleanup] failed to kill orphan ${proc.pid} (${proc.name}): ${proc.commandLine}`)
    }
  }
  return { killed, failed }
}

/**
 * 彻底清理开发环境：杀掉所有项目相关进程、释放指定端口、删除 dev cache。
 * 用于 `npm run dev:clean` 这种手动恢复命令。
 */
async function forceCleanupDevEnvironment(projectRoot, options = {}) {
  const { ports = [], cacheDir = null, currentPids = [] } = options
  console.log('[dev:clean] scanning for project processes...')
  const { killed, failed } = await cleanupProjectOrphans(projectRoot, currentPids)
  if (killed.length > 0) {
    console.log(`[dev:clean] killed ${killed.length} project process(es): ${killed.join(', ')}`)
  }
  if (failed.length > 0) {
    console.warn(`[dev:clean] failed to kill ${failed.length} project process(es):`)
    for (const proc of failed) {
      console.warn(`  - ${proc.pid} ${proc.name}: ${proc.commandLine}`)
    }
  }

  for (const port of ports) {
    const listeners = await findPortListeners(port)
    const external = listeners.filter(pid => !currentPids.includes(pid))
    if (external.length === 0) continue
    console.warn(`[dev:clean] port ${port} still occupied by pids: ${external.join(', ')}`)
    for (const pid of external) {
      const success = await killProcessTree(pid, 10000)
      if (success) {
        console.log(`[dev:clean] freed port ${port} by killing pid ${pid}`)
      } else {
        console.warn(`[dev:clean] could not free port ${port}: pid ${pid} survived`)
      }
    }
  }

  if (cacheDir) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true })
      console.log(`[dev:clean] removed cache dir: ${cacheDir}`)
    } catch (err) {
      console.warn(`[dev:clean] failed to remove cache dir: ${cacheDir}`, err.message)
    }
  }

  return { killed, failed }
}

module.exports = {
  listProjectProcesses,
  findPortListeners,
  killProcessTree,
  isProcessRunning,
  cleanupProjectOrphans,
  killProjectProcessesByPattern,
  forceCleanupDevEnvironment,
}
