# Whole Book Note Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified book-note page with a persistent whole-book note, repeatable AI synthesis, top note navigation, and an independently navigable chapter note/guide sidebar.

**Architecture:** Extend the existing notes file format and AI pipeline with an explicit whole-book scope. Add a focused renderer workspace around `NoteBoard`, reusing current note editing, Markdown rendering, guide IPC, and `ArticleDivider` behavior.

**Tech Stack:** Electron 30, React 18, TypeScript, Zustand, Vitest, Testing Library, electron-vite.

**Spec:** `docs/superpowers/specs/2026-11-22-whole-book-note-workspace-design.md`

## Global Constraints

- Do not move or merge chapter note files.
- Whole-book AI input excludes annotation notes, chapter guides, chapter source text, and previous AI whole-book output.
- Existing chapter-note AI generation remains one-shot and keeps its current source inputs.
- Do not add dependencies or persistent UI state.
- Do not run Electron/E2E without separate user confirmation.
- Main workspace stays protected until the explicitly authorized final merge.

---

### Task 1: Whole-book file identity and safe regeneration

**Files:**
- Modify: `src/types/index.ts`, `electron/lib/notes.ts`, `electron/ipc/notes.ts`
- Create: `src/lib/whole-book-note.ts`
- Test: `tests/notes.test.ts`, `tests/notes-book.test.ts`, `tests/notes-ai-ipc.test.ts`, `tests/note-ai.test.ts`

**Interfaces:**
- Produces: `NoteMeta.bookScope?: 'whole'`; `splitOriginalNote(body)`; `composeWholeBookBody(aiBody, original)`; repeatable whole-book `applyAiNote`.

- [ ] Add failing tests for whole-book create/find, original extraction, repeated generation, and unchanged chapter behavior.
- [ ] Run the four test files and confirm the new cases fail for missing scope/repeat behavior.
- [ ] Implement the minimal metadata, body helpers, IPC argument propagation, and regeneration guards.
- [ ] Re-run the four files and confirm green.

### Task 2: Whole-book AI material assembly

**Files:**
- Modify: `electron/lib/note-ai-source.ts`, `electron/lib/note-ai-generation.ts`, `electron/ipc/notes.ts`
- Test: `tests/note-ai-source.test.ts`, `tests/note-ai-generation.test.ts`, `tests/notes-ai-ipc.test.ts`

**Interfaces:**
- Consumes: `bookScope` and original-body helpers from Task 1.
- Produces: `AiNoteSourceIdentity { type: 'whole-book'; book: string }` and whole-book `AiNoteInput`.

- [ ] Add failing fixtures proving exact included/excluded materials and the `已有全书笔记` label.
- [ ] Run the three test files and verify expected failures.
- [ ] Assemble TOC, short book guide, chapter main notes, and existing whole-book original; skip the one-shot guard only for whole-book notes.
- [ ] Re-run the three files and confirm green.

### Task 3: Unified book-note workspace and independent sidebar

**Files:**
- Create: `src/components/notes/BookNoteWorkspace.tsx`, `src/components/notes/WholeBookNoteEditor.tsx`
- Modify: `src/components/notes/NoteBoard.tsx`, `src/components/notes/AiNoteGenerator.tsx`, `src/lib/notes-list.ts`, `src/store/index.ts`
- Test: `tests/book-note-workspace.test.tsx`, `tests/note-board.test.tsx`, `tests/ai-note-generator.test.tsx`

**Interfaces:**
- Consumes: whole-book find/create, `booksChapters`, `writingRead`, `articleAssistantReadGuide`, `ArticleDivider`.
- Produces: visible top navigation, independently selected sidebar chapter/mode, whole-book original editor.

- [ ] Write failing component tests for independent center/sidebar paths, note/guide tabs, empty states, whole-note creation, sidebar controls, and original-body editing.
- [ ] Run the component tests and confirm failures are caused by missing workspace behavior.
- [ ] Implement the smallest workspace and editor; reuse current store width/collapse actions and Markdown components.
- [ ] Re-run component tests and confirm green.

### Task 4: Documentation, source map, and full targeted verification

**Files:**
- Modify: `docs/README.md`, `AGENTS.md`, `e2e/source-map.json` as required by changed-source coverage
- Test: all affected Vitest files

- [ ] Update current documentation and remove superseded status if needed.
- [ ] Run all affected Vitest files, `npx electron-vite build`, and `npm run docs:check`.
- [ ] Inspect `git diff` and `git status` for scope, generated files, and accidental main-workspace changes.
- [ ] Commit the verified feature branch.

### Task 5: Authorized main integration and notepad closure

**Files:**
- Modify only through running-app `state:patch` when Electron is active: root `notepad.json`

- [ ] Commit every pre-existing main-workspace change as explicitly requested by the user.
- [ ] Rebase the verified feature branch if needed, then fast-forward main and push `origin/main`.
- [ ] Archive item `nmwre6y19sm08` with `resolvedAt` and `source: 'agent'`; clear its claim.
- [ ] Confirm main and origin point to the delivered commit, then clean up only this feature worktree/branch after verification.
