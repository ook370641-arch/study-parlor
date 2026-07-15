# 夜航简报微调 v2 — 设计规格

**日期**: 2026-07-15
**状态**: 待评审
**范围**: 博客文章页 UI、旁注交互、导读侧边栏

---

## 问题清单

| # | 问题 | 根因 | 类型 |
|---|------|------|------|
| 1 | 已导入博客文章边框只有橙色左边框 | 未设置其他三边颜色 | 样式补全 |
| 2 | 选中文字后🖊幽灵笔不出现 + 高亮消失 | `setTimeout` 时序不可靠 + 无持久化高亮 | Bug |
| 3 | 搜索按钮无开关状态，点击即发送 | 无 toggle state，`handleSend(true)` 直接发送 | 交互 |
| 4 | 换画按钮重复（页级 + 文章内各一个） | Briefing.tsx 和 AnthropicArticleReader 各渲染一个 | 去重 |
| 5 | 导读左箭头无法点击 + resize 不实时 | 父容器 `overflow-hidden` 裁剪 + CSS transition 延迟 | Bug |
| 6 | 文章文字区域过窄（27寸不到一半屏宽） | 内容区 `w-[90%]` + `max-w-[1250px]` 封顶（详见 Issue 6 勘误） | Bug |
| 7 | E2E 测试覆盖 | — | 质量 |

---

## Issue 1: 博客边框颜色

### 当前状态

`AnthropicArticleRow.tsx:74-75` — 已保存文章只设置了左边框：
```
border-l-[3px] border-l-ember
```
其余三边由 Tailwind `border` 类设置默认 `1px solid`，颜色来自 CSS 变量（视觉上与橙色不协调）。

### 目标

| 边框位置 | 学术主题 | 报刊主题 |
|----------|---------|---------|
| 左 | `#d97757` (ember)，3px | `#1a1a1a`，3px |
| 上 | `rgba(232,213,183,0.12)` | `#c9c3b8`/30% |
| 右 | `rgba(232,213,183,0.12)` | `#c9c3b8`/30% |
| 下 | `rgba(232,213,183,0.12)` | `#c9c3b8`/30% |

上/右/下颜色与**未导入文章左边框**颜色一致。

### 实现

`AnthropicArticleRow.tsx` 的 `borderClass` 变量，修改已保存分支：

```tsx
// 学术 - 已保存
borderClass = 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
// 报刊 - 已保存
borderClass = 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
```

**改动文件**: `src/components/anthropic/AnthropicArticleRow.tsx`（1 处条件分支）

---

## Issue 2: 文字选中幽灵笔 + 高亮持久化

### 当前状态

`ArticleAnnotations.tsx:229-300` — `mouseup` → `setTimeout(10ms)` → 读 `window.getSelection()`。
- `setTimeout` 10ms 不一定足够等 selection 稳定
- `mousedown` 事件立即清除幽灵笔（`setGhost(null)`）
- 选中高亮是浏览器原生选区，点击任意位置即消失

### 目标

1. 左键选中文字后，🖊幽灵笔**可靠出现**在选区末尾
2. 选中文字保持**持久化高亮**（半透明 ember 底色），不随点击消失
3. 高亮持续到：用户点击🖊（创建标注）或点击其他区域（解散选区）

### 实现

#### 2a. 修复幽灵笔时序

将 `mouseup` handler 中的 `setTimeout(10ms)` 改为 `requestAnimationFrame` + 回退 `setTimeout(0)`，确保在浏览器完成选区渲染后读取：

```ts
const handleMouseUp = () => {
  requestAnimationFrame(() => {
    setTimeout(() => {
      // ... 读 selection、设置 ghost
    }, 0)
  })
}
```

#### 2b. 持久化高亮 overlay

新增状态 `selectionRects: DOMRect[]`，选中文字后：

1. 用 `range.getClientRects()` 获取选区矩形
2. 在文章容器内渲染绝对定位的高亮层（`position: absolute`，颜色 `rgba(217,119,87,0.13)`，`border-radius: 2px`）
3. 高亮层在以下时机清除：
   - 点击幽灵笔 → 创建标注 → 高亮转为正式 marker
   - 点击高亮区域外 → 解散选区
   - 按 Escape → 解散选区

```tsx
{selectionRects.map((rect, i) => (
  <div
    key={i}
    style={{
      position: 'absolute',
      left: rect.left - containerRect.left + scrollLeft,
      top: rect.top - containerRect.top + scrollTop,
      width: rect.width,
      height: rect.height,
      background: 'rgba(217,119,87,0.13)',
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: 2,
    }}
  />
))}
```

#### 2c. 幽灵笔持久化

幽灵笔不再在 `mousedown` 时清除，改为：
- 点击幽灵笔 → 创建标注 → 幽灵笔转为正式🖊
- 点击文章容器空白区域 → 清除幽灵笔 + 高亮

**改动文件**: `src/components/article-assistant/ArticleAnnotations.tsx`（mouseup handler + 高亮逻辑 + 清除逻辑）

---

## Issue 3: 搜索按钮开关态

### 当前状态

`ChatWindow.tsx:149-158` — 🔍 按钮调用 `handleSend(true)` 立即发送带搜索的请求。
`store/index.ts:1037-1044` — `useSearch` 是即时参数，无持久化 toggle。

### 目标

1. 🔍 按钮有**明确的开关视觉态**
2. 点击 🔍 **只切换开关状态，不发送消息**
3. 搜索开关**持久化**：开启后保持开启，直到用户再次点击关闭
4. 用户按 Enter 或点「发送」时，读取当前开关状态决定是否带搜索

### 实现

#### 3a. 新增 store 字段

```ts
// AssistantSession 新增
searchEnabled: boolean  // default: false
```

#### 3b. ChatWindow UI

```tsx
const searchEnabled = useStore((s) => s.assistantSession?.searchEnabled ?? false)
const toggleSearch = useStore((s) => s.toggleAssistantSearch)

// 按钮
<button
  onClick={toggleSearch}  // 只切换，不发消息
  className={searchEnabled 
    ? 'bg-ember text-white' 
    : 'text-parchment/70 hover:text-ember'
  }
  title={searchEnabled ? '搜索已开启' : '搜索已关闭'}
>
  🔍
</button>

// 发送
const handleSend = () => {
  sendAssistantMessage(text, searchEnabled)
  setInput('')
}
```

**改动文件**:
- `src/types/index.ts` — `AssistantSession` 加 `searchEnabled?: boolean`
- `src/store/index.ts` — 新增 `toggleAssistantSearch` action，初始化默认值
- `src/components/article-assistant/ChatWindow.tsx` — 按钮行为改为 toggle

---

## Issue 4: 换画按钮去重

### 当前状态

- `Briefing.tsx:124-132` — 页级按钮（`source !== 'digest'` 时显示，含 anthropic）
- `AnthropicArticleReader.tsx:156-162` — 文章内按钮（`absolute top-4 right-4`）

两个按钮同时可见时造成冗余。

### 目标

只保留一个换画按钮，位于文章页右上角，固定在滚动区之外（不随文章滚动消失）。

### 实现

#### 4a. 删除 Briefing.tsx 中的按钮

`Briefing.tsx:124-132` 的条件块内，把 `source !== 'digest'` 改为 `source !== 'digest' && source !== 'anthropic'`。

#### 4b. AnthropicArticleReader 按钮位置调整

将按钮从可滚动区 `div.flex-1.overflow-y-auto` 内部移到外层固定容器中：

```tsx
// AnthropicArticleReader 外层（flex h-full overflow-hidden）
<div className="relative flex h-full ...">
  {/* 固定换画按钮 — 在滚动区之前、导读侧边栏左侧 */}
  <div className="absolute top-4 right-4 z-20">
    <SwapPaintingButton surface="briefing" ... />
  </div>
  {/* 文章滚动区 */}
  <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
    ...
  </div>
  {/* 导读侧边栏 */}
  ...
</div>
```

**改动文件**: `src/pages/Briefing.tsx`（1 行条件改动）、`src/components/anthropic/AnthropicArticleReader.tsx`（按钮位置移动）

---

## Issue 5: 导读箭头可点击 + resize 实时

### 当前状态

- `AnthropicArticleReader.tsx:150` — 根容器 `overflow-hidden` 裁剪了 `ArticleDivider` 的折叠按钮（`-left-6`，即向左偏移 24px）
- `ArticleAssistantPanel.tsx:86` — 导读区 `transition-[width] duration-150 ease-out` 导致拖拽 resize 有 CSS 动画延迟

### 目标

1. 导读折叠/展开箭头可点击
2. 拖拽 divider resize 时宽度实时变化（无延迟）

### 实现

#### 5a. 修复箭头裁剪

`AnthropicArticleReader.tsx:150` 的 `overflow-hidden` 移除，改为在子元素上分别控制 overflow：
- 文章滚动区：`overflow-y-auto`（已有）
- 导读区外层 div：`overflow-hidden`（已有，line 86）

修改：
```diff
- className={`relative flex h-full overflow-hidden ${themeClasses.bg} ${themeClasses.text}`}
+ className={`relative flex h-full ${themeClasses.bg} ${themeClasses.text}`}
```

#### 5b. 修复 resize 实时性

`ArticleDivider` 向父组件暴露拖拽状态，`ArticleAssistantPanel` 在拖拽期间移除 CSS transition。

```tsx
// ArticleAssistantPanel
const [resizing, setResizing] = useState(false)

<div className={`h-full overflow-hidden ${resizing ? '' : 'transition-[width] duration-150 ease-out'}`} style={{ width: sidebarWidth }}>
```

`ArticleDivider` 新增 `onResizeStart` / `onResizeEnd` props。

**改动文件**: 
- `src/components/anthropic/AnthropicArticleReader.tsx`（overflow 移除）
- `src/components/article-assistant/ArticleDivider.tsx`（暴露拖拽生命周期）
- `src/components/article-assistant/ArticleAssistantPanel.tsx`（条件 transition）

---

## Issue 6: 文章宽度修复

### 当前状态

两层宽度限制：
1. 文章内容 `w-[90%]` — 内容区打九折
2. `max-w-[1250px]` — 宽屏封顶（2560px 屏上文章仅占 ~49%）

> **勘误（实现期修订）**：spec 初版把 `BriefingListColumn.tsx:31` 的 `w-80`(320px) 判定为 bug（"本意 80px"）。实现期检查发现 320px 是**有意为之**——博客列表要容纳 80px 缩略图 + 标题 + 搜索框，80px 字面宽度装不下。该"修复"已取消，仅修正误导性注释。

### 目标

修复内容区过窄，让 27 寸全屏下文章占主要空间，同时保持行长可读。

### 实现

#### 6a. 修正 BriefingListColumn 注释（原"宽度修复"取消）

```diff
- width?: 64 | 80 // px rail width in tailwind units; 64 for dates, 80 for blog list
+ width?: 64 | 80 // Tailwind spacing units (w-64=256px, w-80=320px); 64 for dates, 80 for blog list
```

#### 6b. 加宽内容区（用户选定 1600px 上限）

`AnthropicArticleReader.tsx:155`、`AcademicBriefingLayout.tsx:31`、`NewspaperBriefingLayout.tsx:31`：

```diff
- w-[90%] max-w-[1250px] min-w-[520px]
+ w-[95%] max-w-[1600px] min-w-[520px]
```

### 预期效果

| 屏幕 | 修复前 | 修复后 |
|------|--------|--------|
| 1920px | ~979px (51%) | ~1230px (64%，受 95% 限制) |
| 2560px | ~1250px (49%) | ~1600px (62%，受上限限制) |

**改动文件**: `BriefingListColumn.tsx`、`AnthropicArticleReader.tsx`、`AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`

---

## Issue 7: E2E 测试

### 7a. 博客边框（`tests/briefing-layout.test.tsx` 或新文件）

- 选中已导入 Anthropic 文章行
- 断言 `border-left-color: #d97757`（学术）/ `#1a1a1a`（报刊）
- 断言 `border-top-color` 等三边颜色

### 7b. 文字选中幽灵笔 + 高亮（`tests/article-assistant/`）

- 模拟在文章区选中文字
- 断言 `[data-testid="anno-ghost-pen"]` 出现
- 断言高亮 overlay 存在
- 模拟点击高亮区外 → 断言幽灵笔 + 高亮消失

### 7c. 搜索开关（`tests/article-assistant/ChatWindow.test.tsx`）

- 点击 🔍 按钮 → 断言按钮视觉态变化 → 断言没有发送消息
- 再次点击 🔍 → 断言恢复默认态
- 输入文字按 Enter → 断言发送时带 `useSearch: true`

### 7d. 换画按钮唯一性（`tests/anthropic-blog-panel.test.tsx`）

- 打开 Anthropic 文章 → 断言仅存在一个 `[data-testid="anthropic-swap-painting-button"]`

### 7e. 导读箭头 + resize（`tests/briefing-layout.test.tsx`）

- 展开导读 → 断言箭头按钮可见且可点击
- 拖拽 divider → 断言 `transition` class 在拖拽期间不存在

### 7f. 文章宽度（`tests/briefing-layout.test.tsx`）

- 断言 `w-[64px]`/`w-[80px]` 替代了旧的 `w-64`/`w-80`
- 断言内容区使用 `max-w-[1400px]`

---

## 影响范围汇总

| 文件 | Issues |
|------|--------|
| `src/components/anthropic/AnthropicArticleRow.tsx` | #1 |
| `src/components/article-assistant/ArticleAnnotations.tsx` | #2 |
| `src/types/index.ts` | #3 |
| `src/store/index.ts` | #3 |
| `src/components/article-assistant/ChatWindow.tsx` | #3 |
| `src/pages/Briefing.tsx` | #4 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | #4, #5a, #6b |
| `src/components/article-assistant/ArticleDivider.tsx` | #5b |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | #5b |
| `src/components/BriefingListColumn.tsx` | #6a |
| `src/components/briefing/AcademicBriefingLayout.tsx` | #6b |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | #6b |
| `e2e/` 相关测试文件 | #7 |

---

## 验收清单

- [ ] 已导入博客文章左橙 + 三边棕（两个主题均正确）
- [ ] 选中文字后🖊出现 + 高亮保持
- [ ] 高亮在点击区域外或 Esc 时解散
- [ ] 🔍 按钮 toggle 有视觉差异，不立即发送
- [ ] 搜索开关跨消息持久化
- [ ] 仅一个换画按钮，位置固定不随滚动消失
- [ ] 导读箭头可点击折叠/展开
- [ ] 拖拽导读 divider 实时变化宽度
- [ ] 文章宽度在 27 寸全屏下占比 >70%
- [ ] E2E 全部通过
- [ ] 报刊主题无回归
