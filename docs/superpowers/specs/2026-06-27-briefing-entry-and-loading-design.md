# 夜航简报入口与加载体验设计文档

**日期**: 2026-06-27  
**功能**: 夜航简报（Briefing）封面入口可发现性 + 加载进度反馈 + 错误分类  
**状态**: 方案已确认，待实现  
**对应原型**: `.superpowers/brainstorm/162-1782572872/content/cover-entry-v4.html`、`cover-entry-color-options.html`

---

## 1. 背景与目标

### 1.1 背景

夜航简报已在 V2 中落地：每天聚合 AI builders 的推文、播客和长文，生成中英双语日报并缓存到学习库。但当前体验存在明显缺口：

1. **入口不可见**：Cover 页只突出“点亮灯火/进入夜话”，“夜航简报”按钮使用 ghost 样式，视觉上被弱化，用户难以发现。
2. **首页入口多余**：用户明确表示不在 Home 页增加入口，避免两个平行入口。
3. **加载无反馈**：进入 Briefing 后，无缓存时只显示 `<BriefingSkeleton />`，用户不知道应用在做什么、要多久。
4. **错误无分类**：所有失败都显示 `简报生成失败：${error}`，无法区分网络问题、feed 为空、LLM 异常等场景。

### 1.2 目标

- 让封面入口与“进入夜话/点亮灯火”权重一致，视觉上自然对偶。
- 简报页加载时展示真实生成阶段，降低等待焦虑。
- 错误状态按类型给出明确文案和可操作下一步。
- 显示缓存时间戳，让用户知道当前看到的是否为今日最新。

---

## 2. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 入口位置 | 仅 Cover 页，Home 页不加 |
| 入口关系 | “进入夜话/点亮灯火”与“夜航简报”同时出现，权重一致 |
| 按钮样式 | 同款实心偏移阴影按钮；主按钮用 ember，简报按钮用 parchment |
| 简报按钮阴影色 | ember（与点亮灯火主色呼应） |
| 加载进度 | 真实进度，通过 IPC progress 事件分阶段展示 |
| 错误分类 | 区分 FEED_EMPTY、NETWORK_ERROR、LLM_ERROR、ASSEMBLY_ERROR、CACHE_ERROR |
| 缓存时间戳 | 在 BriefingHeader 或内容区顶部显示“生成于 HH:MM” |

---

## 3. 范围与非目标

### 3.1 范围

- 修改 `src/pages/Cover.tsx` 中“夜航简报”按钮的样式。
- 修改 `electron/ipc/briefing.ts` 的 `briefing:generate` 为 progress IPC。
- 修改 `src/pages/Briefing.tsx` 的加载状态，展示真实阶段。
- 新增/修改错误分类与文案。
- 在简报页显示缓存生成时间戳。
- 更新 E2E 测试选择器（`data-testid`）与相关 spec。

### 3.2 非目标

- 不修改简报内容渲染（学术期刊/报纸活字双风格已在另一份 spec 中规划）。
- 不修改 feed 源、LLM prompt、缓存文件路径。
- 不新增首页入口。
- 不改已有 OKR 文档。

---

## 4. 封面入口设计

### 4.1 当前问题

```tsx
// src/pages/Cover.tsx 当前实现
<Button data-testid="cover-light-button" onClick={() => goto('home')}>
  点亮灯火
</Button>
<Button
  data-testid="cover-briefing-button"
  variant="ghost"
  onClick={() => goto('briefing')}
  className="border border-slate text-slate hover:text-parchment hover:border-parchment"
>
  夜航简报
</Button>
```

问题：一个实心主按钮，一个空心 ghost 按钮，视觉权重不一致，用户容易忽略“夜航简报”。

### 4.2 新设计

两个入口均使用 **Button 组件默认 primary 样式结构**（实心、偏移阴影、hover/active 位移），仅背景色不同：

| 按钮 | 背景 | 文字 | 阴影 |
|------|------|------|------|
| 点亮灯火 / 进入夜话 | `bg-ember` (#d97757) | `text-ink` (#2a1f1a) | `shadow-[3px_3px_0_0_#3a5a6a]` (slate) |
| 夜航简报 | `bg-parchment` (#e8d5b7) | `text-ink` (#2a1f1a) | `shadow-[3px_3px_0_0_#d97757]` (ember) |

这种“颜色对偶”让两个按钮在权重一致的同时保持区分：点亮灯火偏暖重，夜航简报偏浅轻，阴影色互相呼应。

### 4.3 状态映射

| 用户状态 | 显示内容 |
|---------|---------|
| 老用户（已有 name） | 标题 `迷路了吗，{name}` + “点亮灯火” + “夜航简报” |
| 新用户（无 name） | 提示“第一次到来，告诉我你的名字” + 输入框 + “进入夜话” + “夜航简报” |

新用户在输入名字前，“进入夜话”和“夜航简报”不应可点击；输入名字后两者同时可用。

### 4.4 实现要点

```tsx
// src/pages/Cover.tsx 变更后
<Button data-testid="cover-briefing-button"
  onClick={() => goto('briefing')}
  disabled={!profile.name && !name.trim()}
  className="bg-parchment text-ink shadow-[3px_3px_0_0_#d97757]
             hover:translate-x-[1px] hover:translate-y-[1px]
             hover:shadow-[2px_2px_0_0_#d97757]
             active:translate-x-[3px] active:translate-y-[3px]
             active:shadow-none">
  夜航简报
</Button>
```

- 移除 `variant="ghost"`。
- 背景、文字、阴影全部显式指定。
- hover/active 位移与阴影收缩与主按钮完全一致。
- 新用户未输入名字时禁用该按钮。

### 4.5 交互

- 点击“夜航简报” → `goto('briefing')`。
- 简报页内部负责首次加载时的自动生成。

---

## 5. 简报页真实进度设计

### 5.1 当前问题

`src/pages/Briefing.tsx` 中无缓存时直接调用 `generateBriefing(today)`，页面只显示 `<BriefingSkeleton />`，没有任何文字说明。

### 5.2 进度阶段

简报生成流程在 `electron/ipc/briefing.ts` 中分为以下阶段：

1. `fetching` — 正在从 3 个 feed 采集今日信号。
2. `extracting` — LLM 正在从原始内容中提取关键信息。
3. `assembling` — LLM 正在将提取结果组装成简报。
4. `finalizing` — 正在写入缓存并整理输出。
5. `done` — 完成，展示简报内容。

### 5.3 IPC 架构变更

当前 `briefing:generate` 使用单次 `ipcMain.handle` 返回 `BriefingResult`。为了推送中间阶段，改为 **renderer → main 调用 + main → renderer 进度事件** 的组合：

```typescript
// electron/preload.ts 新增
onBriefingProgress: (cb: (stage: BriefingStage, detail?: string) => void) => ipcRenderer.on('briefing:progress', (_, stage, detail) => cb(stage, detail))
offBriefingProgress: (cb: ...) => ipcRenderer.removeListener('briefing:progress', cb)

// electron/ipc/briefing.ts
async function emitProgress(stage: BriefingStage, detail?: string) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('briefing:progress', stage, detail)
}
```

调用方保持 `briefing:generate` invoke，同时订阅 `briefing:progress` 事件。

### 5.4 阶段文案

| 阶段 | 显示文案 | 说明 |
|------|---------|------|
| `fetching` | 正在采集今日信号… | 聚合推文、播客、长文 |
| `extracting` | 正在提取关键信息… | LLM 提取 |
| `assembling` | 正在组装夜航简报… | LLM 组装 |
| `finalizing` | 正在归档… | 写入缓存 |
| `done` | （无，直接展示内容） | 完成 |

### 5.5 UI 设计

使用垂直步骤条（vertical stepper）：

- 已完成步骤：实心小圆点 + 文案（低透明度）。
- 当前步骤：高亮圆点 + 文案 + 可选 spinner。
- 未开始步骤：空心圆点 + 文案（更低透明度）。

整体居中显示，背景保持当前 Briefing 页面背景。

### 5.6 Store 状态

```typescript
// src/types/index.ts
export type BriefingStage = 'fetching' | 'extracting' | 'assembling' | 'finalizing' | 'done'

// src/store/index.ts
interface AppStore {
  // ...
  briefingStage: BriefingStage | null
  setBriefingStage: (stage: BriefingStage | null) => void
}
```

- `briefingStage` 在点击生成时设为 `fetching`。
- 每收到一个 progress 事件更新一次。
- 生成完成或失败时设为 `null`（内容由 `briefing` / `briefingError` 承载）。

---

## 6. 错误分类与文案

### 6.1 当前问题

所有错误统一显示为 `简报生成失败：${error}`，用户不知道是该重试、检查网络，还是只是今天没有内容。

### 6.2 错误类型

| 错误码 | 触发条件 | 用户文案 | 操作建议 |
|-------|---------|---------|---------|
| `FEED_EMPTY` | 三个 feed 均返回空数组 | 今日海面平静，暂无新信号。 | 无（只是今天没内容） |
| `NETWORK_ERROR` | feed 请求 HTTP 非 2xx 或超时 | 信号塔暂时失联，请检查网络后重试。 | 显示“重试”按钮 |
| `LLM_ERROR` | LLM extraction/assembly 调用失败 | 简报员暂时无法整理思路，请稍后再试。 | 显示“重试”按钮 |
| `ASSEMBLY_ERROR` | LLM 输出无法解析为结构化 JSON | 简报格式异常，请重试或联系开发者。 | 显示“重试”按钮 |
| `CACHE_ERROR` | 缓存写入失败 | 内容已生成，但未能写入学习库。 | 仍展示内容，并提示“（本次未写入缓存）” |

### 6.3 实现要点

- `electron/ipc/briefing.ts` 中对各失败点抛出错码而非通用 `Error`。
- `src/store/index.ts` 的 `generateBriefing` action 中捕获错误，将 `err.message` 解析为上述错误码。
- `src/pages/Briefing.tsx` 根据 `briefingError` 渲染对应组件 `BriefingError`。
- 重试按钮调用 `generateBriefing(date, { force: true })`。

---

## 7. 缓存时间戳显示

### 7.1 目标

让用户知道当前看到的简报是何时生成的，避免“这是不是今天的”疑虑。

### 7.2 数据源

`BriefingResult` 中新增 `generatedAt: string`（ISO 8601），写入缓存文件 frontmatter 或文件名中。简报生成时记录当前时间。

### 7.3 显示位置

在 `BriefingHeader` 副标题区域显示：

- 当天简报：`生成于 08:32`
- 往期简报：`2026-06-25 · 生成于 08:15`

使用本地时间 `HH:MM` 格式，日期仅在非当天显示。

### 7.4 实现要点

```typescript
// src/types/index.ts
export interface BriefingResult {
  // ...
  generatedAt: string
}
```

- 生成时 `new Date().toISOString()`。
- 缓存命中时从缓存文件 frontmatter 读取 `generatedAt`。
- UI 上用 `new Date(generatedAt).toLocaleTimeString(..., { hour: '2-digit', minute: '2-digit' })` 格式化。

---

## 8. 组件与数据流

### 8.1 新增/修改组件

| 组件/文件 | 变更 |
|----------|------|
| `src/pages/Cover.tsx` | 夜航简报按钮样式改为 parchment 实心 + ember 阴影；新用户状态禁用逻辑 |
| `src/pages/Briefing.tsx` | 加载状态改用 `BriefingStage` 步骤条；错误状态改用 `BriefingError` |
| `src/components/BriefingProgress.tsx` | 新增：垂直步骤条展示生成阶段 |
| `src/components/BriefingError.tsx` | 新增：按错误码分类展示文案和重试按钮 |
| `src/components/BriefingHeader.tsx` | 新增：显示生成时间戳 |
| `electron/ipc/briefing.ts` | `briefing:generate` 发射 `briefing:progress` 事件；错误码细化 |
| `electron/preload.ts` | 新增 `onBriefingProgress` / `offBriefingProgress` |
| `src/types/index.ts` | 新增 `BriefingStage` 类型、`BriefingResult.generatedAt` |
| `src/store/index.ts` | 新增 `briefingStage`、`setBriefingStage`；`generateBriefing` 订阅 progress 事件 |

### 8.2 数据流

```
Cover.tsx
  └─ 点击“夜航简报” ──→ goto('briefing')

Briefing.tsx
  └─ useEffect: 无缓存 ──→ generateBriefing(today)

store.generateBriefing
  ├─ 调用 ipcRenderer.invoke('briefing:generate', date, opts)
  ├─ 订阅 onBriefingProgress，更新 store.briefingStage
  └─ 完成/失败时更新 briefing / briefingError

electron/ipc/briefing.ts
  ├─ emitProgress('fetching')
  ├─ fetch feeds
  ├─ emitProgress('extracting')
  ├─ LLM extraction
  ├─ emitProgress('assembling')
  ├─ LLM assembly
  ├─ emitProgress('finalizing')
  ├─ write cache
  └─ return { ..., generatedAt }
```

---

## 9. E2E 关注点

- Cover 页“夜航简报”按钮与“点亮灯火”样式一致（尺寸、阴影结构）。
- 新用户未输入名字时，“夜航简报”按钮禁用。
- 进入 Briefing 后，无缓存时可见进度步骤条，顺序经过 fetching → extracting → assembling → finalizing。
- 有缓存时直接展示内容，Header 显示生成时间戳。
- `FEED_EMPTY` 显示“今日海面平静，暂无新信号。”，无重试按钮。
- `NETWORK_ERROR` / `LLM_ERROR` 显示对应文案和重试按钮。
- 重试按钮触发 `briefing:generate({ force: true })`。

---

## 10. 决策摘要表

| 决策项 | 选择 |
|-------|------|
| 入口位置 | 仅 Cover 页 |
| 按钮样式 | 同款实心偏移阴影，颜色对偶 |
| 简报按钮配色 | parchment 背景 + ink 文字 + ember 阴影 |
| 加载进度 | 真实 IPC progress 事件，5 阶段 |
| 错误分类 | FEED_EMPTY、NETWORK_ERROR、LLM_ERROR、ASSEMBLY_ERROR、CACHE_ERROR |
| 缓存时间戳 | 显示生成时间 `HH:MM`，非当天显示日期 |
| 首页入口 | 不加 |
| LLM pipeline | 不改 prompt 和解析规则 |

---

## 11. 风险与限制

| 风险 | 影响 | 缓解 |
|-----|------|------|
| progress 事件跨进程广播实现细节复杂 | 可能漏发或重复 | 使用 focusedWindow fallback；发送前检查窗口存在 |
| 缓存时间戳需要从现有缓存文件兼容 | 旧缓存无 generatedAt | 旧缓存不显示时间戳，或 fallback 为文件 mtime |
| 新用户状态禁用逻辑影响 E2E | 现有 E2E 可能直接点击 briefing 按钮 | 更新 E2E：新用户场景先输入名字 |
| 颜色对偶在浅色主题下可读性 | parchment 按钮在浅色背景不明显 | Cover 页为暗色背景，无此问题 |
