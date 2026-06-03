# 寓言风格偏好对话框设计文档

## 目标

为「✨ 唤醒寓言」功能增加用户风格偏好输入环节。点击按钮后弹出对话框，用户可选择风格标签（多选）并填写补充描述，这些偏好作为 userPrompt 注入 LLM 生成过程。

## 需求决策

| 维度 | 决策 |
|------|------|
| 布局 | B · 快捷标签 + 自由补充 |
| 标签选择 | 多选（可同时选多个） |
| 标签管理 | 对话框内直接编辑（✕ 删除、+ 添加） |
| 补充描述 | 可选，只选标签也生效 |
| 记忆策略 | 只记住上次选中的标签，不记住补充描述 |
| 持久化 | `fableStyleTags` + `lastFableTags` 存入 `state.json` |
| 默认值 | `['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文']` |

---

## UI 交互设计

### 触发流程

1. 用户点击「✨ 唤醒寓言」
2. 弹出 `FableStyleDialog` 模态对话框（居中，背景遮罩 `rgba(0,0,0,0.5)`）
3. 用户选择标签（多选）+ 填写补充描述
4. 点击「开始书写」→ 保存 `lastFableTags` → 关闭对话框 → 开始 LLM 生成
5. 点击「取消」→ 不保存 → 关闭对话框

### 对话框结构

```
┌─────────────────────────────────────────┐
│ ✨ 为这则寓言注入你的意图                    │
│ 选择风格标签，或写下你自己的想法              │
├─────────────────────────────────────────┤
│ [科幻] [童话] [历史] [悬疑] [诗意散文] [+] │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 补充你的想法（可选）...                │ │
│ │ 如：主角是一位老档案管理员            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 这些描述将作为提示词与学习内容一同交给 AI    │
├─────────────────────────────────────────┤
│                    [取消] [开始书写]      │
└─────────────────────────────────────────┘
```

### 标签管理交互

- **选中/取消**：点击标签本身切换选中状态（视觉高亮：ember 色边框 + 背景）
- **删除标签**：hover 时标签右侧显示「✕」，点击删除并更新 `fableStyleTags`
- **添加标签**：底部「+」按钮点击后变为输入框，回车确认添加，Esc 取消
- **标签去重**：添加时检查是否已存在，存在则不去重（用户看到已存在的高亮标签即可）

### 按钮状态

| 场景 | 「开始书写」状态 |
|------|----------------|
| 默认 | 可用（即使什么都没选也可点击，表示不注入风格偏好） |
| 生成中 | disabled（防止重复提交） |

---

## 架构与数据流

### 状态持久化

在 `StateJson` 中添加两个字段：

```typescript
type StateJson = {
  // ... existing fields ...
  fableStyleTags: string[]   // 用户自定义的风格标签列表
  lastFableTags: string[]    // 上次选中的标签
}
```

默认值：
- `fableStyleTags`: `['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文']`
- `lastFableTags`: `[]`

### 完整数据流

```
用户点击「✨ 唤醒寓言」
        ↓
弹出 FableStyleDialog
        ↓
从 Zustand store 读取：
  - fableStyleTags（标签列表）
  - lastFableTags（上次选中，自动高亮）
        ↓
用户选择标签 + 填写补充描述
        ↓
点击「开始书写」
        ↓
保存 lastFableTags = selectedTags 到 store
        ↓
构建 userPrompt：
  const tags = selectedTags.join('、')
  const desc = userDescription.trim()
  if (tags && desc) → `风格：${tags}。${desc}`
  else if (tags) → `风格：${tags}`
  else if (desc) → desc
  else → ''
        ↓
调用 llmGenerateFableFromReport({
  reportBody, topic,
  userPrompt   // 可能为空字符串
})
        ↓
[主进程] prompt = read('fable-from-report.md')
            .replace('{{reportBody}}', args.reportBody)
            .replace('{{topic}}', args.topic)
            .replace('{{userPrompt}}',
              args.userPrompt
                ? `请根据以下用户偏好调整寓言的风格和呈现方式：\n${args.userPrompt}`
                : '')
        ↓
生成寓言 → 写入文件 → 刷新列表
```

### Prompt 模板变更

在 `electron/prompts/fable-from-report.md` 末尾添加：

```markdown
{{userPrompt}}
```

实际替换逻辑（在 `generateFableFromReport` 中）：

```typescript
const userPromptSection = args.userPrompt
  ? `请根据以下用户偏好调整寓言的风格和呈现方式：\n${args.userPrompt}`
  : ''

const prompt = read('fable-from-report.md')
  .replace('{{reportBody}}', args.reportBody)
  .replace('{{topic}}', args.topic)
  .replace('{{userPrompt}}', userPromptSection)
```

---

## 新增/修改文件清单

### 类型定义

**`src/types/index.ts`**（修改）
- `StateJson` 添加 `fableStyleTags: string[]` 和 `lastFableTags: string[]`
- `IpcApi.llmGenerateFableFromReport` 参数添加 `userPrompt?: string`

### 状态管理

**`src/store/index.ts`**（修改）
- `StateJson` 默认值添加 `fableStyleTags` 和 `lastFableTags`
- 添加 setter actions（可选，或直接在组件中用 `patchState`）

### IPC 层

**`electron/preload.ts`** — 已在 Task 2 完成，无需修改
**`src/lib/ipc.ts`** — 无需修改

**`electron/lib/llm-tasks.ts`**（修改）
- `generateFableFromReport` 参数添加 `userPrompt?: string`
- 替换 `{{userPrompt}}` 到 prompt 中

**`electron/ipc/llm.ts`**（修改）
- IPC 处理器参数添加 `userPrompt?: string`

### Prompt 模板

**`electron/prompts/fable-from-report.md`**（修改）
- 末尾添加 `{{userPrompt}}` 占位符

### UI 层

**`src/components/FableStyleDialog.tsx`**（新建）
- 模态对话框组件
- Props: `open`, `onClose`, `onConfirm(selectedTags, userDescription)`
- 内部管理标签增删改、textarea 输入

**`src/components/StudyLibrary.tsx`**（修改）
- 点击「✨ 唤醒寓言」时打开 `FableStyleDialog`
- 对话框 `onConfirm` 回调中执行生成逻辑

---

## 边界情况

| 场景 | 处理 |
|------|------|
| 用户把所有标签都删了 | 显示空列表 + 「+ 添加标签」按钮，仍可继续 |
| 用户添加了重复标签 | 不去重，用户看到已存在的高亮标签即可 |
| 标签名过长 | 截断显示（max-width），完整名 tooltip |
| 用户点了「取消」 | 不保存 `lastFableTags`，对话框关闭 |
| 用户点了「开始书写」但没选标签也没写补充 | 正常调用 LLM，`userPrompt` 为空字符串 |
| 标签列表在 store 中不存在（旧版本升级） | 使用默认标签列表 |
| 用户快速连续点击「开始书写」 | 按钮置 disabled，防止重复提交 |
| `userPrompt` 超长 | 不截断，直接传给 LLM（API 有 token 限制，但前端不处理） |

---

## 测试要点

1. 对话框弹出时显示正确的标签列表和上次选中状态
2. 点击标签切换选中状态
3. 添加新标签后出现在列表中
4. 删除标签后从列表移除
5. 点击「开始书写」后 `lastFableTags` 正确保存
6. 点击「取消」不保存 `lastFableTags`
7. Prompt 构建逻辑：四种组合（标签+描述 / 仅标签 / 仅描述 / 空）
8. `generateFableFromReport` 正确注入 `userPrompt`
9. 旧版本 store（无 `fableStyleTags`）使用默认标签
