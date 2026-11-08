# AI Note Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated notes understandable on a cold reopen without losing depth.

**Architecture:** Keep search and curation unchanged. Test a reader-first writing prompt against a real JTBD generation; add a polishing call only if that candidate still fails.

**Tech Stack:** TypeScript, Markdown prompts, Vitest, vite-node, Kimi and Tavily.

**Spec:** `docs/superpowers/specs/2026-11-05-ai-note-generation-design.md`

## Global Constraints

- Work only in the isolated `codex/ai-note-readability` worktree.
- Never overwrite the user's note or launch Electron.
- Write real candidates outside the study library and repository.
- Test model output behavior, not the presence of prompt text.
- Preserve the length, citation, source, and original-note contracts.

---

### Task 1: Product requirements

**Files:** `docs/superpowers/specs/2026-11-05-ai-note-generation-design.md`

- [x] Define cold-open scenarios, opening summary, concept scaffolding, plain sentences, reader-facing headings, and preserved depth.
- [x] Run `npm run docs:check`; commit as `f419746`.

### Task 2: Prompt-only experiment

**Files:**
- Modify: `electron/prompts/note-ai-write.md`
- Test: `tests/note-ai-generation.test.ts`
- Temporary: `quality-generate.ts`; delete after use

**Interfaces:** Use `generateAiNoteBody`, `readAiNoteSnapshot`, and `assembleAiNoteInput` without API changes.

- [x] **Step 1: Record RED**

The existing JTBD note is the failing artifact: no independent opening overview, undefined JTBD terminology, and overloaded academic sentences.

- [x] **Step 2: Change only the writing prompt**

Require a 2–4 sentence problem–answer–tension opening, plain-language definitions, one idea per sentence, direct headings, natural original-note connections, and preserved distinctions, reasoning, and boundaries. Prohibit author-credential openings and internal `钻石／展柜` headings. Include one generic abstract-to-plain rewrite example and a silent checklist. Keep length and citation rules unchanged.

- [x] **Step 3: Run regression tests**

Run: `npx vitest run tests/note-ai-generation.test.ts`
Expected: 8 tests PASS with no pipeline changes.

- [x] **Step 4: Generate a real external candidate**

Load the main `.env`, read the JTBD source and guide, and extract only the appended original handwriting:

```ts
const snapshot = readAiNoteSnapshot(config.libraryPath, 'notes/Intercom on Jobs-to-be-Done · Foreword.md')
const separator = '\n\n---\n\n## 原笔迹\n\n'
const originalContent = snapshot.originalContent.includes(separator)
  ? snapshot.originalContent.split(separator).slice(1).join(separator)
  : snapshot.originalContent
const input = assembleAiNoteInput(config.libraryPath, { ...snapshot, originalContent })
const body = await generateAiNoteBody(config, input, stage => console.log(stage))
fs.writeFileSync(outputPath, body, 'utf8')
```

The output path must be outside the repository. Confirm the source note hash remains unchanged.

- [x] **Step 5: Apply the PRD quality gate**

Cold-read the title, opening, and headings for 30 seconds; then inspect definitions, sentence load, distinctions, reasoning, boundaries, personal connection, and citations. Stop with the prompt-only solution if it passes; otherwise record the concrete failure and use Task 3.

### Task 3: Conditional polishing node

**Files:**
- Modify: `electron/lib/note-ai-generation.ts`
- Create: `electron/prompts/note-ai-polish.md`
- Test: `tests/note-ai-generation.test.ts`

**Interfaces:** Consume a complete writing draft and return a polished body. Do not change search, curation, IPC stages, metadata, or file writing.

- [x] **Step 1: Write the failing behavior test**

Return a valid-length academic draft from the writing mock and a distinct plain-language body from the polishing mock. Assert that the generator returns the polished body and that polishing receives the complete draft. Confirm RED because the current generator returns the draft.

- [x] **Step 2: Add the minimal call before length revision**

```ts
const draft = (await callModel(config, writePrompt, 0.5, true)).trim()
const polishPrompt = `${prompt('note-ai-polish.md')}\n\n## 待优化初稿\n${draft}`
let body = (await callModel(config, polishPrompt, 0.3, true)).trim()
```

The polish prompt must preserve judgments, distinctions, reasoning, boundaries, personal connections, citations, and source URLs. It may only fix the opening, explain terms, split sentences, replace officialese, and rename headings.

- [x] **Step 3: Verify and repeat the real generation**

Run `npx vitest run tests/note-ai-generation.test.ts`, then generate the same input again. Keep the node only if the new external candidate materially improves the real artifact.

### Task 4: Verification and documentation

**Files:** `docs/README.md`, the spec, and this plan.

- [x] **Step 1: Run focused verification**

Run: `npx vitest run tests/note-ai-generation.test.ts tests/note-ai-source.test.ts`
Run: `npx electron-vite build`
Run: `npm run docs:check`
Run: `git diff --check`
Expected: PASS. Do not run Electron E2E or unrelated full suites.

- [x] **Step 2: Record actual evidence**

Update the spec, plan, and notes-domain current summary with the chosen approach, candidate paths, observed quality, and exact verification results. Do not claim improvement without reviewing the real candidate.

- [x] **Step 3: Commit**

Stage only the prompt, any conditional pipeline/test changes, and the three documentation files. Commit as `fix(notes): make ai notes easier to reread`.

## Execution result

- Prompt-only candidate: `../ai-note-readability-quality/prompt-only.md`. The opening improved, but undefined JTBD terminology and expressions such as `局部最优／因果结构／成果映射／立论` kept the cold-read cost too high.
- Final candidate: `../ai-note-readability-quality/polishing-node.md`. The opening defines JTBD and the correlation–causation conflict directly; examples, reasoning, boundaries, personal connection, and four actual sources remain readable.
- Both real generations left the source note SHA-256 unchanged: `85991507c117fe43202baf305cb187d3948a0c6fe20445070aec3c32c4e56634`.
- The polishing behavior test failed before implementation because the generator returned the academic draft; it passes after the node was added.
- Focused Vitest: 2 files, 14 tests passed. `npx electron-vite build`, `npm run docs:check`, and `git diff --check` passed. Electron E2E was not run.

