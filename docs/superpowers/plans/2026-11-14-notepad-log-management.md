---
status: planned
---

# Notepad Log Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe restore-to-pending and confirmed deletion interactions to resolved notepad entries.

**Architecture:** Keep both operations in the existing Zustand store and `state:patch` persistence path. Reuse `ConfirmDialog`; hoist optional comments to the base item so restore is lossless.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-notepad-log-management-design.md`

## Global Constraints

- Preserve item id, title, text, category, createdAt and comments on restore.
- Restore to the front of `notepadItems`; delete only from `notepadLog`.
- Do not edit the running app's `state.json` directly.

---

### Task 1: Lossless store transitions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`
- Test: `tests/notepad-update.test.ts`

**Interfaces:**
- Produces: `restoreNotepadItem(id: string): void` and `deleteNotepadLogEntry(id: string): void` on the store.

- [ ] **Step 1: Write failing transition tests**

```ts
useStore.setState({ notepadItems: [], notepadLog: [{ ...claimedItem(), resolvedAt: '2026-11-14T00:00:00Z', source: 'user', comments: [{ id: 'c', text: '反馈', createdAt: '2026-11-14T01:00:00Z' }] }] } as any)
useStore.getState().restoreNotepadItem('a')
expect(useStore.getState().notepadItems[0]).toMatchObject({ id: 'a', comments: [{ id: 'c', text: '反馈' }] })
expect(useStore.getState().notepadLog).toEqual([])
```

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run tests/notepad-update.test.ts`
Expected: FAIL because the two actions do not exist.

- [ ] **Step 3: Implement the actions**

```ts
restoreNotepadItem: (id) => {
  const entry = get().notepadLog.find(item => item.id === id)
  if (!entry) return
  const { resolvedAt: _resolvedAt, source: _source, ...item } = entry
  const notepadItems = [item, ...get().notepadItems]
  const notepadLog = get().notepadLog.filter(item => item.id !== id)
  notepadLocalVersion++
  set({ notepadItems, notepadLog })
  ipc.patchState({ notepadItems: stripNotepadClaims(notepadItems), notepadLog: stripNotepadClaims(notepadLog) } as Partial<StateJson>)
},
```

- [ ] **Step 4: Verify the tests pass and commit**

Run: `npx vitest run tests/notepad-update.test.ts`
Expected: PASS.
Commit: `feat(notepad): add resolved item state transitions`

### Task 2: Resolved-row actions and confirmation

**Files:**
- Modify: `src/components/NotepadPanel.tsx`
- Test: `tests/notepad-assistant.test.tsx`
- Modify: `e2e/specs/notepad-assistant.spec.ts`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-14-notepad-log-management-design.md`

**Interfaces:**
- Consumes: Task 1 store actions.

- [ ] **Step 1: Write failing UI tests**

```tsx
fireEvent.click(screen.getByTestId('notepad-restore-done'))
expect(store.restoreNotepadItem).toHaveBeenCalledWith('done')
fireEvent.click(screen.getByTestId('notepad-delete-log-done'))
expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
expect(store.deleteNotepadLogEntry).toHaveBeenCalledWith('done')
```

- [ ] **Step 2: Verify UI tests fail**

Run: `npx vitest run tests/notepad-assistant.test.tsx`
Expected: FAIL because the action test ids are absent.

- [ ] **Step 3: Add row actions and dialog**

Use `type="button"`, call `event.stopPropagation()`, and render `ConfirmDialog` with `title="删除已完成条目"`, `confirmLabel="永久删除"`, and `confirmVariant="danger"`. Clear expanded/comment state for the affected id in both handlers.

- [ ] **Step 4: Extend the existing E2E flow**

Seed one resolved entry, restore it, assert it returns to pending, resolve it again, delete it from done, and assert `state.json` after reload. Keep it in the existing notepad spec so `e2e/source-map.json` needs no new entry.

- [ ] **Step 5: Verify and update docs**

Run: `npx vitest run tests/notepad-update.test.ts tests/notepad-assistant.test.tsx`
Expected: PASS. Update domain 15 and change the spec from `planned` to historical by removing the status frontmatter. Commit: `feat(notepad): manage resolved items`

