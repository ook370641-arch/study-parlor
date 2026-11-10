---
status: planned
---

# Settings Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把常规设置、卷宗与扩展整合为已确认的 C 三栏设置中心，移除烛光随行，并让同一份卷宗进入所有 Kimi 对话生成请求。

**Architecture:** `Settings.tsx` 只保留三栏导航外壳，现有设置、卷宗和扩展功能分别迁入 `src/components/settings/`。卷宗在 `buildChatBody` 统一注入，流式与非流式请求共享同一实现，旧的功能级画像注入随之删除。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Zustand、Electron IPC、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-11-settings-center-and-notepad-claims-design.md`

## Global Constraints

- 一级分类固定为「常规 / 卷宗 / 扩展」；常规子页固定为「AI 与搜索 / 界面与画作 / 学习库与归档」。
- 原扩展页「学习库」说明并入「学习库与归档」，其他既有能力不得遗漏。
- 保留现有控件 testid、保存行为、主题与 `settingsReturnTo`；不新增设置持久化或未保存确认。
- 不处理记事板第 1–3 项，不新增依赖，不改主工作区，不主动合并。
- 未经用户明确确认，不启动第二个应用实例，不运行会启动 Electron 的 E2E；不跑全量 E2E。
- 每个行为改动先写失败测试，确认失败原因后再写实现。

---

### Task 1: C 三栏设置中心与功能迁移

**Files:**
- Modify: `src/pages/Settings.tsx`
- Create: `src/components/settings/GeneralSettings.tsx`
- Create: `src/components/settings/ProfileSettings.tsx`
- Create: `src/components/settings/ExtensionSettings.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/App.tsx`
- Modify: `src/store/index.ts`
- Delete: `src/pages/Profile.tsx`
- Delete: `src/pages/Extension.tsx`
- Test: `tests/settings.test.tsx`
- Test: `tests/profile-theme.test.tsx`
- Test: `tests/extension.test.tsx`
- Test: `e2e/pages/SettingsPage.ts`
- Test: `e2e/pages/ProfilePage.ts`
- Test: `e2e/pages/ExtensionPage.ts`
- Test: `e2e/helpers/selectors.ts`

**Interfaces:**
- Consumes: 现有 `useStore`、`ipc`、`LlmConfigCard`、`TerminologyPanel` 和各设置 IPC，不改变其签名。
- Produces: `GeneralSettings({ section, isAcademic, showToast, onError })`、`ProfileSettings()`、`ExtensionSettings()`；设置导航 testid 为 `settings-primary-<id>`、`settings-general-<id>`、`settings-extension-<id>`。

- [ ] **Step 1: 先改组件测试，要求三栏和分类存在**

在 `tests/settings.test.tsx` 保留现有 AI 测试，并增加：

```tsx
it('按 C 三栏拆分常规、卷宗和扩展', async () => {
  useStore.setState({ archivedTopics: ['old-topic'] })
  render(<Settings />)
  await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
  expect(screen.getByTestId('settings-layout')).toHaveClass('grid')
  expect(screen.getByTestId('settings-primary-general')).toBeInTheDocument()
  expect(screen.getByTestId('settings-primary-profile')).toBeInTheDocument()
  expect(screen.getByTestId('settings-primary-extension')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('settings-general-appearance'))
  expect(screen.getByTestId('settings-painting-delete-toggle')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('sk-kimi-test')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('settings-general-library'))
  expect(screen.getByTestId('settings-library-path-input')).toBeInTheDocument()
  expect(screen.getByTestId('settings-archived-topics')).toBeInTheDocument()
})
```

在 `tests/profile-theme.test.tsx` 和 `tests/extension.test.tsx` 改为渲染 `<Settings />`，分别先点 `settings-primary-profile` / `settings-primary-extension`。新增断言：卷宗显示「供所有 AI 生成参考」；扩展点 `settings-extension-agent` 后显示原 Agent 卡片，点 `settings-extension-terminology` 后显示术语气面板。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/settings.test.tsx tests/profile-theme.test.tsx tests/extension.test.tsx`

Expected: FAIL，找不到 `settings-layout`、`settings-primary-*` 或子页 testid；不是 IPC mock 拼写错误。

- [ ] **Step 3: 实现三栏外壳和常规子页**

`Settings.tsx` 使用以下本地状态与映射，不引入全局设置状态：

```tsx
type Primary = 'general' | 'profile' | 'extension'
type GeneralSection = 'ai' | 'appearance' | 'library'
type ExtensionSection = 'terminology' | 'paintings' | 'agent'

const [primary, setPrimary] = useState<Primary>('general')
const [generalSection, setGeneralSection] = useState<GeneralSection>('ai')
const [extensionSection, setExtensionSection] = useState<ExtensionSection>('terminology')
```

三栏容器使用 `data-testid="settings-layout"` 和 `grid grid-cols-[150px_220px_minmax(0,1fr)]`，全屏内容容器改为 `max-w-7xl`。右栏按 `primary` 渲染三个设置组件；中栏只在对应一级分类下显示其子导航，卷宗中栏显示全局用途说明。

`GeneralSettings.tsx` 明确按以下规则拆分现有 JSX：

```tsx
export function GeneralSettings({ section, isAcademic, showToast, onError }: {
  section: 'ai' | 'appearance' | 'library'
  isAcademic: boolean
  showToast: (message: string) => void
  onError: (message: string | null) => void
}) {
  if (section === 'ai') return <AiAndSearchSettings isAcademic={isAcademic} showToast={showToast} onError={onError} />
  if (section === 'appearance') return <AppearanceSettings isAcademic={isAcademic} />
  return <LibrarySettings isAcademic={isAcademic} showToast={showToast} onError={onError} />
}
```

三个私有组件分别搬动 Task 文件表所列现有卡片；`AiAndSearchSettings` 同时包含 `LlmConfigCard` 和 Tavily，`LibrarySettings` 同时包含路径、原扩展目录说明和归档恢复。不要复制 IPC 逻辑。

- [ ] **Step 4: 迁入卷宗与扩展并移除独立路由**

`ProfileSettings.tsx` 保留 Profile 的查看/编辑状态和全部输入 testid；`ExtensionSettings.tsx` 保留 Extension 的信息加载和三个子页，删除其整页背景、返回按钮及学习库 tab。卷宗卡片加入：

```tsx
<p data-testid="settings-profile-global-note">卷宗将供应用内所有 AI 生成参考。</p>
```

从 `App.tsx` 删除 Profile/Extension 懒加载和分支，从 store 的 `Page` 联合类型删除 `'profile' | 'extension'`。`Home.tsx` 删除 `home-profile-button` 与 `home-extension-button`，保留 `home-settings-button`。更新 E2E Page Object：Profile/Extension 的 `goto()` 都先进入设置，再点对应一级 tab；`SettingsPage` 在访问学习库控件前先点 `settings-general-library`。

- [ ] **Step 5: 运行迁移测试并确认 GREEN**

Run: `npx vitest run tests/settings.test.tsx tests/profile-theme.test.tsx tests/extension.test.tsx`

Expected: PASS；现有 AI 配置、错误显示、主题、卷宗编辑和扩展主题测试均保持通过。

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Home.tsx src/App.tsx src/store/index.ts src/components/settings tests e2e/pages e2e/helpers/selectors.ts
git commit -m "feat: unify preferences in three-column settings"
```

### Task 2: 移除烛光随行并替换为设置入口

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/store/index.ts`
- Modify: `src/types/index.ts`
- Modify: `src/styles/globals.css`
- Modify: `.claude/rules/ui-styling.md`
- Delete: `src/components/briefing/CandlelightLayer.tsx`
- Delete: `tests/candlelight-layer.test.tsx`
- Test: `tests/briefing-sidebar.test.tsx`

**Interfaces:**
- Consumes: Task 1 保留的 `goto('settings')` 和 `settingsReturnTo`。
- Produces: `briefing-settings-button`；不再产生 `candlelightEnabled` 或 `toggleCandlelight`。

- [ ] **Step 1: 将旧烛光测试改成设置入口失败测试**

在 `tests/briefing-sidebar.test.tsx` 替换最后两个烛光用例：

```tsx
it('在原烛光位置提供设置入口并返回简报', () => {
  render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
  const cluster = screen.getByTestId('briefing-rail-controls')
  expect(within(cluster).queryByTestId('briefing-candlelight-toggle')).not.toBeInTheDocument()
  fireEvent.click(within(cluster).getByTestId('briefing-settings-button'))
  expect(useStore.getState().currentPage).toBe('settings')
  expect(useStore.getState().settingsReturnTo).toBe('briefing')
})

it('报纸主题也保留设置入口', () => {
  render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="newspaper" />)
  expect(screen.getByTestId('briefing-settings-button')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`

Expected: FAIL，当前仍存在烛光开关且没有 `briefing-settings-button`。

- [ ] **Step 3: 用设置按钮替换烛光开关**

按钮放在 rail 原烛光位置，两种主题都显示，沿用现有圆形按钮类：

```tsx
<button type="button" data-testid="briefing-settings-button" aria-label="设置"
  onClick={() => goto('settings')}
  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50'}`}
  title="设置">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9 1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
</button>
```

删除 Briefing 的光层挂载和组件文件；删除 store/types 中烛光字段与 action，删除 globals 的 `.candle-glow`、`.cursor-hidden`、烛光标注辉光 CSS，删除对应测试，并从当前 UI 规则移除 CandlelightLayer 登记。

- [ ] **Step 4: 检查残留并运行测试**

Run: `rg -n "CandlelightLayer|candlelightEnabled|toggleCandlelight|briefing-candlelight" src tests .claude/rules`

Expected: 无结果。随后运行 `npx vitest run tests/briefing-sidebar.test.tsx`，预期 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx src/pages/Briefing.tsx src/store/index.ts src/types/index.ts src/styles/globals.css .claude/rules/ui-styling.md tests/briefing-sidebar.test.tsx tests/candlelight-layer.test.tsx src/components/briefing/CandlelightLayer.tsx
git commit -m "feat: replace candlelight with settings entry"
```

### Task 3: 在所有 Kimi 对话请求中统一注入卷宗

**Files:**
- Create: `electron/lib/profile-prompt.ts`
- Modify: `electron/lib/kimi.ts`
- Modify: `electron/lib/prompts.ts`
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/ipc/llm.ts`
- Modify: `electron/prompts/wild-card-v1.md`
- Modify: `src/types/index.ts`
- Modify: `src/lib/session-runtime.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/GroupRecCard.tsx`
- Test: `tests/profile-prompt.test.ts`
- Test: `tests/kimi.test.ts`
- Test: `tests/prompts.test.ts`
- Test: `tests/wild-card-prompt.test.ts`
- Test: `tests/llm-tasks.test.ts`

**Interfaces:**
- Consumes: `loadProfile(cfg.libraryPath): Profile` 和现有 `Message[]`。
- Produces: `withProfilePrompt(messages: Message[], profile: Profile): Message[]`；`buildChatBody` 自动追加非空卷宗。

- [ ] **Step 1: 写统一注入纯函数失败测试**

Create `tests/profile-prompt.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { withProfilePrompt } from '@electron/lib/profile-prompt'
import type { Message, Profile } from '@shared/index'

const profile: Profile = { name: '夜读者', profile_text: '偏直觉理解', preferred_topics: ['心理', '数学'] }
const user: Message = { role: 'user', content: '生成导读' }

describe('withProfilePrompt', () => {
  it('没有 system 时前置卷宗且保持用户消息顺序', () => {
    const result = withProfilePrompt([user], profile)
    expect(result[0]).toEqual({ role: 'system', content: expect.stringContaining('夜读者') })
    expect(result[0].content).toContain('偏直觉理解')
    expect(result[0].content).toContain('心理 / 数学')
    expect(result[1]).toBe(user)
  })

  it('已有 system 时追加且不复制消息', () => {
    const system: Message = { role: 'system', content: '你是写作助手' }
    const result = withProfilePrompt([system, user], profile)
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('你是写作助手\n\n---\n\n# 学习者卷宗\n姓名:夜读者\n画像:偏直觉理解\n偏好领域:心理 / 数学')
    expect(system.content).toBe('你是写作助手')
  })

  it('空画像原样返回', () => {
    const messages = [user]
    expect(withProfilePrompt(messages, { name: '', profile_text: '', preferred_topics: [] })).toBe(messages)
  })
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/profile-prompt.test.ts`

Expected: FAIL，模块 `@electron/lib/profile-prompt` 不存在。

- [ ] **Step 3: 实现纯函数并接入 buildChatBody**

Create `electron/lib/profile-prompt.ts`：

```ts
import type { Message, Profile } from '@shared/index'

export function withProfilePrompt(messages: Message[], profile: Profile): Message[] {
  const fields = [
    profile.name.trim() && `姓名:${profile.name.trim()}`,
    profile.profile_text.trim() && `画像:${profile.profile_text.trim()}`,
    profile.preferred_topics.length > 0 && `偏好领域:${profile.preferred_topics.join(' / ')}`,
  ].filter((field): field is string => Boolean(field))
  if (fields.length === 0) return messages
  const block = `# 学习者卷宗\n${fields.join('\n')}`
  const systemIndex = messages.findIndex(message => message.role === 'system')
  if (systemIndex < 0) return [{ role: 'system', content: block }, ...messages]
  return messages.map((message, index) => index === systemIndex
    ? { ...message, content: `${message.content}\n\n---\n\n${block}` }
    : message)
}
```

在 `kimi.ts` 引入 `loadProfile` 和该函数，只在 `buildChatBody` 设置一次：

```ts
messages: withProfilePrompt(args.messages, loadProfile(cfg.libraryPath)),
```

在 `tests/kimi.test.ts` 使用临时学习库写入 `profile.json`，断言 `buildChatBody` 的非流式、流式 body 都包含相同卷宗；空目录不增加 system 消息。

- [ ] **Step 4: 删除旧的功能级画像注入**

从 `assemblePrompt` 删除 `profile` 参数和 `formatProfile`，从 wild-card 模板删除「学习者信息」与 `{{profile_text}}`。删除 `generateWildcardInspiration` / `generateGroupInspiration` 的 `profile` 参数和替换调用；分组模板本来没有画像占位，不修改其正文。

同步删除 `IpcApi.llmStart`、`llmGroupInspiration`、`llmWildcardInspiration` 以及 `electron/ipc/llm.ts` 对应参数，并清理 `session-runtime.ts`、`store/index.ts`、`GroupRecCard.tsx` 的传参。删除 `refreshWildcardInspiration` 中不再使用的 `profile` 解构和 `GroupRecCard` 中不再使用的 profile selector。更新 `prompts.test.ts` 不再期待末尾画像，更新 `wild-card-prompt.test.ts` 断言画像占位不存在，保留其他 prompt 行为断言。

- [ ] **Step 5: 运行提示词与 Kimi 定向测试**

Run: `npx vitest run tests/profile-prompt.test.ts tests/kimi.test.ts tests/prompts.test.ts tests/wild-card-prompt.test.ts tests/llm-tasks.test.ts`

Expected: PASS；旧学习与推荐 prompt 中不再重复携带卷宗，两个请求方向都由 `buildChatBody` 注入。

- [ ] **Step 6: Commit**

```bash
git add electron/lib/profile-prompt.ts electron/lib/kimi.ts electron/lib/prompts.ts electron/lib/llm-tasks.ts electron/ipc/llm.ts electron/prompts/wild-card-v1.md src/types/index.ts src/lib/session-runtime.ts src/store/index.ts src/components/GroupRecCard.tsx tests/profile-prompt.test.ts tests/kimi.test.ts tests/prompts.test.ts tests/wild-card-prompt.test.ts tests/llm-tasks.test.ts
git commit -m "feat: apply learner profile to all ai requests"
```

### Task 4: 设置中心文档、E2E 映射与交付验证

**Files:**
- Modify: `e2e/source-map.json`
- Modify: `e2e/specs/settings.spec.ts`
- Modify: `e2e/specs/profile.spec.ts`
- Modify: `e2e/specs/extension-page.spec.ts`
- Modify: `e2e/specs/home.spec.ts`
- Modify: `e2e/specs/lighting.spec.ts`
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-11-settings-center-and-notepad-claims-design.md`
- Modify: `docs/superpowers/plans/2026-11-11-settings-center.md`

**Interfaces:**
- Consumes: Tasks 1–3 的最终导航、入口和统一请求注入。
- Produces: 可执行的定向 E2E 映射、当前文档和可复现验证结果。

- [ ] **Step 1: 更新 source map 与 E2E 操作路径**

把 `src/components/settings/ProfileSettings.tsx`、`ExtensionSettings.tsx` 加到 `cover-home.sources`，从该组删除旧页面路径；把 `electron/lib/profile-prompt.ts` 加到 `study.sources`。移除 `lighting.spec.ts` 中烛光断言，改为简报设置入口断言；Profile/Extension spec 通过设置中心进入，学习库测试先进入「学习库与归档」。不新建 spec，因此无孤儿 spec。

- [ ] **Step 2: 运行静态与单元验证**

Run:

```bash
node scripts/e2e-changed.js
npx vitest run tests/settings.test.tsx tests/profile-theme.test.tsx tests/extension.test.tsx tests/briefing-sidebar.test.tsx tests/profile-prompt.test.ts tests/kimi.test.ts tests/prompts.test.ts tests/wild-card-prompt.test.ts tests/llm-tasks.test.ts
npm run build
```

Expected: 映射无 orphan WARNING；Vitest 全部 PASS；`npm run build` 内双 tsconfig 与 electron-vite build 成功。

- [ ] **Step 3: 经用户明确确认后运行定向 E2E**

先向用户说明将启动隔离的 Electron 测试实例。只有得到明确确认才运行：

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected: 受影响 spec PASS。若用户不确认，记录「E2E 未获授权，未运行」，不得改用全量测试代替。

- [ ] **Step 4: 更新当前文档与文档状态**

`AGENTS.md` 更新页面路由和设置中心现状，写入卷宗在 `buildChatBody` 全局注入的约束。`docs/README.md` 第 16、21 节改为设置中心当前状态，将本 spec/plan 的 planned 指针移入历史链，并把本计划 frontmatter 改为 `status: historical`。共享 spec 仍包含记事板工作，保持 `status: planned`，直到另一份计划也完成。保留烛光移除记录，不删除历史设计正文。

- [ ] **Step 5: 文档检查与 Commit**

```bash
npm run docs:check
git add AGENTS.md docs e2e
git commit -m "docs: record settings center delivery"
```

Expected: docs check 全部通过，提交只包含本计划相关文件。
