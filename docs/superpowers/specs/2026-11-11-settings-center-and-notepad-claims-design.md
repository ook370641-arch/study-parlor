---
status: planned
---

# 设置中心与记事板 Agent 认领设计（2026-11-11）

## 1. 范围与已确认方案

本设计只承接迭代记事板第 4、5 项：

- `nmwav1fn9hd8r`：移除烛光随行，把卷宗、扩展整合进设置中心，并让卷宗进入应用内所有 AI 生成提示词。
- `nmwav48ouhbvs`：记事板增加 Agent 认领标记、空上下文接单协议和当天完成高亮。

用户已在视觉稿中确认：

1. 设置中心采用 **C 三栏工作台**，不是左侧单栏或顶部标签方案。
2. 「常规」在中栏拆成 **AI 与搜索 / 界面与画作 / 学习库与归档** 三个子页。
3. 记事板的认领标记与「今日完成 · 待测试」高亮均按视觉稿实施。

第 1–3 项（对照生成笔记、章节笔记标识、书籍展开状态）不在本设计与实现范围内。

## 2. 功能盘点与迁移映射

整合时保留现有能力，不用重写功能换 UI。现有入口与子页按下表迁移：

| 现有位置 | 现有能力 | 新位置 |
|---|---|---|
| Settings / AI 服务 | 多 LLM 配置、新增、切换、模型探活、连接验证 | 常规 → AI 与搜索 |
| Settings / 联网搜索 | Tavily Key 读取状态、保存与更新 | 常规 → AI 与搜索 |
| Settings / 画作 | 封面画作删除按钮显隐 | 常规 → 界面与画作 |
| Settings / 信息入口 | 六个 Demo 信息入口显隐，保留已编辑文案 | 常规 → 界面与画作 |
| Settings / 学习库 | 路径查看、目录选择、保存后重启提示 | 常规 → 学习库与归档 |
| Settings / 已归档主题 | 列出与恢复归档主题 | 常规 → 学习库与归档 |
| Extension / 学习库 | 学习库与目录结构说明 | 常规 → 学习库与归档，不在扩展重复保留 |
| Profile | 代号、侧写、偏好领域、学习难度、创作温度的查看与改写 | 卷宗 |
| Extension / 我的语言 | 术语查看、编辑与实时预览 | 扩展 → 我的语言 |
| Extension / 自选配图 | 配图数量与手动添加说明 | 扩展 → 自选配图 |
| Extension / 本地 Agent 打通 | 本地 Agent 接入说明 | 扩展 → 本地 Agent 打通 |

首次配置向导、主题切换、学习库文件读写规则保持不变。

## 3. 设置中心布局与导航

### 3.1 三栏结构

设置仍为全屏页面，内容容器在全屏下使用约 `max-w-7xl`，保留现有暗色纸张/报纸主题与圆角面板风格。

- **左栏：一级分类**。固定为「常规 / 卷宗 / 扩展」，每项附一句用途说明。
- **中栏：上下文子导航**。常规显示三个子页；扩展显示「我的语言 / 自选配图 / 本地 Agent 打通」；卷宗只显示卷宗入口及「供所有 AI 生成参考」说明，不再拆碎表单。
- **右栏：当前任务内容**。每次只呈现一个子页，避免现有 Settings 所有卡片堆成一张长页。

打开设置默认进入「常规 → AI 与搜索」。一级分类和子页均为页面内本地状态，不新增持久化字段。卷宗查看/改写、扩展滚动与各设置保存逻辑沿用现有实现。

### 3.2 入口与返回

- 主页删除独立「卷宗」「扩展」按钮，只保留一个「设置」入口。
- 简报左栏原「烛光随行」位置改为同尺寸、同边框体系的设置图标按钮。
- 封面布局不新增设置按钮，记事板入口位置不变。
- `settingsReturnTo` 继续记录来源页；从简报进入后返回报简报，从主页进入后返回主页。
- 删除 `profile`、`extension` 两个独立页面路由及 App 懒加载入口；旧页面功能先迁入设置组件再移除路由。

### 3.3 组件边界

- `src/pages/Settings.tsx`：只负责三栏外壳、导航、来源返回和当前分类。
- `src/components/settings/GeneralSettings.tsx`：承载三个常规子页，复用 `LlmConfigCard` 与现有 IPC。
- `src/components/settings/ProfileSettings.tsx`：迁入卷宗查看与编辑。
- `src/components/settings/ExtensionSettings.tsx`：迁入三个扩展子页。

优先保留现有控件的 `data-testid`，减少无关测试改写；新增导航使用独立、稳定的 testid。

## 4. 移除烛光随行

移除的是鼠标跟随光层及其附属行为，不删除画作名称或普通暖橙配色：

- 删除 `CandlelightLayer` 及 `Briefing.tsx` 挂载。
- 删除简报侧栏烛光开关，新增设置入口。
- 删除 store 的 `candlelightEnabled` / `toggleCandlelight`、`StateJson.candlelightEnabled` 和相关迁移读取。
- 删除 `.candle-glow`、`.cursor-hidden`、烛光标注辉光等专属 CSS 与 `candlelight-layer` 测试。
- 更新 `.claude/rules/ui-styling.md`，不再把 CandlelightLayer 登记为当前光效语言。

本设计同时作为该功能的移除记录；历史 spec/plan 不改写历史正文，落地时按文档协议维护状态与索引。

## 5. 卷宗进入所有 AI 生成提示词

### 5.1 统一注入

在 Kimi 请求链路统一注入，而不是逐功能补字段：

1. 新增纯函数 `withProfilePrompt(messages, profile)`，只注入非空的代号、侧写、偏好领域。
2. `electron/lib/kimi.ts` 的非流式与流式对话入口根据 `cfg.libraryPath` 读取卷宗，并调用该函数。
3. 已有 system 消息时追加统一格式的「学习者卷宗」段；没有 system 消息时新增一条，再保留原消息顺序。
4. 三个字段均为空时原样返回。模型列表等无对话请求天然不受影响。

这样学习辅导、归档、寓言、推荐、书籍/文章导读、笔记正文与封面、图表、写作助手及未来经过同一入口的新功能都不会漏接。

### 5.2 去重与容错

- 删除 `assemblePrompt` 末尾的旧画像段、wild-card 中重复的画像占位，以及 group inspiration 已无实际模板占位的画像替换代码。
- 同步清理仅为旧注入服务的 renderer 传参和类型，避免同一卷宗出现两次。
- 画像读取沿用 `loadProfile` 现有容错；空卷宗不阻断任何生成。
- 不新增每功能开关，不把 API Key、学习库路径等无关配置写入提示词。

## 6. 记事板 Agent 认领

### 6.1 为什么使用独立认领文件

运行中的应用会在 renderer 内保存 `notepadItems`，外部直接改写 `state.json` 仍可能被旧数组覆盖。因此认领记录不写入待办数组，而放在同一状态目录的 `notepad-claims.json`：

```ts
type NotepadClaim = { claimedBy: string; claimedAt: string }
type NotepadClaimsFile = Record<string, NotepadClaim>
```

key 为待办 id。`NotepadItem` 在 `state:get` 返回时临时叠加可选 `claim`，磁盘上的 `state.json` 待办结构不变。认领文件继续使用现有 `safeReadJson` / `safeWriteJson` 的备份与原子写入。

### 6.2 读取、刷新与清理

- `state:get` 只把待办当前 id 对应的认领叠加到返回结果，历史残留不可见。
- `state:patch` 收到新 `notepadItems` 后清理已删除或已归档 id 的认领。
- `claim` 仅是读取时叠加的视图字段；renderer 写回 items/log 前必须剥离它，不能把认领副本写进 `state.json`。
- 记事板打开时调用 `refreshNotepad` 重新读取 items/log；面板打开期间窗口重新获得焦点时也刷新。
- 不新增文件监听器或轮询。Agent 在后台认领后，用户重新打开面板或切回窗口即可看到标记。

### 6.3 Agent 命令与冲突规则

新增 `scripts/notepad-claim.cjs`：

```bash
node scripts/notepad-claim.cjs claim <item-id> <agent-name>
node scripts/notepad-claim.cjs claim <item-id> <agent-name> --force
node scripts/notepad-claim.cjs release <item-id> <agent-name>
```

- `claim`：同一 Agent 重复执行幂等；被其他 Agent 认领时非零退出并显示当前认领者。
- `--force`：只有用户明确要求接管时才允许使用。
- `release`：用于取消接单或归档后的手工清理，只能释放自己的认领。
- `claim` 要求待办 id 存在；`release` 允许清理已归档待办留下的 id。参数缺失、认领 id 不存在或写入失败都给出明确错误，不静默成功。
- 认领名使用当前分支名，例如 `codex/settings-center-notepad-claims`；不自动设置过期时间，避免长任务被误判为可重复承接。

### 6.4 界面与空上下文协议

待办条目正文下显示暖橙小标记：`处理中 · <claimedBy>`，title 中附本地认领时间。该标记只读，不增加用户手动认领操作。

`AGENTS.md` 与 `.agents/skills/notepad-triage/SKILL.md` 增加固定流程：

1. 读取 `notepadItems` 与 `notepad-claims.json`，汇报时标出已被认领的条目。
2. 用户指定条目后，开始探索/修改前先执行 `claim`；冲突时跳过，除非用户明确接管。
3. 取消接单时 `release`；完成后仍按原规则归档：应用运行时让用户点 ✓，应用关闭后才移动 state.json 条目。
4. 归档成功后确认认领已清理由 `state:patch` 自动完成；手工归档时执行 `release`。

## 7. 今日完成高亮

在 `src/lib/notepad.ts` 增加纯函数 `isResolvedToday(resolvedAt, now)`，按用户本地时区比较年月日，无效日期返回 false。

「已完成」时间线中，当天条目使用暖橙浅底、边框和实心节点，并显示「今日完成 · 待测试」。跨月分组、展开全文、source 标记和旧条目样式保持不变；第二天打开时无需写入状态，高亮会自然消失。

## 8. 错误处理与边界

- 设置各子页保留现有错误提示与保存反馈，导航切换不隐式保存。
- 认领文件缺失或损坏时按无认领读取，沿用 `.bak` 恢复；不能让记事板整体无法打开。
- 认领冲突不能覆盖对方；强制接管必须来自用户明确指令。
- 刷新记事板失败时保留当前内存内容并显示现有 toast，不清空面板。
- 卷宗为空时不添加空提示词段；全局注入不改变模型、温度、搜索或思考深度设置。

## 9. 验证与验收

### 9.1 定向自动验证

- 设置组件：三级导航、三个常规分类、卷宗/扩展迁入、返回来源页、主页与简报入口。
- 提示词纯函数：空画像跳过、非空字段、有/无 system、消息顺序；现有学习/推荐测试确认无重复画像。
- 认领逻辑：读取合并、同 Agent 幂等、异 Agent 冲突、force、release、归档清理、损坏文件兜底。
- 记事板 UI：认领标记、今日/昨日/无效日期、跨 UTC 日界线的本地日期判断。
- 烛光删除后运行相关组件测试，确认无残留 import、状态或样式依赖。
- 运行 `npm run docs:check`、相关 Vitest、双 tsconfig 类型检查与生产构建。
- 定向 E2E 只按 `e2e/source-map.json` 受影响组执行；启动 Electron 前另行取得用户明确确认，不跑全量。

### 9.2 用户可验收结果

1. 简报不再出现烛光随行，原位置可进入设置并正确返回。
2. 设置在全屏下呈三栏；常规三个子页、卷宗和扩展的所有既有功能均可找到并使用。
3. 任意 AI 生成请求都携带同一份非空卷宗，旧学习/推荐提示词不重复携带。
4. Agent 开始接单后，记事板显示处理中与认领者；其他会话默认不能重复认领。
5. 当天完成条目明显高亮，次日自动恢复普通样式。

## 10. 非目标

- 不处理记事板第 1–3 项，不改书籍、对照或章节标识代码。
- 不重新设计 LLM 配置、术语、配图或学习库功能本身。
- 不增加认领到期时间、用户认领按钮、实时文件监听或 WebSocket 同步。
- 不为设置分类新增持久化，不新增未保存修改确认流程。
- 不运行全量 E2E，不主动合并主工作区。
