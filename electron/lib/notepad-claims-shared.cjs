const fs = require('node:fs')
const path = require('node:path')

const lockSleep = new Int32Array(new SharedArrayBuffer(4))

function normalizeClaims(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const claims = {}
  for (const [id, claim] of Object.entries(value)) {
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) continue
    if (typeof claim.claimedBy !== 'string' || typeof claim.claimedAt !== 'string') continue
    claims[id] = { claimedBy: claim.claimedBy, claimedAt: claim.claimedAt }
  }
  return claims
}

function readClaimsFile(claimsFile) {
  if (!fs.existsSync(claimsFile)) return {}
  try {
    return normalizeClaims(JSON.parse(fs.readFileSync(claimsFile, 'utf8')))
  } catch {
    const backup = claimsFile + '.bak'
    if (fs.existsSync(backup)) {
      try {
        return normalizeClaims(JSON.parse(fs.readFileSync(backup, 'utf8')))
      } catch {}
    }
    return {}
  }
}

function writeClaimsFile(claimsFile, claims) {
  fs.mkdirSync(path.dirname(claimsFile), { recursive: true })
  if (fs.existsSync(claimsFile)) fs.copyFileSync(claimsFile, claimsFile + '.bak')
  const temporary = claimsFile + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(claims, null, 2), 'utf8')
  fs.renameSync(temporary, claimsFile)
}

function acquireLock(lockFile) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })
  const deadline = Date.now() + 10000
  while (true) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' })
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        const stat = fs.statSync(lockFile)
        if (Date.now() - stat.mtimeMs > 30000) fs.unlinkSync(lockFile)
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError
      }
      if (Date.now() >= deadline) throw new Error('等待记事板认领锁超时')
      Atomics.wait(lockSleep, 0, 0, 20)
    }
  }
}

function releaseLock(lockFile) {
  try {
    if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function withClaimsLock(claimsFile, callback) {
  const lockFile = claimsFile + '.lock'
  acquireLock(lockFile)
  try {
    return callback()
  } finally {
    releaseLock(lockFile)
  }
}

module.exports = { readClaimsFile, writeClaimsFile, withClaimsLock }
