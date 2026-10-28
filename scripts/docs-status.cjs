#!/usr/bin/env node
/**
 * docs-status.cjs — 文档库结构与状态校验（docs/README.md「维护协议」的门禁）
 *
 * 用法:
 *   node scripts/docs-status.cjs            # 错误 → exit 1，警告不影响
 *   node scripts/docs-status.cjs --strict   # 警告也 → exit 1
 *
 * 检查项:
 *   E1 frontmatter status 枚举合法（current/planned/removed/superseded/historical）
 *   E2 status: current 必须带 verified 日期（且为合法日期）
 *   E3 superseded → superseded-by、removed → removal：必填且目标文件存在
 *   E4 current/planned 必须被 docs/README.md 索引（文件名出现）；
 *      superseded/removed 可由「取代目标 / 墓碑」代为可达
 *   E5 AGENTS.md 与 .claude/rules/*.md 中引用的 docs/…md 路径必须存在
 *   E6 默认 historical 的文档必须被 docs/README.md 历史链覆盖
 *      （"MM-DD slug" 或完整文件名；跳过索引自身与 rule-mining-drafts/）
 *   W1 docs/ 根层散装 md 必须带显式 status frontmatter（README.md 除外）
 *   W2 current 的 verified 超过 180 天未复核
 */
const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const ROOT = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT, 'docs')
const INDEX = path.join(DOCS_DIR, 'README.md')
const STATUSES = new Set(['current', 'planned', 'removed', 'superseded', 'historical'])
const MARKED = new Set(['current', 'planned', 'removed', 'superseded'])
const STRICT = process.argv.includes('--strict')

const errors = []
const warnings = []
const counts = {}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue // 跳过隐藏目录（.tmp 草稿等）
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

const indexContent = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : ''
if (!indexContent) errors.push('E4 docs/README.md 索引不存在或为空')

const files = walk(DOCS_DIR)
for (const file of files) {
  const relPath = rel(file)
  const base = path.basename(file)
  const { data } = matter(fs.readFileSync(file, 'utf8'))
  const status = data.status

  if (status === undefined) {
    counts['historical(默认)'] = (counts['historical(默认)'] || 0) + 1
    // W1: 根层散装文件必须显式标记（README.md 除外）
    if (path.dirname(file) === DOCS_DIR && base !== 'README.md') {
      warnings.push(`W1 ${relPath}: docs/ 根层散装 md 未带 status frontmatter（应显式标记或移入 superpowers/）`)
    }
    // E6: 历史链全量覆盖——默认 historical 的文档必须能从 docs/README.md 到达
    //     （跳过索引自身与 rule-mining-drafts/ 流程草稿目录）
    const isDraft = file.startsWith(path.join(DOCS_DIR, 'superpowers', 'rule-mining-drafts'))
    if (base !== 'README.md' && !isDraft) {
      const m = base.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/)
      const slugA = m ? m[4].replace(/-(design|plan)(-v\d+)?$/, '') : ''
      const covered = m
        ? indexContent.includes(base) || indexContent.includes(`${m[2]}-${m[3]} ${slugA}`) || indexContent.includes(`${m[2]}-${m[3]} ${m[4]}`)
        : indexContent.includes(base)
      if (!covered) {
        errors.push(`E6 ${relPath}: 未被 docs/README.md 历史链覆盖${m ? `（链中应含 "${m[2]}-${m[3]} ${slugA}"）` : '（索引中应含完整文件名）'}`)
      }
    }
    continue
  }
  if (!STATUSES.has(status)) {
    errors.push(`E1 ${relPath}: 非法 status "${status}"`)
    continue
  }
  counts[status] = (counts[status] || 0) + 1

  if (status === 'current') {
    const v = data.verified
    if (!v) {
      errors.push(`E2 ${relPath}: status: current 必须带 verified 日期`)
    } else {
      const dateStr = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
      const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
      if (Number.isNaN(days)) {
        errors.push(`E2 ${relPath}: verified 不是合法日期 "${dateStr}"`)
      } else if (days > 180) {
        warnings.push(`W2 ${relPath}: verified ${dateStr} 已 ${Math.round(days)} 天未复核（current 基准需随大版本复核）`)
      }
    }
  }

  const pointerField = status === 'superseded' ? 'superseded-by' : status === 'removed' ? 'removal' : null
  let proxyBase = null
  if (pointerField) {
    const target = data[pointerField]
    if (!target) {
      errors.push(`E3 ${relPath}: status: ${status} 必须带 ${pointerField}`)
    } else if (!fs.existsSync(path.join(ROOT, String(target)))) {
      errors.push(`E3 ${relPath}: ${pointerField} 目标不存在 "${target}"`)
    } else {
      proxyBase = path.basename(String(target))
    }
  }

  if (MARKED.has(status)) {
    const reachable = indexContent.includes(base) || (proxyBase && indexContent.includes(proxyBase))
    if (!reachable) {
      errors.push(`E4 ${relPath}: status: ${status} 未被 docs/README.md 索引（文件名未出现${proxyBase ? '，墓碑/取代目标文件名也未出现' : ''}）`)
    }
  }
}

// E5: AGENTS.md 与 rules 引用的 docs 路径存在性
const refFiles = [path.join(ROOT, 'AGENTS.md'), ...walk(path.join(ROOT, '.claude', 'rules'))]
for (const refFile of refFiles) {
  const refs = fs.readFileSync(refFile, 'utf8').match(/docs\/[^\s`'"()（）]+\.md/g) || []
  for (const ref of refs) {
    if (!fs.existsSync(path.join(ROOT, ref))) {
      errors.push(`E5 ${rel(refFile)}: 引用的文档不存在 "${ref}"`)
    }
  }
}

const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')
console.log(`[docs-status] 扫描 ${files.length} 份 md；状态分布: ${summary || '无标记'}`)

if (errors.length) {
  console.error(`\n[docs-status] ✗ ${errors.length} 个错误`)
  for (const e of errors) console.error('  ' + e)
}
if (warnings.length) {
  console.warn(`\n[docs-status] ⚠ ${warnings.length} 个警告`)
  for (const w of warnings) console.warn('  ' + w)
}
if (!errors.length && !warnings.length) console.log('[docs-status] ✓ 全部通过')

if (errors.length > 0 || (STRICT && warnings.length > 0)) process.exit(1)
