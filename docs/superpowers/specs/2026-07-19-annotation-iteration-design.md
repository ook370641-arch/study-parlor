# 旁注功能迭代设计（性能修复 + 三开关 + 思考过程显示）

日期：2026-07-19
状态：已批准（brainstorming 结论）

## 背景

旁注（article assistant）功能当前存在三类问题与三个新需求：

**Bug / 性能**
1. 流式输出一顿一顿、卡顿（渲染瓶颈，非 API 慢）。
2. 流式期间拖拽旁注小窗非常卡（同一根因）。
3. 选中文本后无法取消，只能发送。
4. 网络搜索开关动画是橙色染底（`bg-ember`），loading 用 ⏳，用户希望改为放大镜灰↔蓝切换。
5. 历史旁注对话根本不显示（代码里已有 `loadAssistantSession`，疑似竞态或静默吞错）。

**新功能**
1. 重开文章时自动显示之前的旁注对话上下文（= 修 bug 5）。
2. 苏格拉底 / 信息检索双模式开关；非苏格拉底模式不加载苏格拉底提示词。
3. 深度思考开关 + effort 档位（对应当前 DeepSeek V4 Pro 端点的 `thinking` / `reasoning_effort` 传参），思考过程（`reasoning_content`）以可折叠区块显示。

最终输入栏左下角共三个控制组块：网络搜索、苏格拉底模式、深度思考（三态）。

## 已确认的关键事实

- 当前 `.env`：`KIMI_BASE_URL=https://api.deepseek.com/`，`KIMI_MODEL=deepseek-v4-pro`。
- DeepSeek V4 API 契约：`thinking: {type: 'enabled'|'disabled'}`；`reasoning_effort` 实际有效值仅 `high` / `max`（`low`/`medium` 映射为 `high`，`xhigh` 映射为 `max`）。
- `electron/lib/kimi.ts` 已有 `ThinkingConfig` 与 `buildChatBody` 的 deepseek 分支，但 `reasoning_effort` 类型只声明了 `'high'`。
- 性能根因：每个 SSE chunk → IPC → `appendAssistantChunk` → 整个 `assistantSession` 新对象 → `ChatWindow` / `GuideSidebar` / `ArticleAssistantPanel` 全部重渲染（三者都订阅整个 session 对象，导读侧栏每 token 重渲整份导读）。拖拽每帧 `setPosition` 叠加其上，主线程拥塞。

## 用户已确认的决策

| 决策点 | 结论 |
|---|---|
| 流式慢的表现 | 出字一顿一顿、卡顿（渲染瓶颈） |
| 拖拽卡的对象 | 旁注聊天小窗 |
| 历史上下文 | 目前根本没显示，是 bug |
| 性能修法 | 方案 A：渲染层优化（批处理 + 收窄订阅 + memo），不动状态结构 |
| reasoning 传输 | 方案 A：新增旁注专属事件，不改 `llm:chunk` 契约 |
| effort UI | 三态循环：关 → 高 → 最高 → 关 |
| 开关持久化 | 全局持久化到 state.json，跨文章跨重启 |
| 思考过程 | 显示，灰色小字可折叠 |
| 测试策略 | 以「发给 API 的请求体」为断言对象的 E2E 请求级检验 |

## 设计

### 1. 状态与持久化

三个开关从会话级改为全局持久化（state.json）：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `assistantSearchEnabled` | boolean | `false` | 网络搜索 |
| `assistantSocraticMode` | boolean | `true` | 苏格拉底模式，默认开 = 保持现有行为 |
| `assistantThinkingEffort` | `'off' \| 'high' \| 'max'` | `'off'` | 深度思考三态 |

- 按 ipc-state §3：`state.ts` 的 `DEFAULT`、store `init`、`BASE_STATE` 三处同步加默认值；旧 state.json 缺字段时回落默认，不用 `as` 断言。
- `AssistantSession.searchEnabled`（会话级）移除，统一读全局字段；`toggleAssistantSearch` 改为写全局。
- 共享类型 `Frontmatter` 不涉及；这些是 state.json 字段不是 frontmatter。

### 2. UI 布局与交互（ChatWindow 输入栏）

输入栏左侧三个控制组块，统一「图标颜色切换」风格，不做橙色染底：

```
[🔍] [🎓] [🧠]  [ 输入框……………… ] [发送/停止]
```

1. **🔍 网络搜索**：关闭灰色（`text-parchment/40`）↔ 开启蓝色（`text-sky-400`），`transition-colors duration-200`。搜索进行中图标换 `animate-spin` 小圆环，替代 ⏳。
2. **🎓 苏格拉底模式**：同样的灰↔蓝切换。title：「苏格拉底学习模式：关闭后只做信息检索，不再质询」。
3. **🧠 深度思考（三态循环）**：点击循环 关 → 高 → 最高 → 关。关=灰色，高=蓝色，最高=蓝色 + 图标右上角「MAX」微型角标。title 显示当前档位。
4. **流式中三个开关禁用**（`disabled:opacity-30`），避免 mid-stream 改参数。
5. **取消选中**：选中引用块（"你选中了："）右上角加 ✕ 小按钮，点击调 `setAssistantSelection('')` 清除。选中保持现有粘滞行为（发送后不自动清）。
6. **思考过程显示**：消息加 `reasoning?: string` 字段，渲染为正文上方的可折叠区块（灰色小字；流式中展开，完成后默认折叠，标题「思考过程」）。
7. **历史显示修复后**：打开旁注时消息区自动滚动到底部。

### 3. IPC 与 LLM 层改动

**传参**：`articleAssistant:sendMessage` args 增加：
- `socraticMode: boolean`
- `thinkingEffort: 'off' | 'high' | 'max'`

渲染端发送时从全局 state 读出传入；主进程保持无状态，不读 state.json。

**Prompt 装配**（`electron/lib/article-assistant-prompt.ts`）：
- `buildAssistantSystemPrompt(socratic: boolean)`：`true` 用现有苏格拉底 prompt；`false` 用检索版（直接简洁回答、基于文章与搜索结果、不反问不质询）。
- `buildAssistantUserPrompt` 结尾「请给出苏格拉底式回复」一句随模式切换措辞。

**思考参数**（`electron/lib/kimi.ts`）：
- `ThinkingConfig` 的 `reasoning_effort` 扩为 `'high' | 'max'`。
- `buildChatBody` deepseek 分支已有透传；`off` → `thinking: {type:'disabled'}`（不发 `reasoning_effort`）。
- 只改旁注调用点；主会话仍传 `disabled`，行为不变。

**思考过程传输**：
- `parseSseChunk` 解析 `delta.reasoning_content`，`SseEvent` 增加 `{kind:'reasoning', text}`。
- `chatStream` 增加可选 `onReasoning` 回调（主会话不传，零影响）。
- 主进程 `articleAssistant:sendMessage` 把 reasoning 转发到新事件 `articleAssistant:reasoningChunk`。
- 新事件五层同步（types → main → preload → facade → `assistant-session-runtime` 监听），并按 ipc-state §1 加启动探测/测试断言。

**E2E mock 分支改造**（`articleAssistant:sendMessage` 的 `isE2EMock()` 路径）：
- 不再短路跳过装配，而是走真实装配链（system prompt → user prompt → `buildChatBody`），把最终请求体（model / messages / thinking / reasoning_effort）写到 `E2E_CONFIG_DIR/last-assistant-request.json`。
- 然后跳过网络，推 mock chunk（思考开启时先推 mock reasoning 再推 content）。

### 4. 性能修法（渲染层）

1. **chunk 批处理**：`assistant-session-runtime` 缓冲到达的 content/reasoning chunk，~50ms（或 rAF）flush 一次 store 更新；`done` / `error` 时强制 flush 清空缓冲。
2. **收窄订阅**：
   - `GuideSidebar`：从整个 `assistantSession` 改为只订 `guide` / `guideLoading` / `guideError` / `activeChunkIndex`。
   - `ArticleAssistantPanel`：只订 `contextId` / `isOpen` / `pendingSelection` 等所需字段。
3. **ChatWindow 拆组件**：消息列表提成 `React.memo` 组件（批处理后仅 flush 时重渲）；拖拽期间用 `transform` 直改 DOM style，`pointerup` 时落定 React state，消除每帧全窗重渲。

### 5. 「历史不显示」排查路径

按 systematic-debugging 先复现再定位，嫌疑清单（按可能性排序）：

1. **竞态**：`openAssistantSession` 先置 `messages: []` 再异步 `loadAssistantSession`；后者有 `cur.messages.length === 0` 守卫——若加载返回时用户已发消息（或任何原因 messages 非空），历史被静默丢弃。
2. **静默吞错**：`articleAssistant:readSession` 的 `catch { return null }`——解析失败无日志。排查时加临时日志确认是否走到这里。
3. **格式假设**：`parseAssistantSessionBody` 按 `^## 用户/助手` 拆分，核对实际写入的 `.assistant.md` 格式。
4. **写入时机**：`saveAssistantSession` 只在流结束/中止时调用，确认 `.assistant.md` 确实落盘。

修复后行为：重开文章 → 历史消息显示 → 自动滚到底。

## 验收标准

### 单元测试（Vitest）

- `parseSseChunk`：含 `reasoning_content` 的 SSE 行 → `{kind:'reasoning', text}`。
- `buildChatBody` deepseek 三态：`off` → `thinking.type==='disabled'` 且无 `reasoning_effort`；`high`/`max` → enabled + 对应值。（作为请求级断言的补充，失败时区分装配层 vs 传输层）
- chunk 批处理：fake timers 下 N 次 chunk 只触发 1 次 store 更新；done 时缓冲清空。
- 旧 state.json 缺三个新字段 → 默认值回落，不白屏。

### E2E（扩展 `e2e/specs/article-assistant.spec.ts`，走 mock 分支）

**请求入参检验**（读 `last-assistant-request.json`，按开关组合参数化）：

| 开关状态 | 断言 |
|---|---|
| 苏格拉底 开 | system 消息含苏格拉底质询措辞 |
| 苏格拉底 关 | system 不含质询措辞，含「直接回答」类检索措辞 |
| 深度思考 关 | `thinking.type === 'disabled'`，无 `reasoning_effort` |
| 深度思考 高 / 最高 | `thinking.type === 'enabled'` 且 `reasoning_effort === 'high' / 'max'` |
| 已有历史对话 | user prompt「历史对话」段包含之前轮次内容 |
| 搜索 开 | user prompt 含「网络搜索结果」段 |

**交互断言**：
- 三开关渲染、点击切换、`aria-pressed` / computed color（灰↔蓝）断言。
- 三开关跨重启持久化。
- ✕ 取消选中后引用块消失。
- 二次打开文章历史消息可见。
- mock 推 reasoning + content → 思考区块出现且可折叠。

### 手动验收

- 真实 API 下流式出字流畅不顿。
- 流式中拖拽旁注小窗跟手。
- `high` vs `max` 回复深度有可感知差异。
- 关苏格拉底后检索问题不再被反问。

## 明确不做（YAGNI）

- 不改主会话（session-runtime）的任何流式/思考行为。
- 不做 low/medium 档（DeepSeek V4 会映射为 high，无实际意义）。
- 不做按文章记忆开关状态（已确认为全局持久化）。
- 不把思考过程写入 `.assistant.md`：`reasoning` 字段仅运行时展示，会话文件格式与 `parseAssistantSessionBody` 不变；历史回显只显示问答正文，不显示当时的思考过程。
- 不重构 `assistantSession` 状态结构（方案 B 已否决）。
