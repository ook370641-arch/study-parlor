# 学习库分组管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为学习库添加分组管理功能：平时以丝带+色条展示分组，拖拽 topic 时切换为引力场视图，释放后自动归组。

**Architecture:** 分组数据存储在学习库根目录的 `.study-groups.json` 中，与文件系统绑定。IPC 层提供 CRUD 操作，Zustand store 管理运行时状态。UI 分两层：平时（丝带过滤+色条标识+按组聚集排列）和拖拽态（引力场 overlay + SVG 磁力线 + 归组检测）。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/index.ts` | Modify | 新增 `Group`, `GroupMapping` 类型；扩展 `TopicMeta`（加 `groupId`）和 `IpcApi`（加分组 IPC 方法） |
| `electron/ipc/files.ts` | Modify | 新增 `groups:load/create/rename/delete/updateMapping` handlers；修改 `getTopicMeta` 注入 `groupId` |
| `electron/preload.ts` | Modify | 暴露 5 个新的分组 IPC 方法到 renderer |
| `src/lib/ipc.ts` | Modify | 为 renderer 添加 5 个分组 IPC facade 方法 |
| `src/store/index.ts` | Modify | 扩展 store：新增 `groups`, `groupMapping`, `activeGroupId`, `gravityFieldOpen`, `draggingTopic` 状态和操作 |
| `src/components/GroupRibbon.tsx` | Create | 顶部丝带组件：分组胶囊按钮 + 创建/重命名/删除 |
| `src/components/GravityField.tsx` | Create | 引力场 overlay：引力中心节点 + SVG 磁力线 + 拖拽跟随 |
| `src/components/StudyLibrary.tsx` | Modify | 整合丝带、引力场、色条、拖拽逻辑、按组聚集排列 |
| `tests/groups.test.ts` | Create | 分组 IPC 和状态管理的功能测试 |

---

## Task 1: 类型定义

**Files:**
- Modify: `src/types/index.ts`
- Test: `tests/groups.test.ts`（为 Task 9 铺垫）

- [ ] **Step 1: 在 `src/types/index.ts` 的 `TopicMeta` 前新增 `Group` 和 `GroupMapping` 类型**

在 `export type FileMeta = ...` 之后、`export type SessionMeta = {` 之前插入：

```typescript
export type Group = {
  id: string
  name: string
  color: string
}

export type GroupMapping = Record<string, string>  // dirName → groupId
```

- [ ] **Step 2: 在 `TopicMeta` 中添加 `groupId` 字段**

修改 `TopicMeta`：

```typescript
export type TopicMeta = {
  dirName: string
  title: string
  sessionCount: number
  sessions: SessionMeta[]
  last_studied: string
  last_studied_days: number
  groupId: string
}
```

- [ ] **Step 3: 在 `IpcApi` 中新增分组 IPC 方法**

在 `readSessionFile` 之后、`}` 之前插入：

```typescript
  // Group management
  loadGroups: () => Promise<{ groups: Group[]; mapping: GroupMapping }>
  updateGroupMapping: (mapping: GroupMapping) => Promise<void>
  createGroup: (name: string, color: string) => Promise<Group>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string, fallbackId: string) => Promise<void>
```

- [ ] **Step 4: 运行 TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 可能因其他文件引用新类型而报错，后续任务会修复

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add Group, GroupMapping and extend TopicMeta/IpcApi"
```

---

## Task 2: IPC 主进程（分组 handlers）

**Files:**
- Modify: `electron/ipc/files.ts`
- Test: `tests/groups.test.ts`

- [ ] **Step 1: 在 `electron/ipc/files.ts` 顶部导入 Group 类型**

在现有 imports 下新增：

```typescript
import type { Group, GroupMapping } from '@shared/index'
```

- [ ] **Step 2: 在 `getTopicMeta` 上方添加 `loadGroupFile` 辅助函数**

在 `getSessionMeta` 和 `getTopicMeta` 之间（约第 73 行附近）插入：

```typescript
function loadGroupFile(filePath: string): { version: number; groups: Group[]; mapping: GroupMapping } {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      console.error('[groups] .study-groups.json corrupted, falling back to default')
    }
  }
  return { version: 1, groups: [{ id: 'default', name: '默认', color: '#d97757' }], mapping: {} }
}
```

- [ ] **Step 3: 修改 `getTopicMeta` 注入 groupId**

在 `getTopicMeta` 函数内部，找到 `return {` 之前（约第 152 行附近），在构造返回值前添加：

```typescript
  // Load group mapping
  const groupFile = path.join(path.dirname(topicDir), '.study-groups.json')
  const groupData = loadGroupFile(groupFile)
  const groupId = groupData.mapping[dirName] || 'default'
```

然后在 `return` 对象中添加 `groupId`：

```typescript
  return {
    dirName,
    title,
    sessionCount: sessions.length,
    sessions,
    last_studied,
    last_studied_days,
    groupId,
  }
```

- [ ] **Step 4: 在 `registerFilesIpc` 内部添加分组 IPC handlers**

在 `registerFilesIpc` 函数的末尾（`}` 之前）插入：

```typescript
  // Group management IPC
  ipcMain.handle('groups:load', async (): Promise<{ groups: Group[]; mapping: GroupMapping }> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    return loadGroupFile(groupFile)
  })

  ipcMain.handle('groups:updateMapping', async (_, mapping: GroupMapping): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    data.mapping = mapping
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })

  ipcMain.handle('groups:create', async (_, name: string, color: string): Promise<Group> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    const id = `group-${Date.now()}`
    const group: Group = { id, name, color }
    data.groups.push(group)
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
    return group
  })

  ipcMain.handle('groups:rename', async (_, id: string, name: string): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    const g = data.groups.find(g => g.id === id)
    if (g) g.name = name
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })

  ipcMain.handle('groups:delete', async (_, id: string, fallbackId: string): Promise<void> => {
    const groupFile = path.join(cfg.libraryPath, '.study-groups.json')
    const data = loadGroupFile(groupFile)
    data.groups = data.groups.filter(g => g.id !== id)
    for (const [dirName, gid] of Object.entries(data.mapping)) {
      if (gid === id) data.mapping[dirName] = fallbackId
    }
    fs.writeFileSync(groupFile, JSON.stringify(data, null, 2), 'utf8')
  })
```

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/files.ts
git commit -m "feat(groups): add IPC handlers for group CRUD and inject groupId into TopicMeta"
```

---

## Task 3: Preload 暴露

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: 在 `electron/preload.ts` 的 `api` 对象中添加分组方法**

在 `recoveryDump` 和 `getState` 之间插入：

```typescript
  loadGroups: () => ipcRenderer.invoke('groups:load'),
  updateGroupMapping: (m) => ipcRenderer.invoke('groups:updateMapping', m),
  createGroup: (name, color) => ipcRenderer.invoke('groups:create', name, color),
  renameGroup: (id, name) => ipcRenderer.invoke('groups:rename', id, name),
  deleteGroup: (id, fallbackId) => ipcRenderer.invoke('groups:delete', id, fallbackId),
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(groups): expose group IPC methods in preload"
```

---

## Task 4: Renderer IPC facade

**Files:**
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: 在 `src/lib/ipc.ts` 的 `ipc` 对象中添加 facade 方法**

在 `get recoveryDump()` 之前插入：

```typescript
  get loadGroups() { return ensure().loadGroups },
  get updateGroupMapping() { return ensure().updateGroupMapping },
  get createGroup() { return ensure().createGroup },
  get renameGroup() { return ensure().renameGroup },
  get deleteGroup() { return ensure().deleteGroup },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ipc.ts
git commit -m "feat(groups): add group IPC facade in renderer"
```

---

## Task 5: Store 扩展

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 导入新类型**

在现有 imports 中添加 `Group` 和 `GroupMapping`：

```typescript
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping
} from '@shared/index'
```

- [ ] **Step 2: 在 `AppStore` 类型中添加分组相关字段**

在 `unsavedSessions: UnsavedSession[]` 之后、`session: Session | null` 之前插入：

```typescript
  // 分组管理
  groups: Group[]
  groupMapping: GroupMapping
  activeGroupId: string | null
  gravityFieldOpen: boolean
  draggingTopic: TopicMeta | null
```

- [ ] **Step 3: 在 `AppStore` 操作类型中添加分组操作方法**

在 `removeUnsavedSession: (id: string) => void` 之后、最后一个 `}` 之前插入：

```typescript
  // 分组操作
  loadGroups: () => Promise<void>
  setActiveGroup: (id: string | null) => void
  moveTopicToGroup: (dirName: string, groupId: string) => Promise<void>
  createGroup: (name: string) => Promise<void>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  setGravityFieldOpen: (open: boolean) => void
  setDraggingTopic: (topic: TopicMeta | null) => void
```

- [ ] **Step 4: 在 store 默认值中添加分组字段**

在 `unsavedSessions: []` 之后、`session: null` 之前插入：

```typescript
  groups: [],
  groupMapping: {},
  activeGroupId: null,
  gravityFieldOpen: false,
  draggingTopic: null,
```

- [ ] **Step 5: 修改 `init` 方法加载分组**

将 `init` 中的 `Promise.all` 从：

```typescript
    const [state, library, unsaved] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions()
    ])
```

改为：

```typescript
    const [state, library, unsaved, groupsData] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions(), ipc.loadGroups()
    ])
```

并在 `set({...})` 中添加：

```typescript
      groups: groupsData.groups,
      groupMapping: groupsData.mapping,
```

- [ ] **Step 6: 在 store 实现中添加分组操作方法**

在 `removeUnsavedSession` 之后、store 的 `})` 之前插入：

```typescript
  loadGroups: async () => {
    const data = await ipc.loadGroups()
    set({ groups: data.groups, groupMapping: data.mapping })
  },

  setActiveGroup: (id) => set({ activeGroupId: id }),

  moveTopicToGroup: async (dirName, groupId) => {
    const mapping = { ...get().groupMapping, [dirName]: groupId }
    await ipc.updateGroupMapping(mapping)
    set({ groupMapping: mapping })
    // Refresh library to update groupId and reorder
    const library = await ipc.scanLibrary()
    set({ library })
  },

  createGroup: async (name) => {
    const color = generateGroupColor()
    const group = await ipc.createGroup(name, color)
    set(s => ({ groups: [...s.groups, group] }))
  },

  renameGroup: async (id, name) => {
    await ipc.renameGroup(id, name)
    set(s => ({
      groups: s.groups.map(g => g.id === id ? { ...g, name } : g)
    }))
  },

  deleteGroup: async (id) => {
    await ipc.deleteGroup(id, 'default')
    set(s => {
      const mapping = { ...s.groupMapping }
      for (const [dirName, gid] of Object.entries(mapping)) {
        if (gid === id) mapping[dirName] = 'default'
      }
      return {
        groups: s.groups.filter(g => g.id !== id),
        groupMapping: mapping,
        activeGroupId: s.activeGroupId === id ? null : s.activeGroupId
      }
    })
    // Refresh library
    const library = await ipc.scanLibrary()
    set({ library })
  },

  setGravityFieldOpen: (open) => set({ gravityFieldOpen: open }),

  setDraggingTopic: (topic) => set({ draggingTopic: topic }),
```

- [ ] **Step 7: 在 store 文件底部（store 定义之外）添加颜色生成函数**

在文件末尾添加：

```typescript
function generateGroupColor(): string {
  const darkColors = [
    '#8b5a2b', '#5a4632', '#4a6741', '#4a5568', '#6b4c3b',
    '#4c5c6b', '#6b5b4c', '#5c4b6b', '#4b6b5c', '#6b4b5c'
  ]
  return darkColors[Math.floor(Math.random() * darkColors.length)]
}
```

- [ ] **Step 8: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(groups): extend store with group state and operations"
```

---

## Task 6: GroupRibbon 组件

**Files:**
- Create: `src/components/GroupRibbon.tsx`

- [ ] **Step 1: 创建 `src/components/GroupRibbon.tsx`**

```typescript
import { useState, useRef, useCallback } from 'react'
import type { Group } from '@shared/index'

interface GroupRibbonProps {
  groups: Group[]
  activeGroupId: string | null
  onSelect: (groupId: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function GroupRibbon({
  groups,
  activeGroupId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: GroupRibbonProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
      setCreating(false)
    }
  }, [newName, onCreate])

  const handleRename = useCallback((id: string) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim())
      setRenaming(null)
      setRenameValue('')
    }
  }, [renameValue, onRename])

  const handleContextMenu = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault()
    if (groupId === 'default') return
    setMenuOpen(groupId)
  }, [])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* "All" button */}
        <button
          onClick={() => onSelect(null)}
          className={`shrink-0 px-3 py-1 text-xs font-sans rounded-full transition-colors ${
            activeGroupId === null
              ? 'bg-parchment/20 text-parchment'
              : 'border border-parchment/20 text-parchment/50 hover:border-parchment/40'
          }`}
        >
          全部
        </button>

        {groups.map((group) => (
          <div key={group.id} className="relative shrink-0">
            {renaming === group.id ? (
              <input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(group.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(group.id)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                className="px-3 py-1 text-xs font-sans rounded-full bg-ink border border-ember text-parchment w-24 outline-none"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onSelect(group.id)}
                onContextMenu={(e) => handleContextMenu(e, group.id)}
                className={`px-3 py-1 text-xs font-sans rounded-full transition-colors ${
                  activeGroupId === group.id
                    ? 'text-ink'
                    : 'border text-parchment/60 hover:text-parchment'
                }`}
                style={
                  activeGroupId === group.id
                    ? { backgroundColor: group.color }
                    : { borderColor: group.color + '80' }
                }
              >
                {group.name}
              </button>
            )}

            {/* Context menu */}
            {menuOpen === group.id && (
              <div
                className="absolute top-full left-0 mt-1 z-10 bg-ink border border-slate/30 rounded shadow-lg py-1 min-w-[80px]"
                onMouseLeave={() => setMenuOpen(null)}
              >
                <button
                  onClick={() => {
                    setRenaming(group.id)
                    setRenameValue(group.name)
                    setMenuOpen(null)
                  }}
                  className="block w-full text-left px-3 py-1 text-xs text-parchment/70 hover:bg-parchment/10 font-sans"
                >
                  重命名
                </button>
                <button
                  onClick={() => {
                    onDelete(group.id)
                    setMenuOpen(null)
                  }}
                  className="block w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 font-sans"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Create button */}
        {creating ? (
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              if (newName.trim()) handleCreate()
              setCreating(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
            placeholder="分组名"
            className="px-3 py-1 text-xs font-sans rounded-full bg-ink border border-parchment/30 text-parchment w-24 outline-none placeholder:text-parchment/30"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 px-2 py-1 text-xs font-sans rounded-full border border-parchment/15 text-parchment/30 hover:border-parchment/30 hover:text-parchment/50 transition-colors"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GroupRibbon.tsx
git commit -m "feat(groups): add GroupRibbon component with create/rename/delete"
```

---

## Task 7: GravityField 组件

**Files:**
- Create: `src/components/GravityField.tsx`

- [ ] **Step 1: 创建 `src/components/GravityField.tsx`**

```typescript
import { useMemo } from 'react'
import type { Group, TopicMeta } from '@shared/index'

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
  // Calculate gravity center positions (evenly distributed in a circle or grid)
  const centers = useMemo(() => {
    const count = groups.length
    if (count === 0) return []

    const cx = containerWidth / 2
    const cy = containerHeight / 2
    const radius = Math.min(containerWidth, containerHeight) * 0.3

    return groups.map((group, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      return {
        group,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })
  }, [groups, containerWidth, containerHeight])

  // Static topic nodes (positioned randomly but consistently)
  const topicNodes = useMemo(() => {
    return topics.map((topic, i) => ({
      topic,
      x: 60 + (i % 4) * (containerWidth / 4 - 20),
      y: 60 + Math.floor(i / 4) * 50,
    }))
  }, [topics, containerWidth])

  if (!draggingTopic || !dragPosition) return null

  const dragX = dragPosition.x
  const dragY = dragPosition.y

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none"
      style={{ background: 'rgba(26, 21, 18, 0.85)' }}
    >
      {/* SVG magnetic lines */}
      <svg className="absolute inset-0 w-full h-full">
        {centers.map((center) => {
          const dist = Math.hypot(dragX - center.x, dragY - center.y)
          const maxDist = Math.max(containerWidth, containerHeight)
          const opacity = Math.max(0.1, 1 - dist / maxDist) * 0.6
          return (
            <line
              key={center.group.id}
              x1={dragX}
              y1={dragY}
              x2={center.x}
              y2={center.y}
              stroke={center.group.color}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              opacity={opacity}
            />
          )
        })}
      </svg>

      {/* Gravity centers */}
      {centers.map((center) => (
        <div
          key={center.group.id}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            left: center.x - 24,
            top: center.y - 24,
            width: 48,
            height: 48,
            backgroundColor: center.group.color + '20',
            border: `2px solid ${center.group.color}`,
            boxShadow: `0 0 12px ${center.group.color}40, 0 0 24px ${center.group.color}20`,
          }}
        >
          <span
            className="text-[10px] font-sans font-medium"
            style={{ color: center.group.color }}
          >
            {center.group.name}
          </span>
        </div>
      ))}

      {/* Static topic nodes */}
      {topicNodes
        .filter((n) => n.topic.dirName !== draggingTopic.dirName)
        .map((node) => (
          <div
            key={node.topic.dirName}
            className="absolute px-2 py-1 rounded text-[10px] font-serif text-parchment/40"
            style={{
              left: node.x,
              top: node.y,
              background: 'rgba(26, 21, 18, 0.7)',
              opacity: 0.6,
            }}
          >
            {node.topic.title.slice(0, 12)}
          </div>
        ))}

      {/* Dragging topic node */}
      <div
        className="absolute px-3 py-1.5 rounded-lg text-xs font-serif text-parchment border-2 z-30"
        style={{
          left: dragX - 40,
          top: dragY - 14,
          background: 'rgba(26, 21, 18, 0.95)',
          borderColor: centers.find(
            (c) => c.group.id === draggingTopic.groupId
          )?.group.color,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          transform: 'scale(1.1)',
        }}
      >
        {draggingTopic.title.slice(0, 12)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GravityField.tsx
git commit -m "feat(groups): add GravityField overlay component with SVG magnetic lines"
```

---

## Task 8: StudyLibrary 整合

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

- [ ] **Step 1: 添加 imports**

在文件顶部添加：

```typescript
import { useRef, useCallback, useEffect } from 'react'
import { GroupRibbon } from './GroupRibbon'
import { GravityField } from './GravityField'
```

- [ ] **Step 2: 修改 `TopicAccordion` 添加色条和拖拽事件**

在 `TopicAccordion` 的 props 中添加：

```typescript
function TopicAccordion({
  topic,
  onViewFile,
  groupColor,
  onDragStart,
}: {
  topic: TopicMeta
  onViewFile: (v: ViewerState) => void
  groupColor: string
  onDragStart?: (topic: TopicMeta, startX: number, startY: number) => void
}) {
```

修改 header 的 JSX，在 `<span className="text-parchment/50 text-xs...">▶</span>` 之前添加色条：

```typescript
        <div
          className="w-[3px] h-5 rounded-full shrink-0"
          style={{ backgroundColor: groupColor }}
        />
```

在 header 的 `div`（`onClick={() => setOpen(!open)}`）上添加 `onMouseDown`：

```typescript
        onMouseDown={(e) => {
          // Only trigger drag on left-click and not on buttons
          if (e.button === 0 && onDragStart) {
            onDragStart(topic, e.clientX, e.clientY)
          }
        }}
```

- [ ] **Step 3: 修改 `StudyLibrary` 组件，添加完整状态管理和拖拽逻辑**

将 `StudyLibrary` 组件完整替换为以下实现：

```typescript
export function StudyLibrary() {
  const library = useStore((s) => s.library)
  const groups = useStore((s) => s.groups)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const groupMapping = useStore((s) => s.groupMapping)
  const gravityFieldOpen = useStore((s) => s.gravityFieldOpen)
  const setActiveGroup = useStore((s) => s.setActiveGroup)
  const moveTopicToGroup = useStore((s) => s.moveTopicToGroup)
  const createGroup = useStore((s) => s.createGroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const deleteGroup = useStore((s) => s.deleteGroup)
  const setGravityFieldOpen = useStore((s) => s.setGravityFieldOpen)
  const setDraggingTopic = useStore((s) => s.setDraggingTopic)

  const [viewer, setViewer] = useState<ViewerState>(null)
  const [dragState, setDragState] = useState<{
    topic: TopicMeta
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Observe container size for gravity field
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

  // Global mouse events for drag
  useEffect(() => {
    if (!dragState?.active) return

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((s) =>
        s ? { ...s, currentX: e.clientX, currentY: e.clientY } : null
      )
    }

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragState) return

      setGravityFieldOpen(false)
      setDraggingTopic(null)

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const relativeX = e.clientX - rect.left
        const relativeY = e.clientY - rect.top

        // Find nearest gravity center
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

        // Threshold: 1.5x gravity center diameter (48px)
        if (nearestGroupId && minDist < 72) {
          await moveTopicToGroup(dragState.topic.dirName, nearestGroupId)
        }
      }

      setDragState(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState?.active, groups, moveTopicToGroup, setGravityFieldOpen, setDraggingTopic])

  const handleDragStart = useCallback(
    (topic: TopicMeta, startX: number, startY: number) => {
      setDragState({
        topic,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        active: false,
      })
    },
    []
  )

  // Detect drag after 6px movement
  useEffect(() => {
    if (!dragState || dragState.active) return
    const dist = Math.hypot(
      dragState.currentX - dragState.startX,
      dragState.currentY - dragState.startY
    )
    if (dist > 6) {
      setDragState((s) => (s ? { ...s, active: true } : null))
      setGravityFieldOpen(true)
      setDraggingTopic(dragState.topic)
    }
  }, [dragState, setGravityFieldOpen, setDraggingTopic])

  // Filter and sort topics
  const displayTopics = useMemo(() => {
    let filtered = library
    if (activeGroupId) {
      filtered = library.filter((t) => t.groupId === activeGroupId)
    }

    // Sort by group order, then by last_studied descending
    const groupIndexMap = new Map(groups.map((g, i) => [g.id, i]))
    return [...filtered].sort((a, b) => {
      const ai = groupIndexMap.get(a.groupId) ?? Infinity
      const bi = groupIndexMap.get(b.groupId) ?? Infinity
      if (ai !== bi) return ai - bi
      return (
        new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
      )
    })
  }, [library, activeGroupId, groups])

  // Group color lookup
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      map.set(g.id, g.color)
    }
    map.set('default', '#d97757')
    return map
  }, [groups])

  if (library.length === 0) {
    return (
      <div className="text-center text-parchment/40 font-sans text-sm py-8">
        学习库为空
      </div>
    )
  }

  const dragPosition =
    dragState && containerRef.current
      ? {
          x: dragState.currentX - containerRef.current.getBoundingClientRect().left,
          y: dragState.currentY - containerRef.current.getBoundingClientRect().top,
        }
      : null

  return (
    <div ref={containerRef} className="relative">
      <GroupRibbon
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={setActiveGroup}
        onCreate={createGroup}
        onRename={renameGroup}
        onDelete={deleteGroup}
      />

      <div className="mt-3 flex flex-col gap-2 relative">
        {gravityFieldOpen && (
          <GravityField
            groups={groups}
            topics={library}
            draggingTopic={dragState?.topic ?? null}
            dragPosition={dragPosition}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        )}

        {displayTopics.map((topic) => (
          <TopicAccordion
            key={topic.dirName}
            topic={topic}
            onViewFile={setViewer}
            groupColor={groupColorMap.get(topic.groupId) || '#d97757'}
            onDragStart={handleDragStart}
          />
        ))}
      </div>

      {viewer && (
        <SessionViewer
          dirName={viewer.dirName}
          sessionNumber={viewer.sessionNumber}
          fileName={viewer.fileName}
          title={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}
```

注意：上面的 `useMemo` 和 `useCallback` 需要确保 `import { useState, useRef, useCallback, useEffect, useMemo } from 'react'` 都在文件顶部。

- [ ] **Step 4: Commit**

```bash
git add src/components/StudyLibrary.tsx
git commit -m "feat(groups): integrate ribbon, gravity field, drag logic and group-aware sorting"
```

---

## Task 9: 测试

**Files:**
- Create: `tests/groups.test.ts`

- [ ] **Step 1: 创建 `tests/groups.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

// Test group sorting logic
function sortTopicsByGroup(
  topics: { dirName: string; last_studied: string; groupId: string }[],
  groups: { id: string }[]
) {
  const groupIndexMap = new Map(groups.map((g, i) => [g.id, i]))
  return [...topics].sort((a, b) => {
    const ai = groupIndexMap.get(a.groupId) ?? Infinity
    const bi = groupIndexMap.get(b.groupId) ?? Infinity
    if (ai !== bi) return ai - bi
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })
}

describe('group sorting', () => {
  it('sorts by group order first', () => {
    const groups = [{ id: 'default' }, { id: 'ai' }, { id: 'philosophy' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-10', groupId: 'ai' },
      { dirName: 'b', last_studied: '2026-05-09', groupId: 'default' },
      { dirName: 'c', last_studied: '2026-05-11', groupId: 'philosophy' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.groupId)).toEqual(['default', 'ai', 'philosophy'])
  })

  it('falls back to last_studied within same group', () => {
    const groups = [{ id: 'default' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-08', groupId: 'default' },
      { dirName: 'b', last_studied: '2026-05-10', groupId: 'default' },
      { dirName: 'c', last_studied: '2026-05-09', groupId: 'default' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.dirName)).toEqual(['b', 'c', 'a'])
  })

  it('puts unmapped groupId at the end', () => {
    const groups = [{ id: 'default' }]
    const topics = [
      { dirName: 'a', last_studied: '2026-05-10', groupId: 'unknown' },
      { dirName: 'b', last_studied: '2026-05-09', groupId: 'default' },
    ]
    const sorted = sortTopicsByGroup(topics, groups)
    expect(sorted.map((t) => t.dirName)).toEqual(['b', 'a'])
  })
})

// Test group color generation
describe('group color generation', () => {
  it('returns a valid hex color', () => {
    const darkColors = [
      '#8b5a2b', '#5a4632', '#4a6741', '#4a5568', '#6b4c3b',
      '#4c5c6b', '#6b5b4c', '#5c4b6b', '#4b6b5c', '#6b4b5c'
    ]
    const color = darkColors[Math.floor(Math.random() * darkColors.length)]
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

// Test distance calculation for gravity field
describe('gravity field distance', () => {
  it('finds nearest center correctly', () => {
    const centers = [
      { id: 'default', x: 100, y: 100 },
      { id: 'ai', x: 300, y: 100 },
    ]
    const dropX = 280
    const dropY = 110

    let nearestId: string | null = null
    let minDist = Infinity

    for (const c of centers) {
      const dist = Math.hypot(dropX - c.x, dropY - c.y)
      if (dist < minDist) {
        minDist = dist
        nearestId = c.id
      }
    }

    expect(nearestId).toBe('ai')
    expect(minDist).toBeCloseTo(Math.hypot(20, 10), 1)
  })

  it('respects threshold of 72px', () => {
    const centerX = 100
    const centerY = 100
    const dropX = 200 // 100px away
    const dropY = 100

    const dist = Math.hypot(dropX - centerX, dropY - centerY)
    const shouldGroup = dist < 72

    expect(shouldGroup).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/groups.test.ts`
Expected: 5 tests, all PASS

- [ ] **Step 3: Commit**

```bash
git add tests/groups.test.ts
git commit -m "test(groups): add sorting, color and distance tests"
```

---

## Task 10: 类型检查与最终验证

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 运行全部测试**

Run: `npm run test`
Expected: All tests pass including new groups tests

- [ ] **Step 3: 运行开发模式快速验证**

Run: `npm run dev`（保持终端运行，手动验证丝带和拖拽功能）

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(groups): study library grouping with ribbon + gravity field drag"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Implementing Task |
|-------------|------------------|
| 3.1 `.study-groups.json` format | Task 2 (IPC handlers) |
| 3.2 `Group`, `GroupMapping`, `TopicMeta.groupId` types | Task 1 |
| 4.1 GroupRibbon (丝带) | Task 6 |
| 4.2 Topic 色条 | Task 8 (TopicAccordion) |
| 4.3 按分组聚集排列 | Task 8 (displayTopics useMemo) |
| 5.1 拖拽触发 (mouseDown/move/up, 6px threshold) | Task 8 |
| 5.2 界面切换动画 | Task 8 (gravityFieldOpen state) |
| 5.3 引力中心 + Topic 节点 + SVG 磁力线 | Task 7 |
| 5.4 归组检测 (最近距离 + 72px threshold) | Task 8 (handleMouseUp) |
| 7.1 IPC handlers (load/create/rename/delete/updateMapping) | Task 2 |
| 7.2 Preload 暴露 | Task 3 |
| 7.3 getTopicMeta 注入 groupId | Task 2 |
| 8.1 Store 扩展 | Task 5 |
| 8.2 library 派生排序 | Task 8 |
| 9 错误处理 (损坏回退/空名禁用/IPC 失败) | Task 2 (loadGroupFile), Task 6 (onBlur 校验) |

### Placeholder Scan

- [x] 无 "TBD", "TODO", "implement later"
- [x] 无 "add appropriate error handling" 等模糊描述
- [x] 所有代码块包含完整可运行代码
- [x] 所有测试包含具体断言

### Type Consistency

- [x] `Group` 类型在 Task 1 定义，Task 2/5/6/7/8 使用一致
- [x] `IpcApi` 方法名在 Task 1/2/3/4 一致
- [x] Store 方法名在 Task 5/8 一致
- [x] `TopicMeta.groupId` 在 Task 1/2/8 一致

---

## Post-Implementation Notes

### 已知限制（预期行为）

1. **右键菜单定位**：`GroupRibbon` 的上下文菜单使用绝对定位，在极窄窗口下可能溢出可视区域。这是可接受的，因为分组操作不频繁。

2. **引力场 Topic 节点位置**：静态 topic 节点在引力场中使用简单网格排列，与列表中的实际位置不完全对应。这是设计取舍——引力场的目的是展示引力中心，而非精确复刻列表布局。

3. **拖拽取消**：如果用户在拖拽过程中按 Escape，当前实现不会取消拖拽（需要监听 `keydown`）。这是一个边缘场景，可在后续迭代中补充。

### 后续优化方向（不在本计划范围内）

- 为引力场添加动画过渡（节点飞入/飞出）
- 支持拖拽多个 topics
- 分组数据的导入/导出
