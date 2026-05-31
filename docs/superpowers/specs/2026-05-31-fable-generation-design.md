# 寓言生成功能设计文档

## 目标

为学习库中**已有学习报告但缺少寓言文件**的 session，提供一键生成功能。用户点击「✨ 唤醒寓言」按钮，应用读取该 session 的学习报告，调用 LLM 生成寓言，写入文件后刷新列表。

## 需求决策

| 维度 | 决策 |
|------|------|
| 输入来源 | 只读学习报告 body（不作为对话历史传入） |
| 按钮布局 | A · 思想觉醒：灰色「寓言」直接替换为「✨ 唤醒寓言」 |
| 生成反馈 | 按钮变 loading（旋转动画 + 「正在书写...」），点击可取消 |
| Prompt | 新建 `fable-from-report.md`，融合现有 `fable.md` 结构 |
| Frontmatter | 保持现有 `writeFable` 输出结构（`type=fable`, `source_topic`） |
| 文件命名 | 统一中文 `寓言.md`，扫描正则 `^寓言(\d+)?\.md$` |
| 架构 | 新增专用 IPC `llmGenerateFableFromReport` |
| 失败处理 | `showToast("寓言书写失败")`，按钮恢复为「✨ 唤醒寓言」 |
| 超时 | 不设超时，用户手动取消 |
| 取消 | 渲染层标记忽略，LLM 请求继续但结果被丢弃 |

---

## UI 交互设计

### 按钮状态机

| 状态 | 显示 | 行为 |
|------|------|------|
| `hasFable=true` | 「寓言」（现有样式，可点击查看） | 同现有，打开 `SessionViewer` |
| `hasFable=false` | 「✨ 唤醒寓言」（ember 色边框，hover 亮） | 点击触发生成 |
| `generating=true` | 旋转动画 + 「正在书写...」+ 取消图标 | 点击取消，渲染层标记忽略，LLM 请求继续但结果丢弃 |

### 生成中状态管理

使用组件级 `Set<string>`（key = `dirName-sessionNumber`），不需要 Zustand 全局状态。

```typescript
const [generatingFables, setGeneratingFables] = useState<Set<string>>(new Set())

// key 示例: "machine-learning-s1"
const key = `${dirName}-s${sessionNumber}`
const isGenerating = generatingFables.has(key)
```

### 生成完成

调用 `ipc.scanLibrary()` 刷新 library，按钮自动变为「寓言」（可点击查看）。

### 错误边界

- **学习报告不存在 / 读取失败**：toast 「学习报告不存在，无法唤醒寓言」，按钮恢复
- **LLM 调用失败 / JSON 解析失败**：toast 「寓言书写失败」，按钮恢复
- **用户取消**：静默恢复，不 toast

---

## 架构与数据流

```
用户点击「✨ 唤醒寓言」
        ↓
[渲染进程] readSessionFile({ dirName, sessionNumber, fileName: reportFile }) → 获取 { content }
        ↓
[渲染进程] 用 gray-matter 解析 content → { frontmatter, body }
        ↓
[渲染进程] llmGenerateFableFromReport({
              reportBody: body,
              topic: frontmatter.title || topic.title
            })
        ↓
[主进程] generateFableFromReport(cfg, {reportBody, topic})
        ↓
[主进程] chatNonStream + fable-from-report.md prompt
        ↓
[主进程] 返回 {title, body}
        ↓
[渲染进程] writeFable({dirName, sessionNumber, title, body})
        ↓
[主进程] 写文件 寓言.md（type=fable, source_topic=title）
        ↓
[渲染进程] scanLibrary() → 刷新 library
        ↓
UI 按钮状态从 generating → 可点击「寓言」
```

---

## 新增/修改文件清单

### Prompt 模板

**`electron/prompts/fable-from-report.md`**（新增）

基于现有 `fable.md` 结构，输入从对话历史改为学习报告 body：

- 从报告中提取核心概念
- 用故事/寓言间接讲授（不直接说概念名）
- 故事到结尾才点破概念
- 故事后补充一段精确解释（点破隐喻）
- 1500-3000 字，文学性强，中文
- 输出纯 JSON：`{ title, body }`

### 类型定义

**`src/types/index.ts`**（修改）

```typescript
// 新增到 IpcApi
generateFableFromReport: (args: {
  reportBody: string
  topic: string
}) => Promise<{ title: string; body: string }>
```

### IPC 层

**`electron/preload.ts`**（修改）
- 暴露 `llmGenerateFableFromReport` → `ipcRenderer.invoke('llm:generateFableFromReport', args)`

**`electron/ipc/llm.ts`**（修改）
- 新增 IPC 处理器 `'llm:generateFableFromReport'`
- 调用 `generateFableFromReport(cfg, args)`

**`electron/lib/llm-tasks.ts`**（修改）
- 新增 `generateFableFromReport(cfg, args)` 函数
- 读取 `fable-from-report.md`，替换 `{{reportBody}}` 和 `{{topic}}`
- 复用现有的 `chatNonStream` 调用和 JSON 解析逻辑

### UI 层

**`src/components/StudyLibrary.tsx`**（修改）
- `SessionRow`：当 `!hasFable` 且 `hasReport` 时，显示「✨ 唤醒寓言」而非灰色禁用按钮
- 当 `hasReport=false` 时，仍显示灰色禁用「寓言」（无报告则无上下文）
- 维护 `generatingFables` Set 状态
- 点击触发 `handleGenerateFable(dirName, sessionNumber)`
- 取消时标记 `cancelledRef = true`，LLM 返回后检查该标志，已取消则不写入文件
- 成功/失败后更新 Set 并 `scanLibrary()`

---

## 边界情况

| 场景 | 处理 |
|------|------|
| Session 无学习报告 | 按钮显示为灰色禁用「寓言」（无报告则无上下文） |
| 学习报告文件已丢失（reportFile 存在但 readSessionFile 失败） | toast 「学习报告不存在」，按钮保持「✨ 唤醒寓言」 |
| 生成中切换页面/折叠 topic | generatingFables 是组件级 state，组件卸载后重新挂载会丢失进度。接受此限制——重新打开 accordion 时若生成仍在后台继续，scanLibrary 刷新后按钮会自动变为「寓言」 |
| 同时点击多个 session 的生成 | `generatingFables` 是 Set，支持并行多个生成 |
| LLM 返回空内容 | 同 `finalize` 路径的 fallback：toast 失败，按钮恢复 |
| writeFable 写入失败 | toast 「寓言保存失败」，按钮恢复 |
| 用户快速取消后立即再次点击 | 前一个请求仍在后台运行，但 `cancelledRef` 标记已忽略其结果；新请求独立发起，无冲突 |

---

## 与现有 finalize 路径的关系

| 维度 | finalize 自动生成 | 手动触发（本功能） |
|------|------------------|-------------------|
| 触发时机 | 会话结束归档时 | 用户在学习库手动点击 |
| 输入来源 | 对话历史 | 学习报告 body |
| Prompt | `fable.md` | `fable-from-report.md` |
| IPC | `llmGenerateFable` | `llmGenerateFableFromReport` |
| 取消 | 不支持 | 支持（AbortController） |
| UI 反馈 | 无（后台静默） | 按钮 loading + 可取消 |

两者**完全独立**，互不干扰。`fable.md` 和 `fable-from-report.md` 各管一条链路。

---

## 测试要点

1. 有报告的 session：显示「✨ 唤醒寓言」，点击后成功生成，按钮变为「寓言」
2. 无报告的 session：显示灰色禁用「寓言」
3. 已有寓言的 session：显示「寓言」，点击可查看
4. 生成中取消：按钮恢复为「✨ 唤醒寓言」，无 toast
5. 生成失败：toast「寓言书写失败」，按钮恢复
6. 报告文件丢失：toast「学习报告不存在」，按钮恢复
7. 多个 session 同时生成：各自独立，不互相干扰
8. 生成完成后 library 自动刷新
