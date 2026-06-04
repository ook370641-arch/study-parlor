# 卷宗页视觉重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Profile（卷宗）页从纯棕色背景升级为共用主页艺术配图背景，并用新的顶部覆盖式面板布局替代当前居中窄面板。

**Architecture:** 在 `Profile.tsx` 中复用现有的 `SurfaceBackground`（surface="home"）和 `SwapPaintingButton` 组件，无需新增 store 状态。读取态和编辑态共用同一套背景层，仅内容面板布局不同。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/Profile.tsx` | Modify | 唯一改动文件。添加背景层组件，重构读取态和编辑态布局 |

---

## Task 1: 重构 Profile.tsx 读取态布局

**Files:**
- Modify: `src/pages/Profile.tsx`

- [ ] **Step 1: 添加背景层组件导入**

  在 `src/pages/Profile.tsx` 顶部添加两个导入：

  ```typescript
  import { SurfaceBackground } from '@/components/SurfaceBackground'
  import { SwapPaintingButton } from '@/components/SwapPaintingButton'
  ```

- [ ] **Step 2: 重构读取态为新的顶部覆盖式面板**

  将读取态（`if (!editing)` 分支）的返回 JSX 替换为：

  ```tsx
  if (!editing) {
    return (
      <div className="fixed inset-0">
        <SurfaceBackground surface="home" />
        <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

        <div className="absolute top-10 left-6 right-6 z-10">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl p-6">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate/25">
              <h2 className="text-2xl font-serif font-semibold">你</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                退出
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-7 gap-y-3.5">
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">代号</div>
                <div className="text-xl font-semibold text-ember">{profile.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">领域</div>
                <div className="text-sm text-parchment">{profile.preferred_topics.join(' · ') || '未填'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">侧写</div>
                <div className="text-sm text-parchment leading-relaxed">{profile.profile_text || '未填'}</div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">审讯强度</div>
                <div className="text-sm text-parchment">
                  {lastUsed.difficulty === 'high' ? '追至墙角' : lastUsed.difficulty === 'mid' ? '互相试探' : '先暖暖场'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">腔调</div>
                <div className="text-sm text-parchment">{getTemperatureLabel(lastUsed.temperature)}</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-5">
            <Button onClick={() => setEditing(true)}>改写</Button>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: 运行构建检查语法**

  Run: `npm run build`
  Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/Profile.tsx
  git commit -m "feat(profile): redesign read view with art background and overlay panel"
  ```

---

## Task 2: 重构 Profile.tsx 编辑态布局

**Files:**
- Modify: `src/pages/Profile.tsx`

- [ ] **Step 1: 重构编辑态为新的覆盖式面板**

  将编辑态（`return (` 在 `if (!editing)` 之后）的整个返回 JSX 替换为：

  ```tsx
  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10 flex flex-col">
        <div className="bg-ink/78 backdrop-blur-md border border-slate/30 rounded-xl p-5 flex flex-col gap-3 overflow-y-auto flex-1">
          <h2 className="text-xl font-serif font-semibold pb-2 mb-1 border-b border-slate/20">改写</h2>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">代号</div>
            <Input value={name} onChange={e => setName(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">你是谁</div>
            <textarea
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full bg-ink/50 border border-slate/40 rounded-md p-3 text-parchment focus:outline-none focus:border-ember/60 font-serif resize-y min-h-[80px]"
            />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">领域</div>
            <Input value={topics} onChange={e => setTopics(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">审讯强度</div>
            <div className="flex gap-2 flex-wrap">
              {(['high', 'mid', 'low'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    difficulty === d
                      ? 'bg-ember text-ink border-ember'
                      : 'bg-transparent text-parchment/70 border-slate/40 hover:border-slate/60'
                  }`}
                >
                  {d === 'high' ? '追至墙角' : d === 'mid' ? '互相试探' : '先暖暖场'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">腔调</div>
            <div className="flex gap-2 flex-wrap">
              {[0.3, 0.7, 1.0].map(t => (
                <button
                  key={t}
                  onClick={() => setTemperature(t)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    temperature === t
                      ? 'bg-ember text-ink border-ember'
                      : 'bg-transparent text-parchment/70 border-slate/40 hover:border-slate/60'
                  }`}
                >
                  {getTemperatureLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 mt-auto">
            <Button onClick={onSave}>落印</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>作废</Button>
          </div>
        </div>
      </div>
    </div>
  )
  ```

- [ ] **Step 2: 运行构建检查语法**

  Run: `npm run build`
  Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 3: 运行测试套件**

  Run: `npm run test`
  Expected: 所有测试通过（无 Profile 专属测试，主要是确保无回归）

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/Profile.tsx
  git commit -m "feat(profile): redesign edit view with art background and overlay panel"
  ```

---

## Self-Review

**1. Spec coverage:**
- ✅ 共用主页艺术配图背景 → Task 1 Step 2, Task 2 Step 1（`SurfaceBackground surface="home"`）
- ✅ 刷新配图按钮 → Task 1 Step 2, Task 2 Step 1（`SwapPaintingButton surface="home"`）
- ✅ 读取态顶部覆盖式面板 → Task 1 Step 2（`bg-ink/72 backdrop-blur-md` 面板，grid 双列布局）
- ✅ 编辑态撑满式面板 → Task 2 Step 1（`top-10 left-6 right-6 bottom-5`，内容可滚动）
- ✅ 代号 ember 色突出 → Task 1 Step 2（`text-ember`）
- ✅ 标签样式 → Task 1 Step 2（`text-[10px] uppercase tracking-wider`）

**2. Placeholder scan:**
- 无 "TBD", "TODO", "implement later"
- 所有代码块包含完整代码
- 所有命令包含预期输出

**3. Type consistency:**
- `SurfaceBackground` 和 `SwapPaintingButton` 的 `surface` prop 统一为 `"home"`
- 使用现有的 `Button` 和 `Input` 组件，与现有代码一致
- 所有 hook 调用（`useState`, `useStore`）位置不变
