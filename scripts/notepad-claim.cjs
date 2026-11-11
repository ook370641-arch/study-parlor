const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readClaimsFile, writeClaimsFile, withClaimsLock } = require('../electron/lib/notepad-claims-shared.cjs')

const stateDir = process.env.E2E_CONFIG_DIR || path.join(os.homedir(), '.studyparlor')
const claimsFile = path.join(stateDir, 'notepad-claims.json')
const [command, id, agent, ...flags] = process.argv.slice(2)
if (!['claim', 'release'].includes(command) || !id || !agent) throw new Error('用法: claim|release <id> <agent> [--force]')

withClaimsLock(claimsFile, () => {
  if (command === 'claim') {
    const state = JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'))
    if (!state.notepadItems?.some(item => item.id === id)) throw new Error(`待办不存在: ${id}`)

    const claims = readClaimsFile(claimsFile)
    const existing = claims[id]
    if (existing?.claimedBy === agent) {
      console.log(`已认领: ${agent}`)
    } else {
      if (existing && !flags.includes('--force')) throw new Error(`待办已由 ${existing.claimedBy} 认领`)
      claims[id] = { claimedBy: agent, claimedAt: new Date().toISOString() }
      writeClaimsFile(claimsFile, claims)
      console.log(`已认领: ${agent}`)
    }
  } else {
    const claims = readClaimsFile(claimsFile)
    const existing = claims[id]
    if (!existing) {
      console.log('无需释放')
    } else {
      if (existing.claimedBy !== agent) throw new Error(`待办由 ${existing.claimedBy} 认领，无法释放`)
      delete claims[id]
      writeClaimsFile(claimsFile, claims)
      console.log(`已释放: ${agent}`)
    }
  }
})
