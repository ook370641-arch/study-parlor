# StudyLibrary 分页与卫星图画幅固定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pagination to the topic list and lock GravityField to viewport size so session expansion never pushes pagination out of view or distorts the satellite diagram.

**Architecture:** Convert StudyLibrary from a scrolling list into a fixed-height flex column ("frame mode") with an internal scroll area, paginate topics (10 per page), cap session expansion at 160px with internal scroll, and switch GravityField from absolute to fixed positioning using `window.innerWidth/Height`.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/StudyLibrary.tsx` | Pagination state, fixed-height frame layout, global drag coordinates, pagination UI |
| `src/components/GravityField.tsx` | Fixed full-screen overlay, viewport-based center/radius calculations |

---

### Task 1: Cap Session Expansion Height with Internal Scroll

**Files:**
- Modify: `src/components/StudyLibrary.tsx:194`

**Context:** `TopicAccordion` is an internal component inside `StudyLibrary.tsx`. Its session list currently expands without height limit (`max-h-[800px]`). We need to cap the visible session area and let it scroll internally.

- [ ] **Step 1: Wrap session rows in a fixed-height scroll container**

  Replace the session list div in `TopicAccordion` (around line 194):

  ```tsx
  // BEFORE:
  <div className={`bg-ink/30 overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
    {topic.sessions.map((s) => (
      <SessionRow ... />
    ))}
  </div>

  // AFTER:
  <div className={`bg-ink/30 overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
    <div className="max-h-[160px] overflow-y-auto">
      {topic.sessions.map((s) => (
        <SessionRow ... />
      ))}
    </div>
  </div>
  ```

  The outer `max-h-[200px]` is slightly larger than the inner `max-h-[160px]` to leave room for the transition animation to work smoothly. The inner `max-h-[160px] overflow-y-auto` creates the fixed-height scrollable session area.

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/StudyLibrary.tsx
  git commit -m "fix(TopicAccordion): cap session list at 160px with internal scroll"
  ```

---

### Task 2: Add Pagination Logic and Controls

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

**Context:** `StudyLibrary` currently renders all `displayTopics`. We need to paginate them (10 per page) and render page controls at the bottom.

- [ ] **Step 1: Add pagination state and computed sliced list**

  Inside `StudyLibrary()`, after the existing state hooks (around line 240), add:

  ```tsx
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(0)

  const totalPages = Math.ceil(displayTopics.length / PAGE_SIZE)

  const paginatedTopics = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return displayTopics.slice(start, start + PAGE_SIZE)
  }, [displayTopics, currentPage])
  ```

- [ ] **Step 2: Reset page when filter changes**

  Add an effect to reset `currentPage` to 0 whenever `activeGroupId` changes (group filter), so the user doesn't land on an empty page after filtering:

  ```tsx
  useEffect(() => {
    setCurrentPage(0)
  }, [activeGroupId])
  ```

  Add `useEffect` to the imports if not already present (it is already imported at line 1).

- [ ] **Step 3: Render pagination controls**

  After the topic list rendering block (after `</div>` that closes `displayTopics.map`), add the pagination bar:

  ```tsx
  {totalPages > 1 && (
    <div className="flex items-center justify-center gap-3 py-2 border-t border-slate/10 mt-1">
      <button
        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
        disabled={currentPage === 0}
        className="text-xs text-parchment/40 hover:text-parchment/70 disabled:opacity-20 disabled:cursor-default transition-colors px-2"
      >
        ←
      </button>
      <div className="flex items-center gap-2">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentPage ? 'bg-ember' : 'bg-slate/30 hover:bg-slate/50'
            }`}
          />
        ))}
      </div>
      <button
        onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={currentPage >= totalPages - 1}
        className="text-xs text-parchment/40 hover:text-parchment/70 disabled:opacity-20 disabled:cursor-default transition-colors px-2"
      >
        →
      </button>
    </div>
  )}
  ```

- [ ] **Step 4: Use `paginatedTopics` instead of `displayTopics` in the render loop**

  Change the map from `displayTopics` to `paginatedTopics`:

  ```tsx
  // BEFORE:
  {displayTopics.map((topic) => (

  // AFTER:
  {paginatedTopics.map((topic) => (
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/StudyLibrary.tsx
  git commit -m "feat(StudyLibrary): paginate topics (10 per page) with dot navigation"
  ```

---

### Task 3: Convert StudyLibrary to Fixed-Height Frame Layout

**Files:**
- Modify: `src/components/StudyLibrary.tsx:453-488`
- Modify: `src/pages/Home.tsx:132-134`

**Context:** Currently StudyLibrary grows with content. We need to make it a fixed-height frame where the topic list scrolls internally and pagination stays pinned at the bottom.

- [ ] **Step 1: Make Home.tsx right column a flex column**

  In `src/pages/Home.tsx`, change the right column wrapper:

  ```tsx
  // BEFORE (around line 132):
  <div className="flex-1 min-w-0">
    <div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
    <StudyLibrary />
  </div>

  // AFTER:
  <div className="flex-1 min-w-0 flex flex-col">
    <div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
    <StudyLibrary />
  </div>
  ```

- [ ] **Step 2: Make StudyLibrary root a flex column that fills parent height**

  In `src/components/StudyLibrary.tsx`, change the root `<div>`:

  ```tsx
  // BEFORE (around line 453):
  <div ref={containerRef} className="relative">

  // AFTER:
  <div ref={containerRef} className="relative flex flex-col flex-1 min-h-0">
  ```

- [ ] **Step 3: Make the topic list container scrollable with fixed height**

  Change the topic list wrapper `<div>`:

  ```tsx
  // BEFORE (around line 464):
  <div className="mt-3 flex flex-col gap-2 relative">
    {gravityFieldOpen && (
      <GravityField ... />
    )}
    {paginatedTopics.map((topic) => (
      ...
    ))}
  </div>

  // AFTER:
  <div className="mt-3 flex flex-col gap-2 relative flex-1 min-h-0 overflow-y-auto">
    {gravityFieldOpen && (
      <GravityField ... />
    )}
    {paginatedTopics.map((topic) => (
      ...
    ))}
  </div>
  ```

  **Note on `min-h-0`**: In a flex column, `flex: 1` alone does not shrink below content size. `min-h-0` is required so this area can shrink and leave room for the pagination bar.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/StudyLibrary.tsx src/pages/Home.tsx
  git commit -m "feat(StudyLibrary): fixed-height frame layout with internal scroll"
  ```

---

### Task 4: Convert GravityField to Fixed Full-Screen Overlay

**Files:**
- Modify: `src/components/GravityField.tsx`

**Context:** GravityField currently uses `absolute inset-0` inside the topic list container and receives `containerWidth/containerHeight` props. It must become a fixed full-screen overlay using viewport dimensions.

- [ ] **Step 1: Remove container dimensions from props and interface**

  ```tsx
  // BEFORE:
  interface GravityFieldProps {
    groups: Group[]
    topics: TopicMeta[]
    draggingTopic: TopicMeta | null
    dragPosition: { x: number; y: number } | null
    containerWidth: number
    containerHeight: number
  }

  export function GravityField({
    groups,
    topics,
    draggingTopic,
    dragPosition,
    containerWidth,
    containerHeight,
  }: GravityFieldProps) {

  // AFTER:
  interface GravityFieldProps {
    groups: Group[]
    topics: TopicMeta[]
    draggingTopic: TopicMeta | null
    dragPosition: { x: number; y: number } | null
  }

  export function GravityField({
    groups,
    topics,
    draggingTopic,
    dragPosition,
  }: GravityFieldProps) {
  ```

- [ ] **Step 2: Replace container dimensions with window dimensions in center calculation**

  In the `centers` useMemo (around line 21):

  ```tsx
  // BEFORE:
  const cx = containerWidth / 2
  const cy = containerHeight / 2
  const radius = Math.min(containerWidth, containerHeight) * 0.3

  // AFTER:
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3
  ```

  Also remove `containerWidth` and `containerHeight` from the `centers` useMemo dependency array:

  ```tsx
  // BEFORE:
  }, [groups, containerWidth, containerHeight])

  // AFTER:
  }, [groups])
  ```

- [ ] **Step 3: Remove container dimensions from topicNodes useMemo deps**

  Around line 79:

  ```tsx
  // BEFORE:
  }, [topics, centers, containerWidth, containerHeight])

  // AFTER:
  }, [topics, centers])
  ```

  Also remove the fallback `containerWidth / 2` and `containerHeight / 2` in the no-center branch (around line 57):

  ```tsx
  // BEFORE:
  return { topic, x: containerWidth / 2, y: containerHeight / 2 }

  // AFTER:
  return { topic, x: window.innerWidth / 2, y: window.innerHeight / 2 }
  ```

- [ ] **Step 4: Change root div from absolute to fixed positioning**

  Around line 87:

  ```tsx
  // BEFORE:
  <div
    className="absolute inset-0 z-20 pointer-events-none"
    style={{ background: 'rgba(26, 21, 18, 0.85)' }}
  >

  // AFTER:
  <div
    className="fixed inset-0 z-50 pointer-events-none"
    style={{ background: 'rgba(26, 21, 18, 0.92)' }}
  >
  ```

  `z-50` ensures it sits above all other UI. The slightly higher opacity (0.92 vs 0.85) compensates for the full-screen coverage.

- [ ] **Step 5: Remove maxDist reference to container dimensions**

  Around line 95, in the SVG line rendering:

  ```tsx
  // BEFORE:
  const maxDist = Math.max(containerWidth, containerHeight)

  // AFTER:
  const maxDist = Math.max(window.innerWidth, window.innerHeight)
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/GravityField.tsx
  git commit -m "feat(GravityField): switch to fixed full-screen overlay with viewport sizing"
  ```

---

### Task 5: Update Drag Logic to Use Global Coordinates

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

**Context:** The drag logic currently calculates `dragPosition` relative to `containerRef`. Since GravityField is now fixed/screen-relative, drag coordinates must be global.

- [ ] **Step 1: Change dragPosition to use global coordinates**

  Replace the `dragPosition` calculation (around line 445):

  ```tsx
  // BEFORE:
  const dragPosition =
    dragState && containerRef.current
      ? {
          x: dragState.currentX - containerRef.current.getBoundingClientRect().left,
          y: dragState.currentY - containerRef.current.getBoundingClientRect().top,
        }
      : null

  // AFTER:
  const dragPosition =
    dragState
      ? { x: dragState.currentX, y: dragState.currentY }
      : null
  ```

- [ ] **Step 2: Change drop target calculation to use viewport coordinates**

  In `handleMouseUp` inside the mouse effect (around line 311), replace the drop calculation block:

  ```tsx
  // BEFORE:
  if (ds.active && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const relativeY = e.clientY - rect.top

    const count = groups.length
    const cx = rect.width / 2
    const cy = rect.height / 2
    const radius = Math.min(rect.width, rect.height) * 0.3

    let nearestGroupId: string | null = null
    let minDist = Infinity

    groups.forEach((group, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      const gx = cx + radius * Math.cos(angle)
      const gy = cy + radius * Math.sin(angle)
      const dist = Math.hypot(relativeX - gx, relativeY - gy)
      if (dist < minDist) {
        minDist = dist
        nearestGroupId = group.id
      }
    })

    if (nearestGroupId && minDist < 72) {
      await moveTopicToGroup(ds.topic.dirName, nearestGroupId)
    }
  }

  // AFTER:
  if (ds.active) {
    const count = groups.length
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3

    let nearestGroupId: string | null = null
    let minDist = Infinity

    groups.forEach((group, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      const gx = cx + radius * Math.cos(angle)
      const gy = cy + radius * Math.sin(angle)
      const dist = Math.hypot(e.clientX - gx, e.clientY - gy)
      if (dist < minDist) {
        minDist = dist
        nearestGroupId = group.id
      }
    })

    if (nearestGroupId && minDist < 72) {
      await moveTopicToGroup(ds.topic.dirName, nearestGroupId)
    }
  }
  ```

- [ ] **Step 3: Remove ResizeObserver and containerSize state**

  Remove the `containerSize` state (around line 273):

  ```tsx
  // REMOVE:
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  ```

  Remove the entire ResizeObserver effect (around lines 276-289):

  ```tsx
  // REMOVE this entire useEffect block:
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  ```

  Remove `containerSize` from the GravityField props (around line 465):

  ```tsx
  // BEFORE:
  <GravityField
    groups={groups}
    topics={library}
    draggingTopic={dragState?.topic ?? null}
    dragPosition={dragPosition}
    containerWidth={containerSize.width}
    containerHeight={containerSize.height}
  />

  // AFTER:
  <GravityField
    groups={groups}
    topics={library}
    draggingTopic={dragState?.topic ?? null}
    dragPosition={dragPosition}
  />
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/StudyLibrary.tsx
  git commit -m "refactor(StudyLibrary): global drag coords, remove ResizeObserver"
  ```

---

### Task 6: Verify Build and Run Dev Server

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: No errors.

- [ ] **Step 2: Run the dev server**

  ```bash
  npm run dev
  ```

  In another terminal, verify the app launches correctly.

- [ ] **Step 3: Manual verification checklist**

  1. Open the app, go to the home page
  2. Confirm the library shows exactly 10 topics on page 1
  3. Click pagination dots/arrows to navigate between pages
  4. Click a topic to expand its sessions — confirm sessions scroll internally within ~160px and pagination stays visible
  5. Expand multiple topics simultaneously — confirm list height does not grow
  6. Click a group filter ribbon button — confirm pagination resets to page 1
  7. Drag a topic to initiate GravityField — confirm it covers the full screen at correct proportions
  8. While GravityField is open, verify you can still click pagination (if visible behind) or close GravityField with Escape/click-outside
  9. Drop a topic onto a group center — confirm the move completes successfully

- [ ] **Step 4: Commit**

  ```bash
  git commit --allow-empty -m "chore: verify pagination + gravity field implementation"
  ```

---

## Self-Review

**Spec coverage check:**
- Fixed-height frame layout → Task 3
- Pagination (10 per page, dot nav, arrows) → Task 2
- Session internal scroll → Task 1
- GravityField fixed + viewport sizing → Task 4
- Global drag coordinates → Task 5
- Filter reset to page 1 → Task 2 Step 2
- Pagination visibility (no grow) → Task 3

**Placeholder scan:** None found. All steps contain exact file paths, line numbers, before/after code blocks, and expected outputs.

**Type consistency check:**
- `GravityFieldProps` removes `containerWidth`/`containerHeight` — consistent across Task 4 and Task 5
- `dragPosition` now holds global `{x, y}` — consistent between StudyLibrary (Task 5) and GravityField (Task 4)
- `window.innerWidth/Height` used consistently in both drop calculation (Task 5) and GravityField rendering (Task 4)
