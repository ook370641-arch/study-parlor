import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Regression guard for the archive-progress.md bug: a `.replace('{{x}}', ...)`
// whose target prompt lacks `{{x}}` is a silent no-op, so the real content
// (e.g. the conversation transcript) never reaches the LLM and it hallucinates.
// This test asserts every placeholder referenced in source exists in its template.

const ROOT = path.resolve(__dirname, '..')
const PROMPTS_DIR = path.join(ROOT, 'electron', 'prompts')
const SOURCES = [
  'electron/lib/llm-tasks.ts',
  'electron/lib/diagram.ts',
  'electron/lib/prompts.ts',
].map(p => path.join(ROOT, p))

// Walk each source, splitting on read(...)/readPrompt(...) calls and collecting
// the {{placeholders}} targeted by .replace(...) before the next read(...).
// A read with a literal filename is checkable; one with a variable filename
// (e.g. read(strategyFile)) is an unverifiable boundary — it still stops the
// previous chunk so its replaces aren't mis-attributed, but yields no assertions.
function collectPairs(src: string): { file: string; placeholder: string }[] {
  const out: { file: string; placeholder: string }[] = []
  // Match any read(...)/readPrompt(...); capture the literal .md name if present.
  const readRe = /\bread(?:Prompt)?\(\s*(?:(?:`|')([^`']+\.md)(?:`|')|[A-Za-z_$])/g
  const marks: { idx: number; file: string | null }[] = []
  let m: RegExpExecArray | null
  while ((m = readRe.exec(src)) !== null) marks.push({ idx: m.index, file: m[1] ?? null })

  for (let i = 0; i < marks.length; i++) {
    if (marks[i].file === null) continue // variable filename: boundary only
    const start = marks[i].idx
    const end = i + 1 < marks.length ? marks[i + 1].idx : src.length
    const chunk = src.slice(start, end)
    const phRe = /\.replace\(\s*(?:`|')(\{\{[a-zA-Z_]+\}\})(?:`|')/g
    let p: RegExpExecArray | null
    while ((p = phRe.exec(chunk)) !== null) {
      out.push({ file: marks[i].file as string, placeholder: p[1] })
    }
  }
  return out
}

describe('prompt placeholders', () => {
  it('every {{placeholder}} referenced in source exists in its template', () => {
    const pairs = SOURCES.flatMap(f => collectPairs(fs.readFileSync(f, 'utf8')))

    // sanity: the scanner itself still finds the known transcript reference,
    // so a silently-broken scanner can't make this test pass vacuously.
    expect(pairs).toContainEqual({ file: 'archive-progress.md', placeholder: '{{transcript}}' })

    const missing = [...new Set(pairs.map(p => `${p.file}␟${p.placeholder}`))]
      .map(s => { const [file, placeholder] = s.split('␟'); return { file, placeholder } })
      .filter(({ file, placeholder }) =>
        !fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8').includes(placeholder))
      .map(({ file, placeholder }) => `${file} is missing ${placeholder}`)

    expect(missing).toEqual([])
  })
})
