# 分组推荐卡片与删除确认弹窗设计

日期: 2026-05-11

---

## 1. 需求概述

本轮两个改动：

1. **左侧分组推荐卡片**：将现有扁平的「推荐主题」替换为按分组展示的智能推荐卡片。每个卡片左侧有色条（与分组 ribbon 颜色一致），包含一个基于 LLM 生成的 universal 主题推荐和隐喻式 hook。每张卡片内置刷新按钮，支持按分组独立刷新。

2. **删除确认弹窗**：为分组删除和 session 删除添加确认弹窗。分组删除将主题移至默认分组；session 删除将彻底删除 `s{N}` 文件夹下的所有文件。弹窗采用 Disco Elysium 暗色仪式风格。

---

## 2. 设计理念：波兰尼 × 极乐迪斯科

### 2.1 默会知识的视觉隐喻

推荐不应该是算法的冰冷计算，而应该是从已知主题中隐约浮现的联结。卡片的文案以第二人称「你」开头，制造内在对话感——就像迪斯科中的技能检定，推荐是在向用户提出一个问题，而非给出一个答案。

hook 示例：
- AI Tools 分组 → "你已熟悉各类 AI 工具，却还未曾站在工具的交会处，看它们如何彼此对话……"
- Philosophy 分组 → "你追问过知识的边界，但尚未追问：那些无法被言说的知识，是如何被传承的？"

### 2.2 暗色仪式的警示

删除弹窗不使用明亮的红色警告，而是用 wine 色（#8a3a3a）的克制警示。文字说明具体后果而非恐吓用户。按钮带有 3D 按压阴影——每一个决定都有物理重量感。

---

## 3. 分组推荐卡片设计

### 3.1 位置与布局

位于 Home 页面左侧栏「开始新学习」按钮下方，Section 标签为「从已知推未知」。

布局结构：
```
左侧栏 (w-[360px])
  ├── 未完成的会话 (条件渲染)
  ├── [开始新学习] 主按钮
  ├── 从已知推未知 (section label)
  │     ├── rec-card[分组A] (带色条 + 刷新按钮)
  │     ├── rec-card[分组B] (带色条 + 刷新按钮)
  │     └── ...
  └── ...
```

### 3.2 卡片视觉规范

- **背景**: `bg-ink/40` 默认，`bg-ink/60` hover
- **边框**: `border border-slate/30` 默认，`hover:border-ember/50` hover
- **左侧色条**: 3px 宽圆角条，颜色 = 分组 color。hover 时宽度变为 4px（`transition-all 0.2s`）
- **分组标签**: 卡片 header 左上角，颜色 = 分组 color 的提亮版本（opacity 调整）
- **刷新按钮**: 右上角 `↻` 图标，18px，hover 时 `text-ember + bg-ember/10`，点击时 `animate-spin`
- **主题标题**: `font-serif text-parchment` 0.95rem，font-weight 600
- **Hook 文案**: `text-parchment/50` 0.75rem，斜体，line-height 1.5

### 3.3 Prompt 设计（LLM 调用）

**输入**: 分组名 + 该分组下所有主题标题 + 用户画像（profile_text + preferred_topics）

**输出格式**: `{ topic: string; hook: string }`

**Prompt 核心要求**:
- 基于用户已有主题，推导一个足够 "universal" 的新主题
- 不是随机的，而是从已有主题的「知识边界」向外延伸一步
- hook 文案必须以第二人称「你」开头，制造内在对话感
- 隐喻感：暗示用户已经站在门槛上，只差一步

**示例推导链**:
- 输入: [Claude Code 工作流, Kimi API 集成, Prompt Engineering] + "AI 产品经理"
- 输出: MCP 协议与工具编排 — "你已熟悉各类 AI 工具，却还未曾站在工具的交会处……"

### 3.4 刷新机制

- 每个卡片的刷新按钮独立调用 LLM，只刷新该分组
- 加载状态：刷新按钮 spinning，卡片内容 fade out 并显示 "正在浮现……"
- 错误状态：显示 "这次联结很模糊，再试一次" + 重试按钮
- 为避免 LLM 费用过高，限制同一分组 30 秒内不可重复刷新

### 3.5 点击行为

点击卡片（非刷新按钮区域）→ 打开 PreStudyModal，mode=progress，topic=推荐主题名

---

## 4. 删除确认弹窗设计

### 4.1 共用组件：ConfirmDialog

新建 `src/components/ConfirmDialog.tsx`，可复用。

**Props 接口**:
```typescript
type ConfirmDialogProps = {
  open: boolean
  title: string
  icon: 'warning' | 'trash'
  body: React.ReactNode
  confirmLabel: string
  confirmVariant: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}
```

**视觉规范**:
- 遮罩: `fixed inset-0 z-50 bg-ink/85`
- 面板: `bg-ink border border-slate/50 rounded-lg p-7 max-w-md w-[90%]`
- 阴影: `shadow-[0_20px_60px_rgba(0,0,0,0.5)]`
- Icon: warning 用 `&#9888;` wine 色，trash 用 `&#128465;` wine 色，1.5rem
- 标题: `font-serif text-lg font-semibold text-parchment`
- 正文: `text-sm text-parchment/60 leading-relaxed`
- 警告文字: `text-wine font-medium`
- 取消按钮: `btn-ghost` 样式（透明背景 + slate/50 边框）
- 确认按钮: `btn-danger` 样式（wine 背景 + wine-dim 3D 阴影）
- 键盘: ESC 取消，Enter 确认
- 点击遮罩关闭

### 4.2 分组删除确认

**触发**: GroupRibbon 右键菜单点击「删除」

**文案**:
- 标题: "解散分组"
- 正文: `即将解散分组「{groupName}」。该分组下的主题将被移至默认分组，主题文件不会被删除。`
- 警告: "此操作不可撤销。"
- 确认按钮: "确认解散"
- 取消按钮: "再想想"

**行为**: 确认后调用 IPC `deleteGroup(id, 'default')`，已有实现。

### 4.3 Session 删除确认

**触发**: TopicAccordion 展开的 session 行最右侧新增 `&#x2715;` 删除按钮，点击触发

**文案**:
- 标题: "删除 Session"
- 正文: `即将彻底删除 {topicName} / s{sessionNumber}。以下文件将被永久删除：{fileList}。`
- 警告: "此操作不可撤销。"
- 确认按钮: "彻底删除"
- 取消按钮: "保留"

**行为**: 确认后调用新 IPC `files:deleteArchivedSession`，递归删除 `STUDY_LIBRARY_PATH/{dirName}/s{sessionNumber}/` 文件夹，然后刷新 library。

### 4.4 删除按钮视觉（SessionRow）

- 位置: session 行最右侧，文件按钮之后
- 样式: 18×18px 透明按钮，`text-wine/40` 默认，`hover:text-wine hover:bg-wine/15`
- 图标: `&#x2715;`（×）
- tooltip: "删除 session"
- 仅在 hover 整个 session 行时显示（或始终显示但极低对比度）

---

## 5. 数据流与 IPC

### 5.1 新 IPC：分组推荐

当前 `llmInspirations` 是全局推荐（基于 profile）。需要新增按分组推荐：

```typescript
// IpcApi 新增
llmGroupInspiration: (args: {
  groupName: string
  existingTopics: string[]  // 该分组下所有主题标题
  profile: Profile
}) => Promise<NewTopic>
```

实现位于 `electron/lib/llm-tasks.ts`，复用现有 Kimi 调用逻辑。

### 5.2 新 IPC：删除 Session

```typescript
// IpcApi 新增（注意与 store.deleteSession 区分）
deleteArchivedSession: (args: {
  dirName: string
  sessionNumber: number
}) => Promise<void>
```

实现位于 `electron/ipc/files.ts`：
1. 校验 dirName
2. 构建路径 `path.join(cfg.libraryPath, dirName, `s${sessionNumber}`)`
3. 使用 `fs.rmSync(sessionDir, { recursive: true })` 删除
4. 返回

### 5.3 状态更新

删除 session 后，前端需要刷新 library 列表：
```typescript
const library = await ipc.scanLibrary()
set({ library })
```

---

## 6. 文件改动清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/components/ConfirmDialog.tsx` | 新建 | 共用确认弹窗组件 |
| `src/components/GroupRecCard.tsx` | 新建 | 分组推荐卡片 |
| `src/components/InspirationChip.tsx` | 修改 | 可能废弃或改为 GroupRecCard 的内部组件 |
| `src/pages/Home.tsx` | 修改 | 替换推荐列表为分组卡片 |
| `src/components/StudyLibrary.tsx` | 修改 | SessionRow 增加删除按钮；TopicAccordion 传递 onDeleteSession 回调 |
| `src/components/GroupRibbon.tsx` | 修改 | 删除按钮改为触发弹窗 |
| `src/store/index.ts` | 修改 | 新增 deleteArchivedSession action |
| `electron/ipc/files.ts` | 修改 | 新增 files:deleteSession handler |
| `electron/lib/llm-tasks.ts` | 修改 | 新增 llmGroupInspiration 调用 |
| `src/types/index.ts` | 修改 | IpcApi 新增两个接口 |
| `electron/preload.ts` | 修改 | 暴露新 IPC 方法到渲染进程 |
| `src/lib/ipc.ts` | 修改 | 暴露新 IPC 方法 |

---

## 7. 边界情况

- **分组为空**: 空分组不生成推荐卡片
- **分组只有一个主题**: LLM 仍需推导 universal 主题，基于单主题的"边界"
- **LLM 返回重复主题**: 与现有主题去重，与当前推荐列表也去重
- **删除最后一个 session**: topic 目录下无 session 且无其他文件后，该 topic 从学习库列表消失；下次学习同名主题时会重新创建目录和 s1
- **删除正在展开的 session**: 删除后自动收起 accordion
- **网络失败**: 刷新按钮显示错误状态，可重试

---

## 8. 视觉一致性检查

- [x] 左侧色条颜色与 ribbon pill 颜色一致
- [x] 卡片圆角 (6px) 与现有 topic-row (4px) 略有区分，符合层级关系
- [x] 删除弹窗 wine 色与 tailwind.config.ts 中 `wine: #8a3a3a` 一致
- [x] 按钮 3D 阴影与现有 Button 组件 shadow 模式一致
- [x] 字体 serif/sans 分工与现有设计一致（标题 serif，正文 sans）
