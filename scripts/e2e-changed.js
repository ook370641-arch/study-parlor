/**
 * 基于 git diff 运行受影响的 E2E 测试。
 *
 * 读取 e2e/source-map.json，用 git diff 找出变更的源文件，
 * 通过 minimatch 匹配受影响的 E2E spec group，输出或执行。
 *
 * 用法：
 *   node scripts/e2e-changed.js              # 列出受影响的 spec（不执行）
 *   node scripts/e2e-changed.js --run        # 执行受影响的 spec
 *   node scripts/e2e-changed.js --base main  # 指定比较基线（默认 main）
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { minimatch } = require('minimatch')

// ── 参数解析 ──────────────────────────────────────────────
const args = process.argv.slice(2)
const run = args.includes('--run')
const baseIdx = args.indexOf('--base')
const base = baseIdx !== -1 ? args[baseIdx + 1] : 'main'

// ── 路径 ──────────────────────────────────────────────────
const repoRoot = path.resolve(__dirname, '..')
const sourceMapPath = path.join(repoRoot, 'e2e', 'source-map.json')
const specsDir = path.join(repoRoot, 'e2e', 'specs')

// ── 读取 source-map ──────────────────────────────────────
if (!fs.existsSync(sourceMapPath)) {
  console.error('[e2e-changed] ERROR: source-map.json not found at:', sourceMapPath)
  process.exit(1)
}
const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'))
const { always, groups } = sourceMap

if (!always || !groups) {
  console.error('[e2e-changed] ERROR: source-map.json must have "always" and "groups" fields')
  process.exit(1)
}

// ── 获取变更文件 ──────────────────────────────────────────
function getChangedFiles(baseBranch) {
  // 1. 优先比较分支差异（feature branch vs base）
  try {
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, { cwd: repoRoot, encoding: 'utf8', timeout: 10000 })
    const files = output.trim().split('\n').filter(Boolean)
    if (files.length > 0) return files
  } catch {
    // 无共同历史或分支不存在，继续向下
  }

  // 2. 回退：检出 staged + unstaged 工作区变更 + untracked 文件
  const files = new Set()
  function collect(cmd) {
    try {
      const out = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 10000 })
      out.trim().split('\n').filter(Boolean).forEach(f => files.add(f))
    } catch { /* ignore */ }
  }
  collect('git diff --name-only --cached')            // staged
  collect('git diff --name-only')                     // unstaged
  collect('git ls-files --others --exclude-standard') // untracked (new files not yet in git)
  return [...files]
}

const changedFiles = getChangedFiles(base)

if (changedFiles.length === 0) {
  console.log('[e2e-changed] No changed files detected.')
  process.exit(0)
}

console.log(`[e2e-changed] Changed files (${changedFiles.length}):`)
changedFiles.forEach(f => console.log(`  ${f}`))
console.log()

// ── 解析 spec globs 为实际文件 ────────────────────────────
function resolveSpecs(specPatterns) {
  const available = fs.readdirSync(specsDir).filter(f => f.endsWith('.spec.ts'))
  const matched = new Set()
  for (const pattern of specPatterns) {
    let found = false
    for (const file of available) {
      if (minimatch(file, pattern)) {
        matched.add(file)
        found = true
      }
    }
    if (!found) {
      console.warn(`[e2e-changed] WARNING: spec pattern "${pattern}" matched no files in e2e/specs/`)
    }
  }
  return [...matched]
}

// ── 匹配变更文件到 groups ─────────────────────────────────
const matchedSpecs = new Set()

// always 列表始终包含
resolveSpecs(always).forEach(s => matchedSpecs.add(s))

const affectedGroups = []
for (const [groupName, group] of Object.entries(groups)) {
  const { sources, specs } = group
  if (!sources || !specs) {
    console.warn(`[e2e-changed] WARNING: group "${groupName}" missing "sources" or "specs", skipping`)
    continue
  }

  // 检查是否有变更文件匹配该 group 的任一 source pattern
  let hit = false
  for (const changedFile of changedFiles) {
    for (const sourcePattern of sources) {
      if (minimatch(changedFile, sourcePattern)) {
        hit = true
        break
      }
    }
    if (hit) break
  }

  if (hit) {
    affectedGroups.push(groupName)
    const resolved = resolveSpecs(specs)
    resolved.forEach(s => matchedSpecs.add(s))
  }
}

// ── 变更文件本身是 E2E spec？直接加入执行列表 ──
const changedSpecs = changedFiles
  .filter(f => f.startsWith('e2e/specs/') && f.endsWith('.spec.ts'))
  .map(f => path.basename(f))
changedSpecs.forEach(s => {
  matchedSpecs.add(s)
  console.log(`[e2e-changed] Directly changed spec: e2e/specs/${s}`)
})

// ── 孤儿 spec 检测 + 自动纳入执行 ──
const allSpecs = fs.readdirSync(specsDir).filter(f => f.endsWith('.spec.ts'))
const coveredSpecs = new Set()
for (const [, group] of Object.entries(groups)) {
  if (!group.specs) continue
  resolveSpecs(group.specs).forEach(s => coveredSpecs.add(s))
}
const orphanSpecs = allSpecs.filter(s => !coveredSpecs.has(s))
if (orphanSpecs.length > 0) {
  console.warn(`[e2e-changed] WARNING: ${orphanSpecs.length} spec(s) not covered by ANY group — auto-including in run:`)
  orphanSpecs.forEach(s => console.warn(`  e2e/specs/${s}`))
  console.warn('[e2e-changed] Add them to a group\'s "specs" or create a new group.')
  // 孤儿 spec 自动纳入执行，避免"新增 spec 永远不跑"的陷阱
  orphanSpecs.forEach(s => matchedSpecs.add(s))
}

// ── 输出结果 ──────────────────────────────────────────────
const specList = [...matchedSpecs].sort()

console.log(`[e2e-changed] Affected groups: ${affectedGroups.length > 0 ? affectedGroups.join(', ') : '(none — changes outside known groups)'}`)
console.log(`[e2e-changed] Specs to run (${specList.length}):`)
specList.forEach(s => console.log(`  e2e/specs/${s}`))

if (specList.length === 0) {
  console.log('[e2e-changed] No specs to run.')
  process.exit(0)
}

// ── 执行（仅 --run 模式）──────────────────────────────────
if (run) {
  console.log()
  console.log('[e2e-changed] Running...')

  const specArgs = specList.map(s => s)  // spec 文件名，相对于 testDir (e2e/specs)
  const cmd = `npx playwright test --config e2e/playwright.config.ts ${specArgs.join(' ')}`

  try {
    execSync(cmd, { cwd: repoRoot, stdio: 'inherit', timeout: 600_000 })
  } catch (err) {
    // Playwright 测试失败时 exit code 非零，正常传递
    process.exit(err.status || 1)
  }
} else {
  console.log()
  console.log('[e2e-changed] Dry-run mode. Use --run to execute.')
  console.log(`[e2e-changed] Or: npm run test:e2e:changed`)
}
