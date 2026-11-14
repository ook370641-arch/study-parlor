---
status: planned
---

# Writing Album Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver grouped article/repository album walls with cached word counts, AI covers, deletion, and shared presentational primitives without changing blog/note domain behavior.

**Architecture:** Domain walls adapt their own data to controlled `AlbumWall`, `AlbumGrid`, `AlbumCard`, and `AlbumGroupSection` components. Deterministic writing metadata uses a catalog cache independent from AI summaries; cover storage remains root-specific.

**Tech Stack:** Electron 30, React 18, TypeScript, Zustand, Tailwind, gray-matter, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-writing-album-wall-design.md`

## Global Constraints

- Selected grouping is A: directory sections, exact-directory membership, nested relative paths, root files under 未分组.
- Shared components do not read the store or invoke IPC.
- Do not change blog grouping/reordering semantics or remove note ratings/chapter selection.
- Run only affected tests and E2E specs; never launch a second app instance manually.

---

### Task 1: Shared album primitives

**Files:**
- Create: `src/components/album-wall/AlbumWall.tsx`
- Create: `src/components/album-wall/AlbumCard.tsx`
- Create: `src/components/album-wall/AlbumGroupSection.tsx`
- Modify: `src/components/anthropic/BlogWall.tsx`
- Modify: `src/components/anthropic/BlogMineGroupSection.tsx`
- Modify: `src/components/notes/NotesWall.tsx`
- Test: `tests/blog-wall.test.tsx`
- Test: `tests/notes-wall.test.tsx`

**Interfaces:**
- Produces: controlled components with `testId`, optional toolbar/empty content, card slots, group collapse and optional drag callbacks.

- [ ] **Step 1: Add failing shared-component assertions**

```tsx
expect(screen.getByTestId('blog-wall')).toHaveAttribute('data-album-wall', 'blog')
expect(screen.getByTestId('notes-wall')).toHaveAttribute('data-album-wall', 'notes')
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/blog-wall.test.tsx tests/notes-wall.test.tsx`
Expected: FAIL on the new attributes.

- [ ] **Step 3: Implement primitives and adapt existing walls**

```tsx
export function AlbumGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--album-card-min, 170px), 1fr))' }}>{children}</div>
}
```

Keep all current test ids, keyboard opening, drag handles, badges, note chapter selectors and generator overlays working through slots.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/blog-wall.test.tsx tests/notes-wall.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS. Commit: `refactor(album-wall): share presentational primitives`

### Task 2: Cached word counts and writing metadata

**Files:**
- Create: `electron/lib/text-stats.ts`
- Create: `electron/lib/writing-wall-metadata.ts`
- Modify: `electron/lib/notes.ts`
- Modify: `electron/lib/writing-catalog.ts`
- Modify: `electron/ipc/writing.ts`
- Modify: `src/types/index.ts`
- Test: `tests/text-stats.test.ts`
- Test: `tests/writing-wall-metadata.test.ts`
- Test: `tests/writing-catalog.test.ts`

**Interfaces:**
- Produces: `countTextWords(body: string): number`; `attachWritingWallMetadata(lib, root, nodes): WritingTreeNode[]`; optional `wordCount`, `mtimeMs`, `coverUrl` on file nodes.

- [ ] **Step 1: Write failing count and cache tests**

```ts
expect(countTextWords('中文 two words\n42 https://example.com')).toBe(5)
```

Create a nested Markdown file, attach metadata, assert its count, change only `mtimeMs` in the AI summary entry and assert the wall cache does not suppress `diffStale`.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/text-stats.test.ts tests/writing-wall-metadata.test.ts`
Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement deterministic metadata**

```ts
const han = body.match(/\p{Script=Han}/gu)?.length ?? 0
const words = bodyWithoutUrls.replace(/\p{Script=Han}/gu, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
return han + words
```

Use `wallMtimeMs` for this cache and preserve existing title/summary fields when updating an entry. Parse `cover` but never expose arbitrary paths.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/text-stats.test.ts tests/writing-wall-metadata.test.ts tests/writing-catalog.test.ts tests/writing-tree.test.ts`
Expected: PASS. Commit: `feat(writing): cache album metadata`

### Task 3: Grouped writing wall and navigation

**Files:**
- Create: `src/lib/writing-wall.ts`
- Create: `src/components/writing/WritingWall.tsx`
- Modify: `src/components/writing/WritingListColumn.tsx`
- Modify: `src/components/writing/WritingBoard.tsx`
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/store/index.ts`
- Test: `tests/writing-wall.test.tsx`
- Test: `tests/writing-list-column.test.tsx`

**Interfaces:**
- Produces: `buildWritingWallGroups(nodes, sort)` and `showWritingWall(root): Promise<void>`; wall visibility remains per-root runtime state.

- [ ] **Step 1: Write failing grouping and interaction tests**

```ts
expect(buildWritingWallGroups(tree, 'default').map(group => group.label)).toEqual(['未分组', '研究 / 访谈'])
```

Assert card click calls `selectWritingFile`, return saves dirty content, collapse hides only its own group, and hover reveals the formatted count.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/writing-wall.test.tsx tests/writing-list-column.test.tsx`
Expected: FAIL because the wall is absent.

- [ ] **Step 3: Implement wall and view routing**

```ts
const tabRoot = writingTab === 'articles' ? 'writing' : writingTab === 'repository' ? 'repository' : 'notes'
const hasMatchingDocument = writingRootOf(writingFilePath ?? '') === tabRoot
```

Render `WritingWall` for article/repository when there is no matching document or its explicit wall flag is set. Back navigation saves dirty content before clearing the document; the auto-select effect respects explicit wall mode.

- [ ] **Step 4: Add confirmed deletion**

Reuse `ConfirmDialog` and `ipc.writingDelete({ path })`; on success refresh the tree without clearing explicit wall mode. Show the existing store toast on failure.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/writing-wall.test.tsx tests/writing-list-column.test.tsx tests/writing-tree-delete.test.tsx`
Expected: PASS. Commit: `feat(writing): add grouped album walls`

### Task 4: Reusable AI covers for writing

**Files:**
- Create: `src/components/album-wall/CoverGenerator.tsx`
- Create: `electron/lib/writing-covers.ts`
- Modify: `src/components/notes/NoteCoverGenerator.tsx`
- Modify: `src/components/writing/WritingWall.tsx`
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/ipc/writing.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/types/index.ts`
- Test: `tests/note-cover-generator.test.tsx`
- Test: `tests/writing-covers.test.ts`

**Interfaces:**
- Produces: `writingGenerateCovers({ path })` and `writingSaveCover({ path, design })`; shared generator accepts async generate/save callbacks.

- [ ] **Step 1: Write failing storage and UI tests**

```ts
expect(() => saveWritingCover(lib, 'notes/a.md', design)).toThrow()
```

Verify the shared generator retains candidates on save failure and writing cards use identical generating/pending interactions.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/note-cover-generator.test.tsx tests/writing-covers.test.ts`
Expected: FAIL on the new writing API.

- [ ] **Step 3: Implement adapter-based generation and atomic storage**

Store SVGs under `<root>/.covers/` with a hash of the relative path plus design hash. Preserve unknown frontmatter and body, keep the old cover until the new save succeeds, and reuse `validateNoteCoverDesign` / `renderNoteCoverSvg`.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/note-cover-generator.test.tsx tests/note-covers.test.ts tests/writing-covers.test.ts tests/writing-wall.test.tsx`
Expected: PASS. Commit: `feat(writing): generate album covers`

### Task 5: End-to-end wiring and documentation

**Files:**
- Create: `e2e/specs/writing-album-wall.spec.ts`
- Modify: `e2e/source-map.json`
- Modify: `electron/lib/writing-tree.ts`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-14-writing-album-wall-design.md`

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Add the focused E2E chain**

Create grouped Markdown files, open the articles wall, verify section labels/counts and hover word count, open and return, generate/select a deterministic E2E cover, delete with confirmation, and assert the file disappears without auto-opening another card.

- [ ] **Step 2: Cover deletion cleanup**

Add a unit assertion that deleting a file removes its generated cover; implement best-effort cleanup only after the Markdown deletion succeeds.

- [ ] **Step 3: Register coverage and update current docs**

Map the new spec to writing components/IPC/metadata/covers in `e2e/source-map.json`. Update domains 12 and 13, remove `status: planned` from the implemented spec, and preserve historical blog/note specs.

- [ ] **Step 4: Run final focused verification**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: affected specs PASS. Then run `npm run build` and `npm run docs:check`; both exit 0.

- [ ] **Step 5: Commit**

Commit: `feat(writing): complete album wall interactions`

