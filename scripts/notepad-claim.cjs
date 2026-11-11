const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const stateDir = process.env.E2E_CONFIG_DIR || path.join(os.homedir(), '.studyparlor')
const claimsFile = path.join(stateDir, 'notepad-claims.json')
const [command, id, agent, ...flags] = process.argv.slice(2)
if (!['claim', 'release'].includes(command) || !id || !agent) throw new Error('用法: claim|release <id> <agent> [--force]')

function readClaims() {
  if (!fs.existsSync(claimsFile)) return {}
  try {
    return JSON.parse(fs.readFileSync(claimsFile, 'utf8'))
  } catch {
    const backup = claimsFile + '.bak'
    if (fs.existsSync(backup)) {
      try {
        return JSON.parse(fs.readFileSync(backup, 'utf8'))
      } catch {}
    }
    return {}
  }
}

function writeClaims(claims) {
  fs.mkdirSync(stateDir, { recursive: true })
  if (fs.existsSync(claimsFile)) fs.copyFileSync(claimsFile, claimsFile + '.bak')
  const temporary = claimsFile + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(claims, null, 2), 'utf8')
  fs.renameSync(temporary, claimsFile)
}

if (command === 'claim') {
  const state = JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'))
  if (!state.notepadItems?.some(item => item.id === id)) throw new Error(`待办不存在: ${id}`)

  const claims = readClaims()
  const existing = claims[id]
  if (existing?.claimedBy === agent) {
    console.log(`已认领: ${agent}`)
  } else {
    if (existing && !flags.includes('--force')) throw new Error(`待办已由 ${existing.claimedBy} 认领`)
    claims[id] = { claimedBy: agent, claimedAt: new Date().toISOString() }
    writeClaims(claims)
    console.log(`已认领: ${agent}`)
  }
} else {
  const claims = readClaims()
  const existing = claims[id]
  if (!existing) {
    console.log('无需释放')
  } else {
    if (existing.claimedBy !== agent) throw new Error(`待办由 ${existing.claimedBy} 认领，无法释放`)
    delete claims[id]
    writeClaims(claims)
    console.log(`已释放: ${agent}`)
  }
}
