# 会话缓存与归档链路重设计

## 背景

当前会话链路存在三个核心问题：
1. **继续学习后缓存消失**——`loadSessions()` 在启动时激进清理「topic 已有归档」的缓存文件，导致继续学习的会话返回后消失
2. **暂不归档后流式失败**——`sendOrInterrupt` 中的 `需要存档吗?` 替换逻辑导致 message 被过滤为空，API 返回 400
3. **归档触发不可靠**——边缘检测机制复杂，chunk 级别检测容易在边界条件下漏检或误检

本 spec 一次性重设计三个入口（新主题学习、继续学习、复习）的统一缓存-归档链路，简化检测逻辑，统一视觉风格。

---

## 1. 统一会话生命周期（三个入口）

所有会话共用同一条生命周期管道：

```
入口选择 → PreStudyModal（选难度/温度）→ Study 页面 → ... → 归档/返回
```

| 入口 | PreStudyModal | dirName | 初始历史 |
|---|---|---|---|
| 新主题学习 | 是（topic 为空） | 无 | `今夜想学:${topic}` |
| 继续学习 | **是**（已有 topic+dirName） | 有 | 读取 anchor 的 progress_summary |
| 复习 | 是（topic+dirName） | 有 | 读取 anchor 的 body 作为 reviewFileBody |
| 恢复未完成 | **否**（直接从 Home 点击「继续」） | 已保存 | 直接使用缓存的 history |

> **确认**：三个入口都需要选难度和温度。StudyLibrary 的「继续学习」走 PreStudyModal 重选；Home 的「继续」直接恢复已有 session（难度温度已保存）。

### 状态流转图

```
┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   startSession │ → │ kickoffSession │ → │ 对话进行中   │
│  (创建session) │   │  (触发首条AI)  │   │             │
└──────────────┘     └──────────────┘     └──────┬──────┘
                                                  │
                    ┌─────────────────────────────┼─────────────┐
                    │                             │             │
                    ▼                             ▼             ▼
              ┌──────────┐               ┌────────────┐  ┌──────────┐
              │ 用户点击  │               │ AI 问      │  │ 用户发送  │
              │ 返回      │               │ 需要存档吗? │  │ 新消息    │
              └────┬─────┘               └─────┬──────┘  └────┬─────┘
                   │                            │              │
                   ▼                            ▼              ▼
            ┌─────────────┐              ┌──────────┐    ┌──────────┐
            │saveCurrent  │              │显示归档  │    │sendOrInt-│
            │Session()    │              │banner    │    │errupt()  │
            │(写入磁盘)   │              │          │    │          │
            └──────┬──────┘              └────┬─────┘    └────┬─────┘
                   │                          │               │
                   ▼                          ▼               ▼
            ┌─────────────┐              ┌──────────┐    ┌──────────┐
            │ resetSession │         [暂不归档]    │    │ LLM 回复  │
            │ (回首页)     │              │        │    │          │
            └─────────────┘              ▼        │    └──────────┘
                                    ┌──────────┐  │         ↑
                                    │dismissArc│  │         │
                                    │hive()    │  │    [循环]
                                    └──────────┘  │
                                                  ▼
                                           [归档此次学习]
                                                  │
                                                  ▼
                                           ┌──────────┐
                                           │显示Loading│
                                           │全屏遮罩   │
                                           └────┬─────┘
                                                │
                                                ▼
                                           ┌──────────┐
                                           │finalize  │
                                           │AndReturn │
                                           │Home()    │
                                           └────┬─────┘
                                                │
                                                ▼
                                           ┌──────────┐
                                           │写库+删缓存│
                                           └────┬─────┘
                                                │
                                                ▼
                                           ┌──────────┐
                                           │弹出报告  │
                                           │模态框    │
                                           └────┬─────┘
                                                │
                                          [结束学习]
                                                │
                                                ▼
                                           ┌──────────┐
                                           │reset +   │
                                           │回首页    │
                                           └──────────┘
```

---

## 2. 缓存策略

### 磁盘存储（主进程）

- **位置**：`~/.studyparlor/sessions/${topic}.json`
- **命名**：`${topic.replace(/[^\w一-龥]/g, '_')}.json`
- **排序**：按 mtime（修改时间）降序，最新的在前面
- **内容**：完整的 `UnsavedSession` 对象（含 id/mode/topic/dirName/difficulty/temperature/history）

### 何时写入

| 时机 | 行为 |
|---|---|
| 每次 `llm:done`（流完成） | `session-runtime.ts` 自动调用 `saveCurrentSession()` |
| 用户点击返回（onBack） | `Study.tsx` 调用 `saveCurrentSession()` |
| **空对话不写入** | `history.length === 0` 时跳过 |

### 何时删除

| 时机 | 行为 |
|---|---|
| 归档成功 | `finalizeAndReturnHome()` 调用 `removeUnsavedSession()` |
| 用户点击「丢弃」 | `Home.tsx` 调用 `removeUnsavedSession()` |
| 启动时保守清理 | 删除 **文件损坏** 或 **history 为空的 stub**（新增逻辑）|

> **关键决策**：不再在 `loadSessions()` 中按「topic 是否已有归档」清理孤儿文件。这是之前继续学习缓存消失的根因。

### store 刷新

`saveCurrentSession()` 写入磁盘后，**立即调用 `loadSessions()` 刷新 `store.unsavedSessions`**，确保返回首页后列表即时更新。

---

## 3. 归档触发机制（逐消息检测）

### 新机制

```typescript
// finishStreaming: 流完成后检测最后一条 AI 消息
finishStreaming: () => set(s => {
  if (!s.session) return s
  const lastMsg = s.session.history[s.session.history.length - 1]
  const archivePending = lastMsg?.role === 'assistant' && 
                         lastMsg.content.includes('需要存档吗?')
  return { session: { ...s.session, streaming: false, archivePending } }
})
```

### 对比

| | 旧机制（边缘检测） | 新机制（逐消息检测） |
|---|---|---|
| 检测时机 | 每个 chunk | streaming 完成后 |
| 检测逻辑 | `!before.includes(phrase) && after.includes(phrase)` | `lastMsg.content.includes(phrase)` |
| archivePending 粘性 | 是（需显式 dismiss） | 否（每次重新计算） |
| 需要历史过滤 | 是（防止自应和） | **否** |
| 复杂度 | 高 | 极低 |

### dismissArchive 行为

```typescript
dismissArchive: () => set(s =>
  s.session ? { session: { ...s.session, archivePending: false } } : s
)
```

清除 flag，但**保留消息内容**在聊天历史中。下一条 AI 消息如果又问，再次弹出 banner。

---

## 4. 归档流程

### 触发

用户点击 banner 中的「归档此次学习」按钮 → 调用 `finalizeAndReturnHome()`。

### Loading 状态（方案 A：全屏遮罩）

归档过程中显示全屏遮罩：
- 背景：`#2a1f1af2`（深褐 95% 不透明度）
- 旋转器：48px 圆环，`#e8d5b722` 底色 + `#d97757` 顶部高亮
- 标题：`正在凝结记忆…`（站酷小薇/Noto Serif SC）
- 副标题：`AI 正在整理此次学习的笔记`
- 进度条：200px 细线，`#d97757` 脉冲动画
- **阻断所有交互**

### 归档操作

| 模式 | 操作 |
|---|---|
| progress | `llmFinalizeProgress` → `writeProgressMd` → `llmGenerateFable` → `writeTranscript` |
| review | `llmFinalizeReview` → `writeReviewReport` |

### 归档成功后的清理

1. 删除该 topic 对应的 `sessions/*.json` 缓存文件
2. 刷新 `library`（调用 `scanLibrary`）
3. 弹出报告展示模态框

---

## 5. 报告展示模态框（方案 B：全屏沉浸）

### 结构

```
┌─────────────────────────────────────┐
│  《标题》— 报告类型            [×]   │  ← header
├─────────────────────────────────────┤
│ ─────────── 章节名 ───────────      │  ← 装饰分隔线
│                                     │
│  报告正文内容...                     │  ← body（滚动区域）
│                                     │
│  「引用块样式」                      │
│                                     │
│  ◆ 知识缺口项                       │
│  ◆ 知识缺口项                       │
│                                     │
├─────────────────────────────────────┤
│          [本次学习结束]             │  ← footer
└─────────────────────────────────────┘
```

### 样式

- **背景**：`#1a120f`（比 ink 更深的深褐）
- **标题**：站酷小薇/Noto Serif SC，`#e8d5b7`
- **章节分隔线**：`─ 章节名 ─` 居中，`#e8d5b744`
- **章节标题**：`#d97757`，左侧 2px 竖线，`padding-left: 0.6rem`
- **引用块**：左侧 2px `#d9775744` 边框，斜体，`#e8d5b799`
- **知识缺口**：`◆` 标记（`#8a3a3a`），列表无圆点
- **关闭按钮**：右上角 `×`，`#e8d5b766`
- **结束按钮**：底部居中，`#d97757` 填充，`#1a120f` 文字，无圆角

### 内容来源

| 模式 | 展示内容 |
|---|---|
| progress | `llmFinalizeProgress` 返回的 `body`（学习报告正文）|
| review | `llmFinalizeReview` 返回的 `summary` + `gaps`（复习摘要+知识缺口）|

### 关闭行为

点击「本次学习结束」→ `resetSession()` → 回到首页。

---

## 6. 归档 Banner（AI 问「需要存档吗?」时）

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   AI 询问是否归档此次学习                       │
│                                   [暂不归档] [归档此次学习] │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **背景**：`#d9775711` + 边框 `#d9775744`
- **文字**：Noto Serif SC，`#e8d5b7cc`
- **暂不归档**：ghost 按钮，边框 `#e8d5b744`，hover `#e8d5b7`
- **归档此次学习**：ember 填充按钮 `#d97757`，文字 `#1a120f`

---

## 7. 删除的旧逻辑

| 文件 | 删除内容 |
|---|---|
| `src/store/index.ts` | `appendChunk` 中的 `beforeContent/afterContent` 边缘检测逻辑 |
| `src/lib/session-runtime.ts` | `sendOrInterrupt` 中的 `.replace(/需要存档吗\?/g, '')` 历史过滤 |
| `electron/lib/session-persist.ts` | `loadSessions` 中按「topic 是否已有归档」删除缓存的逻辑 |

---

## 8. 不变的部分

| 项目 | 说明 |
|---|---|
| 两套 archive prompt | `archive-progress.md` 和 `archive-review.md` 保持独立 |
| 归档文件格式 | `.md` + frontmatter，路径结构不变 |
| LLM 调用参数 | temperature 仍参与 API 调用 |
| 会话历史截断 | `MAX_PAIRS = 30` 保持不变 |
| `isSending` 锁 | 防止重复提交的机制不变 |

---

## 9. 变更文件清单

| 文件 | 变更类型 | 变更内容 |
|---|---|---|
| `src/store/index.ts` | 修改 | 删除边缘检测，改为逐消息检测；saveCurrentSession 后刷新 unsavedSessions |
| `src/lib/session-runtime.ts` | 修改 | 删除历史过滤逻辑 |
| `src/lib/finalize.ts` | 修改 | 归档成功后弹出模态框（需新增状态） |
| `src/pages/Study.tsx` | 修改 | 新增 Loading 全屏遮罩组件；归档成功后显示模态框 |
| `src/pages/Home.tsx` | 不变 | 当前实现已满足需求 |
| `electron/lib/session-persist.ts` | 修改 | 删除激进孤儿清理 |
| `src/types/index.ts` | 可能修改 | 如需新增 `archiveResult` 状态 |
| 新增组件 | 新增 | `ArchiveReportModal.tsx`（全屏沉浸式报告展示） |
| 新增组件 | 新增 | `ArchiveLoadingOverlay.tsx`（全屏遮罩 Loading） |

---

## 10. 视觉风格统一

所有新增 UI 遵循 Disco Elysium 暗色仪式感风格：
- **主背景**：`#2a1f1a`（ink）/ `#1a120f`（更深）
- **主文字**：`#e8d5b7`（parchment）
- **强调色**：`#d97757`（ember）
- **字体**：Noto Serif SC / 站酷小薇（标题）
- **圆角**：2px（几乎无圆角）或 0
- **边框**：低不透明度 parchment（`#e8d5b722` ~ `#e8d5b744`）
