# 夜航简报功能设计文档

**日期**: 2026-06-21  
**更新日期**: 2026-06-22  
**功能**: 在学者夜话中内置 AI 行业日报（基于 follow-builders 数据源）  
**状态**: 待实现

---

## 1. 目标与范围

### 1.1 目标

在学者夜话中新增一个独立的"夜航简报"功能：每天自动聚合 AI 行业 Builders 的推文、播客和长文，生成一篇中英双语的摘要日报，并保存到用户的学习库中供后续复习。

### 1.2 范围

- 封面页新增"夜航简报"入口按钮
- 新增独立的 `briefing` 页面
- 进入页面即自动生成当日简报（若已生成则直接读取）
- 简报包含 LLM 摘要 + 可展开的原始来源
- 自动按日期保存为 `.md` 学习笔记
- 支持翻阅往期已生成的简报
- Home 页面和 Briefing 页面统一增加返回封面的左上角箭头

### 1.3 非目标

- 不实现服务端 feed 生成（复用 follow-builders 已发布的三个公开 JSON）
- 不实现邮件/Telegram 投递
- 不实现用户自定义数据源（使用固定 source list）
- 不实现多语言切换（固定中英双语）
- **不实现信息粒度切换**（本次只保留默认粒度，通过 2 次 LLM 调用提升质量）

---

## 2. 用户流程

```
启动应用
  └── 封面页
        ├── 点亮灯火 → Home 页
        │              └── 左上角 ← 返回封面
        └── 夜航简报 → Briefing 页
                       ├── 首次进入：拉取 feed → LLM 生成 → 展示 → 保存 .md
                       ├── 同日再次进入：直接读取已保存的 .md
                       ├── 点击顶部"往期" → 右侧抽屉列出已保存日期
                       │                    └── 选择日期 → 展示该日简报
                       └── 左上角 ← 返回封面
```

---

## 3. 视觉设计

### 3.1 封面入口

- 位置：左下角，与"点亮灯火"垂直排列
- "点亮灯火"：保持主按钮样式（ember #d97757）
- "夜航简报"：次按钮样式，使用灰蓝 `#6b8fa8` 边框和文字
- 排列：垂直双按钮，"点亮灯火"在上，"夜航简报"在下

### 3.2 夜航简报页

- 背景：复用 Study 页面的油画背景机制，从 `Pictures/index.json` 中随机抽取一幅 Rothko / Guy Billout 画作，通过 `SurfaceBackground surface="briefing"` 渲染全屏背景
- 顶部左侧：返回封面箭头图标（←）
- 顶部右侧："往期"按钮，点击后从右侧滑出日期抽屉
- 标题：**夜航简报**
- 日期与标签：如"2026 年 6 月 21 日 · AI 行业日报"
- 内容区：**C · 时间线/航海日志式**
  - 左侧时间线贯穿全页，呼应"夜航"主题
  - 时间线节点依次展示：今日航标 → Builder 动态 → 播客与长文 → 一句话火种
  - 每个节点 bilingual（英文原文 + 中文译文）
  - 底部可展开"原始来源"面板

### 3.3 往期简报抽屉

- 从右侧滑出，宽度约 240px
- 按时间倒序列出 `STUDY_LIBRARY_PATH/夜航简报/` 下已保存的简报文件
- 每项显示日期，如"06-21"
- 点击后关闭抽屉并加载该日期简报
- 当前日期高亮显示

### 3.4 Home 页调整

- 左上角增加返回封面箭头图标
- 与现有右上角"设置/卷宗/扩展"按钮不冲突

---

## 4. 数据流与架构

采用主进程封装方案，符合学者夜话现有 IPC 三层架构。

```
Renderer (Briefing.tsx)
        │
        │ ipc.briefingGenerate({ date })
        │ ipc.briefingList()
        ▼
Main Process (electron/ipc/briefing.ts)
        │
        ├── 1. 检查学习库是否已有 "夜航简报/夜航简报-YYYY-MM-DD.md"
        │     存在 → 直接读取返回
        │
        ├── 2. fetch 三个公开 feed
        │     feed-x.json
        │     feed-podcasts.json
        │     feed-blogs.json
        │
        ├── 3. 读取 prompts（内置到应用代码中）
        │     profile-context.md
        │     summarize-tweets.md
        │     summarize-podcast.md
        │     summarize-blogs.md
        │     digest-intro.md
        │     translate.md
        │
        ├── 4. 第 1 次 LLM 调用：提取结构化摘要
        │     输入：用户 profile_text + 三个 feed + 摘要类 prompts
        │     输出：JSON 结构化摘要（builders / podcasts / blogs）
        │
        ├── 5. 第 2 次 LLM 调用：组装双语日报
        │     输入：结构化摘要 + digest-intro.md + translate.md
        │     输出：最终 Markdown
        │
        ├── 6. 直接写入学习库文件
        │     目录：STUDY_LIBRARY_PATH/夜航简报/
        │     文件名：夜航简报-YYYY-MM-DD.md
        │
        └── 7. 返回 { title, content, sources, filePath }
```

**LLM 调用配置**：两次调用均传入

```typescript
{
  temperature: 0.5,
  thinking: { type: 'enabled', reasoning_effort: 'max' }
}
```

该配置与 `generateFable`、`finalizeProgress` 等任务保持一致。当模型为 DeepSeek 时启用最高深度思考；当模型为 Kimi 时由 `buildChatBody` 自动降级为 `thinking: { type: 'disabled' }`，不会报错。

---

## 5. IPC API 设计

在 `src/types/index.ts` 的 `IpcApi` 中新增：

```typescript
briefingGenerate: (args: { date: string; profile: Profile; force?: boolean }) => Promise<BriefingResult>
briefingList: () => Promise<{ date: string; filePath: string }[]>
```

已有类型：

```typescript
type BriefingResult = {
  title: string
  date: string
  content: string           // markdown 正文
  sources: BriefingSource[]
  filePath: string
  cached: boolean           // 是否来自已缓存文件
}

type BriefingSource = {
  type: 'x' | 'podcast' | 'blog'
  author?: string
  title?: string
  url?: string
  items: {
    text?: string
    url?: string
    timestamp?: string
  }[]
}
```

---

## 6. 文件保存规则

- **文件名**：`夜航简报-YYYY-MM-DD.md`
- **目录**：`STUDY_LIBRARY_PATH/夜航简报/`
- **frontmatter**：
  ```yaml
  ---
  title: 夜航简报
  type: briefing
  created: 2026-06-21T00:00:00.000Z
  tags: [industry-digest, ai]
  sources: '[{...}]'
  ---
  ```
  - `sources` 以 JSON 字符串形式保存，便于渲染进程快速回显
  - 需要在 `DocType` 中保持 `'briefing'`
- **缓存策略**：同一天内重复进入 Briefing 页面，直接读取已保存文件，不重新调用 LLM
- **强制刷新**：未来可扩展 `force: true` 参数，当前版本不暴露给 UI

---

## 7. Prompt 策略

Prompts 从 follow-builders skill 中提取并内置到应用代码中（`electron/prompts/briefing/`），避免运行时依赖外部 skill。

### 7.1 两次调用分工

#### 第 1 次调用：结构化摘要

输入文件：

- `profile-context.md` → 注入用户 `profile_text`，要求 LLM 根据背景判断内容相关性
- `summarize-tweets.md` → X feed 处理要求
- `summarize-podcast.md` → 播客 feed 处理要求
- `summarize-blogs.md` → 博客 feed 处理要求

输出格式（强制 JSON）：

```json
{
  "builders": [
    {
      "name": "...",
      "role": "...",
      "handle": "...",
      "summary": "...",
      "key_url": "..."
    }
  ],
  "podcasts": [
    {
      "show": "...",
      "episode": "...",
      "url": "...",
      "takeaway": "...",
      "summary": "...",
      "quote": "..."
    }
  ],
  "blogs": [
    {
      "blog": "...",
      "title": "...",
      "url": "...",
      "summary": "...",
      "quote": "..."
    }
  ]
}
```

#### 第 2 次调用：最终组装

输入文件：

- `digest-intro.md` → 导语/框架约束
- `translate.md` → 中英双语输出约束

输入数据：第 1 次调用产出的 JSON 摘要。

输出：符合第 7.2 节格式的最终 Markdown。

### 7.2 输出格式约定

LLM 输出需遵循以下结构：

```markdown
## 今日航标
...

## Builder 动态
### @karpathy
...

## 播客与长文
...

## 一句话火种
...

## 原始来源
### @karpathy
- tweet1
- tweet2

### Latent Space #157
- ...
```

---

## 8. 状态管理

在 `src/store/index.ts` 中：

1. `Page` 类型已包含 `'briefing'`
2. 保持 `briefing` 相关状态：
   ```typescript
   briefing: {
     result: BriefingResult | null
     loading: boolean
     error: string | null
   }
   ```
3. 保持 action：`generateBriefing(date)`，调用 `ipc.briefingGenerate({ date, profile })`
4. 新增 action：`loadBriefingHistory()`，调用 `ipc.briefingList`

页面跳转复用现有 `goto('briefing')` 和 `goto('cover')`。

---

## 9. 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 网络失败，feed 无法拉取 | 显示"暂时无法连接夜航信号，请检查网络后重试" |
| LLM 调用失败 | 显示"简报生成失败"，提供重试按钮 |
| 文件保存失败 | 显示 warning toast，但仍展示内容；调用 `files:recoveryDump` 兜底 |
| 三个 feed 全部为空 | 显示"今日海面平静，暂无新信号" |
| 选择往期日期但文件不存在 | 抽屉中只列出已保存日期，理论上不会出现；若出现则提示"该日简报尚未生成" |

---

## 10. 组件清单

| 组件 | 路径 | 职责 |
|-----|------|------|
| `Cover` | `src/pages/Cover.tsx` | 增加"夜航简报"入口按钮 |
| `Home` | `src/pages/Home.tsx` | 增加返回封面箭头 |
| `Briefing` | `src/pages/Briefing.tsx` | 夜航简报主页面 |
| `BackToCover` | `src/components/BackToCover.tsx` | 统一返回封面箭头按钮 |
| `BriefingCard` | `src/components/BriefingCard.tsx` | 简报内容卡片 |
| `SourcePanel` | `src/components/SourcePanel.tsx` | 可展开的原始来源区 |
| `BriefingSkeleton` | `src/components/BriefingSkeleton.tsx` | 生成中的 loading 占位 |
| `BriefingHistoryDrawer` | `src/components/BriefingHistoryDrawer.tsx` | 往期简报抽屉 |
| `briefing.ts` | `electron/ipc/briefing.ts` | 主进程 IPC 处理器 |

---

## 11. 测试计划

- `briefing.test.ts`：
  - 验证 feed fetch、缓存命中、文件命名
  - 验证保存目录为 `STUDY_LIBRARY_PATH/夜航简报/`
  - 验证两次 LLM 调用均携带 `thinking: { type: 'enabled', reasoning_effort: 'max' }`
  - 验证第 1 次调用注入 `profile_text`
- `briefing-prompt.test.ts`：
  - 验证新增 `profile-context.md` 存在并包含 `{{profile_text}}`
  - 验证摘要类 prompts 存在
- `briefing-parser.test.ts`：验证 Markdown 结构解析
- 手动测试：封面入口、生成 loading、返回箭头、同日缓存、往期抽屉

---

## 12. 风险与限制

1. **公开 feed 的可用性**：如果 feed URL 失效或更新延迟，功能会受影响。后续可考虑本地缓存 feed。
2. **LLM 成本**：每天首次进入会调用两次 LLM。可通过缓存避免重复调用。
3. **内容版权**：聚合内容仅供个人学习使用，不应二次分发。
4. **prompt 维护**：follow-builders 原作者更新 prompts 后，需要手动同步到应用代码中。

---

## 13. 后续可扩展

- 允许用户切换语言（中文/英文/双语）
- 允许用户自定义关注的 builders
- 后台预生成（启动时自动生成今日简报）
- 将简报加入首页"学习库"筛选标签
- 支持手动刷新/重新生成

---

## 14. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 功能名称 | 夜航简报 |
| 入口位置 | 封面页左下角，垂直双按钮 |
| 按钮颜色 | 灰蓝 `#6b8fa8` |
| 展示模式 | C：时间线/航海日志式 + 可展开原始来源 |
| 往期入口 | 抽屉式目录，从右侧滑出 |
| 语言 | 固定中英双语 |
| 生成触发 | 进入页面自动生成 |
| 保存规则 | `STUDY_LIBRARY_PATH/夜航简报/夜航简报-YYYY-MM-DD.md`，同日复用 |
| 实现方案 | B：主进程新增 IPC 封装 |
| LLM pipeline | **2 次调用**：第 1 次结构化摘要 + 背景注入，第 2 次双语组装 |
| DeepSeek 思考 | 两次调用均开启 `reasoning_effort: 'max'`（与寓言生成一致） |
| 信息粒度 | 本次不实现粒度切换，只保留默认粒度 |
| 页面背景 | 复用 Study 页面油画背景 pipeline，从 Pictures 随机抽取 |
| 返回按钮 | 左上角箭头图标，Home 和 Briefing 统一 |
