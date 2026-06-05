# Extension Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Extension" page to Study Parlor with three guide cards (library, agent integration, custom paintings) and copy global learner/research skills into the project as study/fable.

**Architecture:** Extend the existing page-state routing (`currentPage`) with a new `'extension'` value. Add a single IPC method to expose the library path and painting count from main to renderer. The Extension page is a pure display component following the same visual pattern as Profile.

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/store/index.ts` | Modify | Extend `Page` type to include `'extension'` |
| `src/types/index.ts` | Modify | Add `getExtensionInfo` to `IpcApi` type |
| `src/lib/ipc.ts` | Modify | Add facade getter for `getExtensionInfo` |
| `electron/preload.ts` | Modify | Bridge `getExtensionInfo` to renderer |
| `electron/ipc/files.ts` | Modify | Implement `getExtensionInfo` handler |
| `src/pages/Extension.tsx` | Create | Extension page component with three cards |
| `src/App.tsx` | Modify | Import and render Extension page |
| `src/pages/Home.tsx` | Modify | Add "扩展" button to top nav bar |
| `.claude/skills/study/SKILL.md` | Create | Copied from global learner, renamed |
| `.claude/skills/fable/SKILL.md` | Create | Copied from global research, renamed |

---

### Task 1: Extend Page Type in Store

**Files:**
- Modify: `src/store/index.ts:12`

- [ ] **Step 1: Change the `Page` type**

```ts
// Line 12 — change from:
type Page = 'cover' | 'home' | 'study' | 'profile'
// To:
type Page = 'cover' | 'home' | 'study' | 'profile' | 'extension'
```

- [ ] **Step 2: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add 'extension' to Page type"
```

---

### Task 2: Add IPC Method for Extension Info

**Files:**
- Modify: `src/types/index.ts` (IpcApi type)
- Modify: `src/lib/ipc.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/files.ts`

- [ ] **Step 1: Add type to `IpcApi`**

In `src/types/index.ts`, inside the `IpcApi` type (before the closing `}`), add:

```ts
  getExtensionInfo: () => Promise<{ libraryPath: string; paintingCount: number }>
```

- [ ] **Step 2: Add facade in renderer IPC**

In `src/lib/ipc.ts`, after `get bootFatal()` (line 44), add:

```ts
  get getExtensionInfo() { return ensure().getExtensionInfo },
```

- [ ] **Step 3: Add bridge in preload**

In `electron/preload.ts`, after `bootFatal` line (before line 54), add:

```ts
  getExtensionInfo: () => ipcRenderer.invoke('files:getExtensionInfo'),
```

- [ ] **Step 4: Add handler in files IPC**

In `electron/ipc/files.ts`, inside `registerFilesIpc(cfg)` — add after the last `ipcMain.handle` call and before the closing `}` of the function (after line 537, before line 538):

```ts
  ipcMain.handle('files:getExtensionInfo', async () => {
    const picturesDir = path.join(process.cwd(), 'Pictures')
    const indexPath = path.join(picturesDir, 'index.json')
    let paintingCount = 0
    try {
      const raw = fs.readFileSync(indexPath, 'utf8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) paintingCount = arr.length
    } catch {
      // Pictures/index.json may not exist; default to 0
    }
    return {
      libraryPath: cfg.libraryPath,
      paintingCount
    }
  })
```

- [ ] **Step 5: Run tests to verify no type errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/ipc.ts electron/preload.ts electron/ipc/files.ts
git commit -m "feat(ipc): add getExtensionInfo for library path and painting count"
```

---

### Task 3: Create Extension Page Component

**Files:**
- Create: `src/pages/Extension.tsx`

- [ ] **Step 1: Write the Extension page**

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ipc } from '@/lib/ipc'

export function Extension() {
  const goto = useStore(s => s.goto)
  const [info, setInfo] = useState<{ libraryPath: string; paintingCount: number } | null>(null)

  useEffect(() => {
    ipc.getExtensionInfo().then(setInfo).catch(() => setInfo({ libraryPath: '未知', paintingCount: 0 }))
  }, [])

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-36 z-10" />

      <div className="absolute top-10 left-6 right-6 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl p-6">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate/25">
              <h2 className="text-2xl font-serif font-semibold">扩展</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
            </div>

            {/* Card 1: Library */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>📁</span> 学习库
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <div className="flex items-center gap-2">
                  <span>根目录：</span>
                  <code className="bg-ink px-2 py-0.5 rounded text-xs text-parchment/60">
                    {info?.libraryPath ?? '加载中...'}
                  </code>
                </div>
                <div className="bg-ink/40 border-l-2 border-ember/50 pl-3 py-2 text-xs text-parchment/50">
                  📌 扩展原理：所有学习内容统一保存到这里。<br />
                  学习报告（study）、复习记录、寓言故事（fable）、流程图 —— 全部写入本目录，应用自动扫描显示。
                </div>
              </div>
            </div>

            {/* Card 2: Agent Integration */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>⚡</span> 本地 Agent 打通
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <p>已安装 skill：<code className="bg-ink px-1 rounded text-xs">study</code>、<code className="bg-ink px-1 rounded text-xs">fable</code></p>
                <p className="text-xs text-parchment/50">使用步骤：</p>
                <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
                  <li>把项目 <code className="bg-ink px-1 rounded">.claude/skills/</code> 下的 <code className="bg-ink px-1 rounded">study/</code> 和 <code className="bg-ink px-1 rounded">fable/</code> 复制到你的 Claude Code skills 目录</li>
                  <li>在 agent 聊天里用 <code className="bg-ink px-1 rounded">/study</code> 或 <code className="bg-ink px-1 rounded">/fable</code> 触发</li>
                </ol>
                <div className="bg-ink/40 border-l-2 border-green-600/50 pl-3 py-2 text-xs text-parchment/50">
                  🔑 skill 会自动读取应用配置的学习库路径<br />
                  你不需要手动修改 skill 里的路径。skill 运行时会自动从项目 <code className="bg-ink px-1 rounded">.env</code> 中读取 <code className="bg-ink px-1 rounded">STUDY_LIBRARY_PATH</code> 的值作为报告保存目录。若读取失败，skill 会提示你手动配置。
                </div>
              </div>
            </div>

            {/* Card 3: Custom Paintings */}
            <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4">
              <h3 className="text-ember font-semibold mb-2 flex items-center gap-2">
                <span>🖼️</span> 自选配图
              </h3>
              <div className="text-sm text-parchment/70 space-y-2">
                <p>支持手动增删配图，当前共 {info?.paintingCount ?? 0} 张。</p>

                <p className="text-xs text-parchment/50 mt-3">添加步骤：</p>
                <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
                  <li>把图片文件（.jpg / .png）放入项目根目录的 <code className="bg-ink px-1 rounded">Pictures/</code> 文件夹</li>
                  <li>编辑 <code className="bg-ink px-1 rounded">Pictures/index.json</code>，在数组末尾追加一个 JSON 对象</li>
                  <li>保存文件，重启应用生效</li>
                </ol>

                <div className="bg-ink/40 rounded-md p-3 mt-2 font-mono text-[11px] text-parchment/50 leading-relaxed">
{`{
  "id": "custom-1",
  "painter": "你的名字",
  "title": "作品名",
  "file": "文件名.jpg",
  "category": "custom",
  "year": 2026
}`}
                </div>

                <table className="w-full text-[11px] mt-2 border-collapse">
                  <thead>
                    <tr className="text-ember border-b border-slate/20">
                      <th className="text-left py-1">字段</th>
                      <th className="text-left py-1">必填</th>
                      <th className="text-left py-1">说明</th>
                    </tr>
                  </thead>
                  <tbody className="text-parchment/50">
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">id</code></td>
                      <td className="text-ember">✓</td>
                      <td>唯一标识，任意字符串</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">file</code></td>
                      <td className="text-ember">✓</td>
                      <td>图片文件名，必须和 Pictures/ 下的实际文件一致</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">title</code></td>
                      <td className="text-ember">✓</td>
                      <td>作品名，在应用中显示</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">painter</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>作者名，显示在画面左下角。可写任意值</td>
                    </tr>
                    <tr className="border-b border-slate/10">
                      <td className="py-1"><code className="bg-ink px-1 rounded">category</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>分类标签，仅用于筛选。可写 custom 或其他任意值</td>
                    </tr>
                    <tr>
                      <td className="py-1"><code className="bg-ink px-1 rounded">year</code></td>
                      <td className="text-parchment/30">—</td>
                      <td>年份，填 null 或任意数字均可</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-[11px] text-parchment/40 italic mt-2">
                  删除配图：从 Pictures/ 移除图片文件，同时从 index.json 删除对应条目，重启生效。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Extension.tsx
git commit -m "feat(page): add Extension page with three guide cards"
```

---

### Task 4: Register Extension in App Router

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import Extension component**

Add after line 6:

```tsx
import { Extension } from '@/pages/Extension'
```

- [ ] **Step 2: Add rendering condition**

Change lines 142-146 from:

```tsx
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
```

To:

```tsx
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
          {page === 'extension' && <Extension />}
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): register Extension page in router"
```

---

### Task 5: Add Navigation Entry to Home

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Adjust button layout**

Current layout (lines 66-71):
```tsx
      <SwapPaintingButton surface="home" className="absolute top-4 right-20" />
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        卷宗
      </Button>
```

Change to (left-to-right: 换画 | 卷宗 | 扩展):

```tsx
      <SwapPaintingButton surface="home" className="absolute top-4 right-36 z-10" />
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-20 font-sans text-sm z-10">
        卷宗
      </Button>
      <Button variant="ghost"
        onClick={() => goto('extension')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        扩展
      </Button>
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): add Extension navigation button"
```

---

### Task 6: Create study Skill

**Files:**
- Create: `.claude/skills/study/SKILL.md`

- [ ] **Step 1: Copy and modify global learner skill**

Copy content from `C:/Users/86468/.claude/skills/learner/SKILL.md` and make these changes:

1. Change `name: learner` → `name: study`
2. Change description trigger words: remove `learner`、`想学`、`教我`、`怎么学`、`苏格拉底`、`私教`、`掌握学习`、`一对一辅导`， replace with `study`
3. Change title from `# /learner — 苏格拉底式私教` to `# /study — 苏格拉底式私教`
4. Replace all hardcoded paths `C:/Users/86468/Desktop/工作与学习/学习库/` with a dynamic read mechanism
5. Add a section at the top of the skill (after frontmatter) for reading `.env`

The dynamic path read mechanism to insert after the frontmatter:

```markdown
## 环境配置读取

每次触发 `/study` 时，首先尝试自动读取学习库路径：

1. 查找当前工作目录下（或上级目录）的 `.env` 文件
2. 提取 `STUDY_LIBRARY_PATH` 的值
3. 如果成功，使用该值作为学习库根目录
4. 如果失败（文件不存在或字段缺失），提示用户：
   > "未能自动读取学习库路径。请在 SKILL.md 中将 `YOUR_LIBRARY_PATH` 替换为你的实际路径。"

**手动配置备用**：如果自动读取失败，在 SKILL.md 的"保存配置"部分将 `YOUR_LIBRARY_PATH` 替换为你的实际学习库目录路径。
```

Then in the "保存配置" section, replace:
- **学习库根目录**：`C:/Users/86468/Desktop/工作与学习/学习库/`

With:
- **学习库根目录**：`YOUR_LIBRARY_PATH`（自动从 `.env` 读取，失败则手动替换）

And replace all other occurrences of the hardcoded path in the file with `YOUR_LIBRARY_PATH` (or a placeholder that makes it clear it should be replaced).

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/study/SKILL.md
git commit -m "feat(skill): add study skill (renamed from learner)"
```

---

### Task 7: Create fable Skill

**Files:**
- Create: `.claude/skills/fable/SKILL.md`

- [ ] **Step 1: Copy and modify global research skill**

Copy content from `C:/Users/86468/.claude/skills/research/SKILL.md` and make these changes:

1. Change `name: research` → `name: fable`
2. Change description trigger words: remove `research`、`寓言`、`讲个故事`、`用故事讲`、`间接讲授`、`概念讲解`， replace with `fable`
3. Change title from `# /research — 寓言式概念讲授` to `# /fable — 寓言式概念讲授`
4. Replace all hardcoded paths `C:/Users/86468/Desktop/工作与学习/学习/` with a dynamic read mechanism
5. Add the same "环境配置读取" section as in Task 6 (after the frontmatter)

In the "保存配置" section, replace:
- **保存目录**：`C:/Users/86468/Desktop/工作与学习/学习/`

With:
- **保存目录**：`YOUR_LIBRARY_PATH/学习/`（自动从 `.env` 读取，失败则手动替换）

And replace all other occurrences of the hardcoded path in the file with `YOUR_LIBRARY_PATH/学习/` (or a placeholder).

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fable/SKILL.md
git commit -m "feat(skill): add fable skill (renamed from research)"
```

---

### Task 8: Verify with Type Check and Tests

**Files:**
- All modified files

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run existing tests**

```bash
npm run test
```

Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Start dev server and verify**

```bash
npm run dev
```

Verify checklist:
- [ ] Home page shows "扩展" button in top-right
- [ ] Clicking "扩展" navigates to Extension page
- [ ] Extension page shows library path correctly
- [ ] Extension page shows painting count (or 0 if no Pictures/index.json)
- [ ] "返回夜话" button works
- [ ] "换画" button works on Extension page
- [ ] TypeScript compiles without errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(extension): complete Extension page with study/fable skills"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| 新增 `'extension'` 页面 | Task 3, 4 |
| 扩展 `currentPage` 类型 | Task 1 |
| Home 增加"扩展"入口 | Task 5 |
| 学习库路径展示 | Task 2, 3 |
| 学习库原理说明 | Task 3 |
| study/fable skill 安装说明 | Task 3 |
| skill 自动读取 `.env` 路径 | Task 6, 7 |
| 配图数量统计 | Task 2, 3 |
| 配图添加步骤 | Task 3 |
| 配图字段说明（最小要求） | Task 3 |
| 创建 `.claude/skills/study/` | Task 6 |
| 创建 `.claude/skills/fable/` | Task 7 |

## Placeholder Scan

No TBD, TODO, or incomplete sections found in this plan.

## Type Consistency Check

- `Page` type: `'cover' | 'home' | 'study' | 'profile' | 'extension'` (Task 1)
- `goto` signature: `(p: Page) => void` — automatically compatible with new page
- `IpcApi.getExtensionInfo`: `() => Promise<{ libraryPath: string; paintingCount: number }>` (Task 2)
- All IPC layers (type → facade → preload → handler) use matching signatures
