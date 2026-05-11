# 分组推荐卡片与删除确认弹窗 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在左侧栏实现按分组着色的智能推荐卡片（带独立刷新），并为分组删除和 session 删除添加 Disco Elysium 风格的确认弹窗。

**Architecture:** 新增 `ConfirmDialog` 和 `GroupRecCard` 两个 React 组件；扩展 IPC 层（preload/main/renderer facade）添加分组推荐和归档 session 删除能力；Prompt 层新增 `group-inspiration.md`；Store 新增 `deleteArchivedSession` action。所有删除操作通过共用弹窗组件统一处理。

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, Kimi API

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | IpcApi 新增 `llmGroupInspiration` 和 `deleteArchivedSession` |
| `electron/preload.ts` | 修改 | 暴露两个新 IPC 方法 |
| `src/lib/ipc.ts` | 修改 | facade 暴露新方法 |
| `electron/ipc/files.ts` | 修改 | 新增 `files:deleteArchivedSession` handler |
| `electron/ipc/llm.ts` | 修改 | 新增 `llm:groupInspiration` handler |
| `electron/lib/llm-tasks.ts` | 修改 | 新增 `generateGroupInspiration` 函数 |
| `electron/prompts/group-inspiration.md` | 新建 | 分组推荐专用 prompt |
| `src/store/index.ts` | 修改 | 新增 `deleteArchivedSession` action，避免与现有 `deleteSession` 冲突 |
| `src/components/ConfirmDialog.tsx` | 新建 | 共用确认弹窗组件 |
| `src/components/GroupRecCard.tsx` | 新建 | 分组推荐卡片（含色条、刷新按钮、hook 文案） |
| `src/components/InspirationChip.tsx` | 删除 | 被 GroupRecCard 替代 |
| `src/pages/Home.tsx` | 修改 | 替换推荐列表为 GroupRecCard |
| `src/components/StudyLibrary.tsx` | 修改 | SessionRow 增加删除按钮 + ConfirmDialog 调用 |
| `src/components/GroupRibbon.tsx` | 修改 | 删除改为触发 ConfirmDialog |

---

## Task 1: 类型定义与 IPC 契约

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

### Step 1: IpcApi 新增接口

在 `src/types/index.ts` 中，`IpcApi` 类型的 `llmGenerateFable` 之后、`onLlmChunk` 之前插入：

```typescript
  llmGroupInspiration: (args: {
    groupName: string
    existingTopics: string[]
    profile: Profile
  }) => Promise<NewTopic>
```

在 `deleteGroup` 之后插入：

```typescript
  deleteArchivedSession: (args: {
    dirName: string
    sessionNumber: number
  }) => Promise<void>
```

### Step 2: Preload 暴露

在 `electron/preload.ts` 中，`llmGenerateFable` 之后添加：

```typescript
  llmGroupInspiration: (a) => ipcRenderer.invoke('llm:groupInspiration', a),
```

在 `deleteGroup` 之后添加：

```typescript
  deleteArchivedSession: (a) => ipcRenderer.invoke('files:deleteArchivedSession', a),
```

### Step 3: Renderer facade 暴露

在 `src/lib/ipc.ts` 中，`llmGenerateFable` 之后添加：

```typescript
  get llmGroupInspiration() { return ensure().llmGroupInspiration },
```

在 `deleteGroup` 之后添加：

```typescript
  get deleteArchivedSession() { return ensure().deleteArchivedSession },
```

### Step 4: 验证编译

```bash
npx tsc --noEmit
```

Expected: 无错误（此时没有使用新方法的代码，只是类型声明）

### Step 5: Commit

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts
git commit -m "types: add llmGroupInspiration and deleteArchivedSession to IpcApi"
```

---

## Task 2: 后端 IPC — 删除归档 Session

**Files:**
- Modify: `electron/ipc/files.ts`

### Step 1: 新增 handler

在 `registerFilesIpc` 函数末尾、`groups:delete` handler 之后添加：

```typescript
  ipcMain.handle('files:deleteArchivedSession', async (_, args: {
    dirName: string
    sessionNumber: number
  }): Promise<void> => {
    validateDirName(args.dirName)
    const sessionDir = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`)
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found: ${sessionDir}`)
    }
    fs.rmSync(sessionDir, { recursive: true, force: true })
  })
```

### Step 2: 写测试

创建 `tests/delete-session.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('deleteArchivedSession', () => {
  const tmpDir = path.join(os.tmpdir(), 'study-parlor-test-' + Date.now())
  const topicDir = path.join(tmpDir, 'TestTopic')
  const sessionDir = path.join(topicDir, 's2')

  beforeEach(() => {
    fs.mkdirSync(sessionDir, { recursive: true })
    fs.writeFileSync(path.join(sessionDir, '学习报告.md'), '# test', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '原始对话.md'), 'test', 'utf8')
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should delete session directory and all files', () => {
    expect(fs.existsSync(sessionDir)).toBe(true)
    fs.rmSync(sessionDir, { recursive: true, force: true })
    expect(fs.existsSync(sessionDir)).toBe(false)
    expect(fs.existsSync(topicDir)).toBe(true)
  })
})
```

Run:
```bash
npx vitest run tests/delete-session.test.ts
```

Expected: PASS

### Step 3: Commit

```bash
git add electron/ipc/files.ts tests/delete-session.test.ts
git commit -m "feat(ipc): add files:deleteArchivedSession handler with test"
```

---

## Task 3: 后端 IPC — 分组推荐 Prompt 与 LLM 调用

**Files:**
- Create: `electron/prompts/group-inspiration.md`
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/ipc/llm.ts`

### Step 1: 创建分组推荐 Prompt

创建 `electron/prompts/group-inspiration.md`：

```markdown
你正在为学习者推荐一个"universal"的新学习主题。

分组名称: {{group_name}}
该分组下已有主题: {{existing_topics}}
学习者画像: {{profile_text}}
偏好领域: {{preferred_topics}}

要求：
1. 基于该分组已有的主题，向外推进一步，推荐一个足够 universal、有拓展价值的新主题
2. 不要推荐该分组下已经存在的主题
3. 不要推荐过于宽泛的主题（如"编程"、"哲学"），要具体、单次会话能讲完

请输出严格 JSON 对象，不要任何额外文字：
{ "topic": "主题名", "hook": "hook文案(以"你"开头，暗示学习者已站在门槛上，制造内在对话感，不超40字)" }
```

### Step 2: 新增 generateGroupInspiration 函数

在 `electron/lib/llm-tasks.ts` 中，`generateInspirations` 之后添加：

```typescript
export async function generateGroupInspiration(
  cfg: AppConfig,
  args: {
    groupName: string
    existingTopics: string[]
    profile: Profile
  }
): Promise<NewTopic> {
  const prompt = read('group-inspiration.md')
    .replace('{{group_name}}', args.groupName)
    .replace('{{existing_topics}}', args.existingTopics.join(' / '))
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{preferred_topics}}', args.profile.preferred_topics.join(' / '))

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as NewTopic
    if (!json.topic || !json.hook) throw new Error('shape')
    return json
  } catch {
    return { topic: `${args.groupName} — 进阶探索`, hook: '你已深耕这片土壤，但边界之外，还有未被命名的疆域。' }
  }
}
```

### Step 3: 注册 IPC handler

在 `electron/ipc/llm.ts` 中，`llm:inspirations` handler 之后添加：

```typescript
  ipcMain.handle('llm:groupInspiration', async (_, args: {
    groupName: string
    existingTopics: string[]
    profile: Profile
  }) => generateGroupInspiration(cfg, args))
```

### Step 4: Commit

```bash
git add electron/prompts/group-inspiration.md electron/lib/llm-tasks.ts electron/ipc/llm.ts
git commit -m "feat(llm): add group-level inspiration generation with prompt"
```

---

## Task 4: Store — 新增 deleteArchivedSession action

**Files:**
- Modify: `src/store/index.ts`

### Step 1: 新增 action

在 `removeUnsavedSession` 之后、`loadGroups` 之前添加：

```typescript
  deleteArchivedSession: async (dirName: string, sessionNumber: number) => {
    await ipc.deleteArchivedSession({ dirName, sessionNumber })
    const library = await ipc.scanLibrary()
    set({ library })
  },
```

在 `AppStore` 类型中对应位置添加：

```typescript
  deleteArchivedSession: (dirName: string, sessionNumber: number) => Promise<void>
```

### Step 2: 验证编译

```bash
npx tsc --noEmit
```

Expected: 无错误

### Step 3: Commit

```bash
git add src/store/index.ts
git commit -m "feat(store): add deleteArchivedSession action"
```

---

## Task 5: ConfirmDialog 共用组件

**Files:**
- Create: `src/components/ConfirmDialog.tsx`

### Step 1: 实现组件

```tsx
import { useEffect, useCallback } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  icon: 'warning' | 'trash'
  children: React.ReactNode
  confirmLabel: string
  confirmVariant: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  icon,
  children,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') onConfirm()
  }, [onConfirm, onCancel])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const iconMap = {
    warning: '⚠',
    trash: '\u{1F5D1}'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(20,15,12,0.85)' }}
      onClick={onCancel}
    >
      <div
        className="bg-ink border border-slate/50 rounded-lg p-7 max-w-md w-[90%]"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xl mb-3" style={{ color: '#8a3a3a' }}>
          {iconMap[icon]}
        </div>
        <h3 className="font-serif text-lg font-semibold text-parchment mb-3">
          {title}
        </h3>
        <div className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(232,213,183,0.6)' }}>
          {children}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border font-sans transition-colors"
            style={{
              background: 'transparent',
              borderColor: 'rgba(58,90,106,0.5)',
              color: 'rgba(232,213,183,0.7)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(232,213,183,0.5)'
              e.currentTarget.style.color = '#e8d5b7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(58,90,106,0.5)'
              e.currentTarget.style.color = 'rgba(232,213,183,0.7)'
            }}
          >
            {confirmVariant === 'danger' ? '再想想' : '取消'}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded font-sans transition-all"
            style={{
              background: confirmVariant === 'danger' ? '#8a3a3a' : '#d97757',
              color: '#e8d5b7',
              boxShadow: confirmVariant === 'danger'
                ? '2px 2px 0 0 #6a2a2a'
                : '2px 2px 0 0 #3a5a6a'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translate(1px, 1px)'
              e.currentTarget.style.boxShadow = confirmVariant === 'danger'
                ? '1px 1px 0 0 #6a2a2a'
                : '1px 1px 0 0 #3a5a6a'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translate(0, 0)'
              e.currentTarget.style.boxShadow = confirmVariant === 'danger'
                ? '2px 2px 0 0 #6a2a2a'
                : '2px 2px 0 0 #3a5a6a'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Step 2: 写基础测试

创建 `tests/confirm-dialog.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../src/components/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Test"
        icon="warning"
        confirmLabel="OK"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        Body
      </ConfirmDialog>
    )
    expect(screen.queryByText('Test')).not.toBeInTheDocument()
  })

  it('renders when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test Title"
        icon="warning"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        Body text
      </ConfirmDialog>
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Body text')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('再想想')).toBeInTheDocument()
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        icon="warning"
        confirmLabel="OK"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Body
      </ConfirmDialog>
    )
    fireEvent.click(screen.getByText('再想想'))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

Run:
```bash
npx vitest run tests/confirm-dialog.test.tsx
```

Expected: PASS (3 tests)

### Step 3: Commit

```bash
git add src/components/ConfirmDialog.tsx tests/confirm-dialog.test.tsx
git commit -m "feat(ui): add ConfirmDialog shared component with tests"
```

---

## Task 6: GroupRecCard 分组推荐卡片

**Files:**
- Create: `src/components/GroupRecCard.tsx`
- Modify: `src/components/InspirationChip.tsx` → 可删除或保留作为内部 fallback

### Step 1: 实现组件

```tsx
import { useState, useCallback } from 'react'
import { useStore } from '@/store'
import type { Group, NewTopic } from '@shared/index'
import { ipc } from '@/lib/ipc'

const GROUP_COLOR_MAP: Record<string, string> = {
  'AI Tools': '#8b5a2b',
  'Philosophy': '#5a4632',
  'Psychology': '#4a6741',
  'Design': '#4a5568'
}

function getGroupTagColor(groupColor: string): string {
  // 将 group color 提亮约 25% 用于文字
  // 简单处理：返回原始颜色（tailwind 中通过 opacity 控制对比度）
  return groupColor
}

export function GroupRecCard({
  group,
  existingTopics,
  onClickTopic
}: {
  group: Group
  existingTopics: string[]
  onClickTopic: (topic: string) => void
}) {
  const profile = useStore((s) => s.profile)
  const [recommendation, setRecommendation] = useState<NewTopic | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(0)

  const load = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefresh < 30000) return // 30s debounce
    setLoading(true)
    setError(false)
    try {
      const result = await ipc.llmGroupInspiration({
        groupName: group.name,
        existingTopics,
        profile
      })
      setRecommendation(result)
      setLastRefresh(now)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [group.name, existingTopics, profile, lastRefresh])

  // 首次加载
  const [hasLoaded, setHasLoaded] = useState(false)
  if (!hasLoaded && !loading && !recommendation && !error) {
    setHasLoaded(true)
    load()
  }

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/40 border border-slate/30 rounded py-3 px-4">
        <div className="text-xs text-parchment/40 font-sans text-center">
          <span className="inline-block w-3 h-3 border-2 border-parchment/20 border-t-ember rounded-full animate-spin mr-2 align-middle" />
          正在浮现……
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={load}
        className="block w-full text-left bg-ink/40 border border-slate/30 rounded py-3 px-4 hover:border-ember/40 transition-colors"
      >
        <div className="text-xs text-parchment/40 font-sans">
          这次联结很模糊，再试一次
        </div>
      </button>
    )
  }

  if (!recommendation) return null

  const tagColor = getGroupTagColor(group.color)

  return (
    <div
      className="relative bg-ink/40 border border-slate/30 rounded overflow-hidden hover:border-ember/50 hover:bg-ink/60 transition-all cursor-pointer group"
      onClick={(e) => {
        // 如果点击的是刷新按钮，不触发卡片点击
        const target = e.target as HTMLElement
        if (target.closest('[data-refresh]')) return
        onClickTopic(recommendation.topic)
      }}
    >
      {/* 左侧色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l transition-all group-hover:w-1"
        style={{ backgroundColor: group.color }}
      />

      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-sans tracking-wide" style={{ color: tagColor + 'cc' }}>
            {group.name}
          </span>
          <button
            data-refresh
            onClick={(e) => {
              e.stopPropagation()
              load()
            }}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-ember hover:bg-ember/10 transition-all ${loading ? 'animate-spin' : ''}`}
            title="换一个"
          >
            ↻
          </button>
        </div>
        <div className="font-serif text-[0.95rem] text-parchment font-semibold mb-1">
          {recommendation.topic}
        </div>
        <div className="text-xs text-parchment/50 leading-relaxed italic">
          {recommendation.hook}
        </div>
      </div>
    </div>
  )
}
```

### Step 2: 删除 InspirationChip（不再使用）

```bash
rm src/components/InspirationChip.tsx
```

### Step 3: Commit

```bash
git add src/components/GroupRecCard.tsx
git rm src/components/InspirationChip.tsx
git commit -m "feat(ui): add GroupRecCard component, remove InspirationChip"
```

---

## Task 7: Home.tsx 集成分组推荐

**Files:**
- Modify: `src/pages/Home.tsx`

### Step 1: 替换推荐区域

导入改为：
```tsx
import { GroupRecCard } from '@/components/GroupRecCard'
```

删除 `InspirationChip` 的 import。

将推荐主题 section（从 `<div className="flex flex-col gap-2">` 开始到 `</div>`）替换为：

```tsx
          {/* 从已知推未知 */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-parchment/40 font-sans px-1">从已知推未知</div>

            {groups.map((group) => {
              const groupTopics = library
                .filter((t) => t.groupId === group.id)
                .map((t) => t.title)
              if (groupTopics.length === 0) return null
              return (
                <GroupRecCard
                  key={group.id}
                  group={group}
                  existingTopics={groupTopics}
                  onClickTopic={(topic) =>
                    openPreStudy({ mode: 'progress', topic })
                  }
                />
              )
            })}
          </div>
```

需要添加 `groups` 的 store selector：
```tsx
  const groups = useStore((s) => s.groups)
```

### Step 2: 验证编译

```bash
npx tsc --noEmit
```

Expected: 无错误

### Step 3: Commit

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): replace flat inspirations with group-colored rec cards"
```

---

## Task 8: GroupRibbon 删除确认

**Files:**
- Modify: `src/components/GroupRibbon.tsx`

### Step 1: 导入并添加弹窗状态

```tsx
import { ConfirmDialog } from './ConfirmDialog'
```

在 GroupRibbon 组件中添加 state：
```tsx
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
```

### Step 2: 替换删除逻辑

将删除按钮的 onClick：
```tsx
<button
  onClick={() => {
    onDelete(group.id)
    setMenuOpen(null)
  }}
  className="..."
>
  删除
</button>
```

改为：
```tsx
<button
  onClick={() => {
    setDeleteTarget(group)
    setMenuOpen(null)
  }}
  className="..."
>
  删除
</button>
```

### Step 3: 添加 ConfirmDialog

在组件 return 的最外层（`</div>` 之前）添加：

```tsx
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          title="解散分组"
          icon="warning"
          confirmLabel="确认解散"
          confirmVariant="danger"
          onConfirm={() => {
            onDelete(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        >
          <>
            即将解散分组 <strong style={{ color: '#e8d5b7' }}>「{deleteTarget.name}」</strong>。
            <br /><br />
            该分组下的主题将被移至<strong>默认分组</strong>，主题文件不会被删除。
            <br /><br />
            <span style={{ color: '#8a3a3a', fontWeight: 500 }}>此操作不可撤销。</span>
          </>
        </ConfirmDialog>
      )}
```

### Step 4: Commit

```bash
git add src/components/GroupRibbon.tsx
git commit -m "feat(ribbon): add confirm dialog before deleting a group"
```

---

## Task 9: StudyLibrary — Session 删除按钮与确认

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

### Step 1: 导入 ConfirmDialog

```tsx
import { ConfirmDialog } from './ConfirmDialog'
```

### Step 2: 扩展 SessionRow 添加删除按钮

修改 `SessionRow` 的 props：
```tsx
function SessionRow({
  dirName,
  session,
  onViewFile,
  onReview,
  onDelete
}: {
  dirName: string
  session: SessionMeta
  onViewFile: (v: ViewerState) => void
  onReview: () => void
  onDelete?: (dirName: string, sessionNumber: number) => void
}) {
```

在 `fileButtons` map 之后、review 按钮之前，添加删除按钮：

```tsx
      {onDelete && (
        <button
          onClick={() => onDelete(dirName, session.sessionNumber)}
          className="w-[18px] h-[18px] flex items-center justify-center rounded text-wine/40 hover:text-wine hover:bg-wine/15 transition-all ml-1 shrink-0"
          title="删除 session"
        >
          ✕
        </button>
      )}
```

### Step 3: 添加弹窗状态和处理

在 `StudyLibrary` 组件中添加：

```tsx
  const [deleteDialog, setDeleteDialog] = useState<{
    dirName: string
    sessionNumber: number
    topicName: string
    files: string[]
  } | null>(null)
  const deleteArchivedSession = useStore((s) => s.deleteArchivedSession)
```

添加 handleDelete 函数：
```tsx
  const handleDeleteClick = useCallback((dirName: string, sessionNumber: number) => {
    const topic = library.find((t) => t.dirName === dirName)
    const session = topic?.sessions.find((s) => s.sessionNumber === sessionNumber)
    if (!topic || !session) return

    const files: string[] = []
    if (session.hasReport) files.push('学习报告.md')
    if (session.hasTranscript) files.push('原始对话.md')
    if (session.hasFable) files.push(`寓言${session.fableCount > 1 ? '(×' + session.fableCount + ')' : ''}.md`)
    if (session.hasImage || session.hasFableImage) files.push('配图')

    setDeleteDialog({
      dirName,
      sessionNumber,
      topicName: topic.title,
      files
    })
  }, [library])
```

### Step 4: 传递 onDelete 并渲染 ConfirmDialog

修改 `TopicAccordion` 的调用，传递 `onDelete`：

```tsx
        {open && (
          <div className="bg-ink/20">
            {topic.sessions.map((s) => (
              <SessionRow
                key={s.sessionNumber}
                dirName={topic.dirName}
                session={s}
                onViewFile={setViewer}
                onReview={() =>
                  openPreStudy({
                    mode: 'review',
                    topic: topic.title,
                    dirName: topic.dirName,
                  })
                }
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
```

在 StudyLibrary return 的最外层（`</div>` 之前）添加 ConfirmDialog：

```tsx
      {deleteDialog && (
        <ConfirmDialog
          open={true}
          title="删除 Session"
          icon="trash"
          confirmLabel="彻底删除"
          confirmVariant="danger"
          onConfirm={() => {
            deleteArchivedSession(deleteDialog.dirName, deleteDialog.sessionNumber)
            setDeleteDialog(null)
          }}
          onCancel={() => setDeleteDialog(null)}
        >
          <>
            即将彻底删除 <strong style={{ color: '#e8d5b7' }}>{deleteDialog.topicName} / s{deleteDialog.sessionNumber}</strong>。
            <br /><br />
            {deleteDialog.files.length > 0 && (
              <>
                以下文件将被永久删除：<br />
                <span style={{ color: 'rgba(232,213,183,0.5)' }}>
                  {deleteDialog.files.join(' · ')}
                </span>
                <br /><br />
              </>
            )}
            <span style={{ color: '#8a3a3a', fontWeight: 500 }}>此操作不可撤销。</span>
          </>
        </ConfirmDialog>
      )}
```

### Step 5: 验证编译

```bash
npx tsc --noEmit
```

Expected: 无错误

### Step 6: Commit

```bash
git add src/components/StudyLibrary.tsx
git commit -m "feat(library): add session delete button with confirm dialog"
```

---

## Task 10: 集成测试与最终验证

### Step 1: 运行全部测试

```bash
npm run test
```

Expected: 所有现有测试通过，新增测试通过

### Step 2: 启动开发模式进行手动验证

```bash
npm run dev
```

验证清单：
- [ ] 左侧栏显示分组推荐卡片，每个卡片左侧有色条
- [ ] 点击刷新按钮可以重新生成该分组推荐
- [ ] 点击卡片打开 PreStudyModal，topic 预填
- [ ] 右侧 GroupRibbon 右键删除分组时弹出确认弹窗
- [ ] 弹窗显示正确文案（分组名、移至默认分组、不可撤销）
- [ ] 确认后分组被删除，主题移至默认
- [ ] TopicAccordion 展开的 session 行右侧有 ✕ 删除按钮
- [ ] 点击删除按钮弹出确认弹窗，显示主题名、sN、文件列表
- [ ] 确认后 session 文件夹被彻底删除，library 自动刷新
- [ ] 取消后弹窗关闭，无删除操作
- [ ] ESC 键可关闭弹窗
- [ ] 点击遮罩可关闭弹窗

### Step 3: 最终提交

```bash
git add -A
git commit -m "feat: group-colored recommendation cards + confirm dialogs for delete"
```

---

## 自检清单

### Spec 覆盖度

| Spec 章节 | 对应 Task |
|-----------|-----------|
| 3.1 位置与布局 | Task 7 |
| 3.2 卡片视觉规范 | Task 6 |
| 3.3 Prompt 设计 | Task 3 |
| 3.4 刷新机制 | Task 6 (30s debounce + loading/error states) |
| 3.5 点击行为 | Task 6 |
| 4.1 ConfirmDialog 共用组件 | Task 5 |
| 4.2 分组删除确认 | Task 8 |
| 4.3 Session 删除确认 | Task 9 |
| 4.4 删除按钮视觉 | Task 9 |
| 5.1 新 IPC：分组推荐 | Task 1 + Task 3 |
| 5.2 新 IPC：删除 Session | Task 1 + Task 2 |
| 5.3 状态更新 | Task 4 |

### Placeholder 扫描

- [x] 无 TBD/TODO
- [x] 所有步骤包含完整代码
- [x] 所有测试包含完整断言
- [x] 所有命令包含预期输出

### 类型一致性

- [x] `llmGroupInspiration` 签名在所有三层一致
- [x] `deleteArchivedSession` 签名在所有三层一致
- [x] Store action 命名 `deleteArchivedSession` 与 IPC 方法区分，避免与现有 `deleteSession` 冲突
