---
title: 写作助手 Agent 标准与原生工具循环重构
type: design
date: 2026-08-10
---

# 写作助手 Agent 标准与原生工具循环重构

## 背景与问题诊断

写作助手在 8.9 日记会话（`写作/日记/8.9.assistant.md`）中暴露 5 个问题，全部有代码级与记录级证据：

1. **读不到当前文章正文（根因）**：渲染层把全文放进 user 消息的 `snapshot` 字段（`src/store/index.ts` sendWritingAssistantMessage）并传 IPC 参数 `articleContent`，但主进程 `electron/lib/writing-assistant/loop.ts` 组装 LLM 历史时只取 `role`+`content`（`snapshot` 被剥），`electron/ipc/writing-assistant.ts` 解构 `articleContent` 后从未使用。记录铁证：第二轮回助手说"我还没看到内容，请把那段原文贴出来"，尽管正文就在 snapshot 里。
2. **read_local 双重前缀路径 bug（S2）**：catalog key 是相对库根路径（`writing/我的问题与诊断/问题总结.md`），`prompt.ts` 拼成 `writing:writing/...`，`tools.ts` resolveSourcePath 又 `path.join(lib,'writing',idPath)` → `<库>/writing/writing/...` 必然不存在。**所有 writing/repository 资源实际都读不到**。
3. **读失败后无根编造（S3）**：问题 2 导致文件读不出来，助手却声称"回顾你诊断出的核心问题"给出了一套合理但不属于该文件的"4 大诊断"（从目录摘要扩写）。输出听起来对，用户无法察觉未读到文件。
4. **一次完全无输出（loop 故障）**：第一轮助手输出 reasoning + 两次 `read_local` 标记后没有任何正文，用户被迫发"然后呢？"才拿到回答。根因：旧围栏循环（`loop.ts` 的 `createToolBuffer`）不保证"最后必出正文"——模型工具结果后只吐 reasoning 不吐正文时，`takeTool()` 返回 null、`flush()` 为空 → `return` 静默收场；无空输出检测、无最终回答保障。
5. **插入功能不可控（S4）+ 记录膨胀（S5）**：`insert_into_article` 是追加到文档末尾的粗粒度写入；每条 user 消息把全文 snapshot 原样写入 `.assistant.md`。

## 目标

- 建立并落成 5 条 Agent 标准（S1-S5），每条明确由代码还是系统提示词承载。
- 将工具循环从 markdown 围栏解析重构为**原生 function-calling**，确定性收尾。
- 修复"无输出"故障：循环保证最终必出正文（或显式上报空输出）。
- 移除一切正文写入路径（插入按钮 + `insert_into_article` 工具）。

## 明确不做

- 不做正文插入（本次彻底移除）。
- 不重构 `scout` / 旁注助手（`article-assistant`）的工具机制——它们是独立功能域。
- 不加"复制"按钮，助手消息保持纯文本。
- 不做完整会话历史截断（保持现状，快照单份注入保证记忆）。

## Agent 标准规范（S1-S5）

| # | 标准 | 承载层 | 落点 |
|---|------|--------|------|
| S1 | 上下文主权：对某文章首次运行必读全文；此后点亮快照按钮才刷新 | CODE | store 条件挂 `snapshot`（首轮强制、点亮轮刷新）；loop `injectLatestSnapshot` 找最近快照注入系统提示词；📄 按钮为 UI 状态 |
| S2 | 资源可读一致：目录列出的 id 必须真实可读 | CODE | `prompt.ts` 生成干净 id（去掉 relPath 自带的 `writing/`/`repository/` 前缀）；`tools.ts` resolveSourcePath 解析前 strip 冗余前缀 |
| S3 | 引用可信：未读到的内容不得当已读输出 | HYBRID | CODE：`tools.ts` 失败结果加"⚠️ 未读到内容，请勿引用"标记；SYSTEM PROMPT：加"读失败→重试一次→再失败明说，禁止引用未读内容"规则 |
| S4 | 最小工具面：助手只读不写正文 | CODE | 原生工具定义只含 `read_local` +（🔍开启时）`web_search`；UI 删插入按钮 |
| S5 | 记录经济：快照只落首轮+点亮轮；思考保留默认折叠 | CODE | store 条件挂 `snapshot`（序列化复用现有）；reasoning 折叠现状保留 |
| loop | 原生工具循环 + 最终回答保障 + 空输出上报 | CODE（结构）+ SYSTEM PROMPT（策略） | `kimi.ts` 原生工具 SSE 解析；`loop.ts` 状态机（依赖注入可单测）；`prompt.ts` 只写何时用工具与引用规则 |

**工具契约单一来源**：工具 schema（name/description/parameters JSON Schema）只在 CODE 定义；系统提示词只写"何时用、引用规则"，不写调用语法，杜绝两者不同步。

## Agent loop 设计（原生 function-calling）

```
runWritingAssistantTurn(cfg, args, deps?)
  system = injectLatestSnapshot(系统提示词, args.messages)   # S1
  history = [{system}] + args.messages.map(role+content 纯文本)
  for round = 0 .. MAX_TOOL_CALLS(=3):
    { content, toolCalls, finishReason } =
      deps.chat(cfg, { messages: history, tools: TOOL_DEFS, thinking: effort }, onChunk, onReasoning)
    # content 已流式上屏；toolCalls 为原生结构化结果
    if toolCalls.length == 0:                      # finish_reason ∈ {stop, length}
      if content 为空:  send llm:error {code:'CHAT_EMPTY_REPLY'} → UI 显式"回复失败/重试"，不再静默 → return
      return                                      # 正常收尾；length 截断时部分内容已上屏即视为完成（本次不额外提示）
    if round == MAX:                              # 工具次数用尽
      history.push(user: "工具调用已达上限，请直接基于已有信息回答。")
      deps.chat(cfg, { messages: history, tools: undefined, thinking: disabled }, onChunk, onReasoning)
      return                                      # 必出最终正文
    for call in toolCalls:
      send tool start 事件 → toolResult = deps.executeTool(cfg, call)
      send tool done 事件
      history.push(assistant: "（调用工具：x）", user: "工具结果：\n{toolResult.text}")
```

**确定性来源**：原生 API 在"要调工具"时返回 `finish_reason='tool_calls'` + 结构化 `tool_calls`；"回答完"返回 `finish_reason='stop'` + `content`。循环不再解析文本围栏。**无论走多少轮，最后一轮必是纯回答**（工具用尽强制逼答；`stop` 即答完）。空输出有显式出口（`CHAT_EMPTY_REPLY`）；`length` 截断时部分内容已上屏即视为完成，本次不额外提示。

## 工具契约

- `read_local`：`{ ids: string[] }` — 读取本地资料（id 必须来自目录）。
- `web_search`：`{ query: string }` — **仅在 🔍 开关开启时注入工具定义**；关闭时从 `TOOL_DEFS` 移除，模型不知道有此工具。
- 单轮最多 `MAX_TOOL_CALLS`(3) 次工具调用。

## S1 快照机制细节

- `sendWritingAssistantMessage` 挂 `snapshot` 的条件：会话无历史消息（首轮，强制）或 📄 按钮点亮（刷新）。快照按钮默认关，切换文章时重置。
- `injectLatestSnapshot`：从后往前扫 user 消息，取最近一条带非空 `snapshot` 的，追加 `## 当前文章全文快照\n{snapshot}` 到系统提示词。一次调用只注入单份（不累积进 history）。
- 未点亮轮次仍注入最近一次快照（记忆不丢）；点亮才刷新为最新正文。
- 记录文件：快照块自然只出现在首轮与点亮轮（序列化逻辑复用现有 `serializeAssistantSessionBody`）。

## 文件改动

| 文件 | 改动 |
|---|---|
| `electron/lib/kimi.ts` | `buildChatBody` 加可选 `tools`；`chatStream` 返回 `{content, toolCalls, finishReason}` 并解析 `delta.tool_calls`（additive，现有调用方忽略返回值） |
| `electron/lib/writing-assistant/tool-protocol.ts` | 删除围栏解析（`createToolBuffer`/`extractToolCall`）；定义原生 `NativeToolCall` 与 args 解析（json-extract 守卫） |
| `electron/lib/writing-assistant/loop.ts` | 重写为上述状态机；`chat`/`executeTool` 依赖注入；空输出上报 |
| `electron/lib/writing-assistant/prompt.ts` | 生成干净 id（S2）；系统提示词改为"何时用工具/引用规则"策略，删除 ````tool` 语法；加 S3 规则 |
| `electron/lib/writing-assistant/tools.ts` | resolveSourcePath strip 冗余前缀（S2）；失败结果加"未读到内容，请勿引用"标记（S3）；删除 insert 分支 |
| `electron/ipc/writing-assistant.ts` | 传 `tools` 开关（searchEnabled）；E2E mock 改为原生流程（读一次→最终内容），删 insert 事件 |
| `src/store/index.ts` | 条件挂 `snapshot`；加 📄 按钮状态；空输出错误码映射 |
| `src/components/writing-assistant/WritingAssistantInput.tsx` | 加 📄 快照按钮（与 🔍 🧠 并列，默认关） |
| `src/components/writing-assistant/WritingAssistantMessages.tsx` | 删除"插入到编辑器 ▸"按钮 |
| `src/types/index.ts` | 错误码联合加 `CHAT_EMPTY_REPLY`（走 llm:error 通道） |

## 测试计划

**单测**：
- `tests/kimi.test.ts`：`delta.tool_calls` SSE 累积解析（index 乱序、参数分片、finish_reason 透传）；既有 SSE 用例回归。
- `tests/writing-tool-protocol.test.ts`：重写为原生 args 解析（合法/缺字段/非法工具名）。
- 新增 `tests/writing-assistant-loop.test.ts`：注入 fake chat 模拟三类场景——① 工具轮→stop 收尾；② 空输出→发 `CHAT_EMPTY_REPLY`；③ 次数用尽→强制逼答。
- `tests/writing-assistant-store.test.ts`：首轮强制挂 snapshot；第二轮未点亮不挂；点亮挂；切文章重置。
- `tests/writing-tree.test.ts` 或新增：`resolveSourcePath` 对 catalog 内每个 id 都解析到存在的文件。

**E2E**（`e2e/specs/writing-assistant.spec.ts` + POM/selectors）：
- mock 改为原生流程；删除 insert 引用（POM `insertBtn`、selectors `assistantInsertBtn`）。
- 新增断言：首次发送后 `.assistant.md` 含 `snapshot:start`；第二轮未点亮不再新增 snapshot 块；点亮后新增；插入按钮不存在。
- 删除工具调用后"无输出"静默——通过 store error 状态断言空输出上报。

**运行**：改到的单测文件 + `node scripts/e2e-changed.js --run`（禁止全量）。

## 风险与验证门

| 风险 | 缓解 |
|---|---|
| relay（deepseek-v4-pro）不支持原生 tools | **实现第一步 spike**：`curl` 带 `tools` 打 `/chat/completions` 验证返回 `tool_calls`；不支持则回退"硬化围栏"方案（保留 finish 保障），并更新本文档 |
| 改 `chatStream` 影响主会话 | 参数/返回值均 additive；`tests/kimi.test.ts` 回归 + 工具用例 |
| loop 依赖真实网络难单测 | `chat`/`executeTool` 依赖注入，fake 覆盖四类场景 |
| 原生工具与 reasoning（thinking）并存兼容 | 在 spike 中一并验证；若互斥则工具轮关闭 thinking，纯回答轮开启 |

## 验收清单（boundary/acceptance/degradation）

- [ ] 空数据：无消息时发送（input 已禁用，行为不变）；快照为空时 `injectLatestSnapshot` 跳过。
- [ ] 失败：read_local 读不到 → 标记 + S3 规则；web_search 关闭时工具定义不存在；API 出错 → 现有 `llm:error` 路径。
- [ ] 空输出：模型空 content → `CHAT_EMPTY_REPLY` 上报，UI 显示"回复失败/重试"。
- [ ] 截断：`finish_reason='length'` 且部分内容已上屏 → 视为完成，不额外提示（已知限制）。
- [ ] 旧数据兼容：已存的 `.assistant.md`（旧围栏格式）可解析、可恢复、可续聊。
- [ ] 持久化：首轮/点亮快照写入记录；跨重启经 `loadWritingAssistantSession` 恢复。
- [ ] 取消/超时：abort 与 idle timeout 行为不回归（现有 `AbortController` 链路）。
- [ ] 开关：🔍 关闭时 `web_search` 从定义移除；🧠 关闭/高/最大三态不回归。
