const { spawn, exec } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

/**
 * 获取当前项目相关的 Node/Electron 进程列表。
 * 只返回满足以下条件的进程：
 * 1. 进程名为 node.exe 或 electron.exe
 * 2. 命令行包含当前项目根目录路径
 * 这样可以避免误杀其他项目的 Electron 实例。
 */
async function listProjectProcesses(projectRoot) {
  if (process.platform !== 'win32') {
    const { stdout } = await execAsync(
      `ps -eo pid,ppid,comm,args | grep -E "(node|electron)" | grep "${escapeShell(projectRoot)}" || true`
    )
    return parseUnixPs(stdout, projectRoot)
  }

  try {
    const { stdout } = await execAsync(
      'wmic process where "name=\'node.exe\' or name=\'electron.exe\'" get ProcessId,ParentProcessId,Name,CommandLine /format:csv'
    )
    return parseWmicCsv(stdout, projectRoot)
  } catch {
    return []
  }
}

function escapeShell(str) {
  return str.replace(/"/g, '\\"')
}

function parseUnixPs(stdout, projectRoot) {
  const result = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 4) continue
    const pid = parseInt(parts[0], 10)
    const ppid = parseInt(parts[1], 10)
    const name = path.basename(parts[2])
    const commandLine = parts.slice(3).join(' ')
    if (!isProjectProcess(commandLine, name, projectRoot)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}

function parseWmicCsv(stdout, projectRoot) {
  const result = []
  const normalizedProjectRoot = projectRoot.toLowerCase()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('Node')) continue
    const parts = trimmed.split(',').map(s => {
      s = s.trim()
      if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).replace(/""/g, '"')
      }
      return s
    })
    if (parts.length < 5) continue
    const commandLine = parts[1]
    const name = parts[2]
    const ppid = parseInt(parts[3], 10)
    const pid = parseInt(parts[4], 10)
    if (!isProjectProcess(commandLine, name, normalizedProjectRoot)) continue
    if (isNaN(pid)) continue
    result.push({ pid, ppid: isNaN(ppid) ? null : ppid, name, commandLine })
  }
  return result
}

function isProjectProcess(commandLine, name, projectRoot) {
  const lowerCmd = commandLine.toLowerCase()
  const lowerRoot = projectRoot.toLowerCase()
  const lowerName = name.toLowerCase()
  if (lowerName !== 'node.exe' && lowerName !== 'electron.exe' && lowerName !== 'node' && lowerName !== 'electron') {
    return false
  }
  return lowerCmd.includes(lowerRoot)
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
    return !(await isProcessRunning(pid))
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
  return !(await isProcessRunning(pid))
}

function runTaskkill(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
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
 */
async function cleanupProjectOrphans(projectRoot, currentPids = []) {
  const pidsToKeep = new Set(currentPids)
  const processes = await listProjectProcesses(projectRoot)
  const killed = []
  for (const proc of processes) {
    if (pidsToKeep.has(proc.pid)) continue
    if (proc.pid === process.pid) continue
    const success = await killProcessTree(proc.pid, 10000)
    if (success) {
      killed.push(proc.pid)
    }
  }
  return killed
}

module.exports = {
  listProjectProcesses,
  findPortListeners,
  killProcessTree,
  isProcessRunning,
  cleanupProjectOrphans,
}
