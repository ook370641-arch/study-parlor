---
name: notepad-triage
description: >
  迭代记事板的需求分诊与归档助手。读取项目根目录 notepad.json 的 notepadItems（待办）与
  notepadLog（已解决档案），帮助用户浏览、分类、接单迭代需求。
  每次迭代完成后，自动把已解决条目从 notepadItems 移入 notepadLog（写 resolvedAt + source:'agent'）。
  触发词："迭代需求"、"记事板"、"notepad"、"看下评论"、"追下issue"。
---

# /notepad-triage — 迭代记事板分诊与归档

## 数据源

开发时读取项目根目录 `notepad.json`（Git 追踪）；打包版对应 `~/.studyparlor/notepad.json`。两个字段：

- `notepadItems`: `[{ id, title, text, category, createdAt }]` — 待办条目；`title` 创建时自动生成兜底
- `notepadLog`: `[{ id, title, text, category, createdAt, resolvedAt, source, comments? }]` — 已解决档案；`title` 为短标题，面板默认只显示它，全文点击展开

`category` 三选一：`'bug'`（bug）/ `'feature'`（新功能）/ `'improvement'`（功能优化）。
`source`：`'user'`（用户在面板点 ✓）/ `'agent'`（本 skill 归档）。
`comments`：`[{ id, text, createdAt, resolvedAt?, resolution? }]`，已完成条目的用户反馈与处理记录。

旧字段 `coverNotepad`（纯文本）已被 `notepadItems` 取代；如它仍非空且 `notepadItems` 为空，
按非空行拆分、去掉行首编号后迁入（分类规则见下），并清空 `coverNotepad`。

认领数据独立保存在 `~/.studyparlor/notepad-claims.json`，结构为
`Record<itemId, { claimedBy, claimedAt }>`；不要把 `claim` 写进 `state.json`。

## 流程

### 1. 读取与汇报

用户说"看看迭代需求"等触发语时：

1. 读项目根目录 `notepad.json` 与 `~/.studyparlor/notepad-claims.json`，汇报 `notepadItems` 时标出已认领条目及认领者，按 category 分组展示（bug / 新功能 / 功能优化）
2. 附简短统计：待办 N 条、本月已解决 M 条（来自 notepadLog 的 resolvedAt）
3. 用户指出"哪条已完成/要做哪条"时进入对应分支

用户说"看下评论"或"追下 issue"时，`issue` 只指评论：遍历 `notepadLog[].comments[]`，不要查看或处理 `notepadItems` 的新需求 / 功能迭代 / bug。只列出没有 `resolvedAt` 的评论，并带上所属条目标题、条目 id 与 comment id；已有 `resolvedAt` / `resolution` 的记录只作历史参考，不重复处理。

### 2. 归档已解决条目（每次迭代收尾必做）

**前提检查：app 是否在运行**。运行 `Get-Process electron -ErrorAction SilentlyContinue`
（或任务管理器）。无论 app 是否运行，agent 都必须自行完成归档，不得要求用户手动点 ✓。

若 Study Parlor 正在运行：

- **不要直接改 state.json / notepad.json**——app 内存中的旧状态会在下次保存时覆盖你的写入
- 通过运行应用的 `state:patch` 通道自行归档，并同步渲染进程 store；开发实例可用既有 CDP 9222 连接调用 `useStore` 与 `window.api.patchState`，不要导航或重启页面
- 写入 `resolvedAt`、≤15 字短标题与 `source: 'agent'`，剥离认领字段；通过 `state:get` 确认条目已移动，并确认 `notepad-claims.json` 中自己的认领已清理
- 无法建立安全通道属于交付阻塞，先自行恢复通道，不得把手动打勾作为交付步骤

app 未运行时，直接编辑 notepad.json：

1. 从 `notepadItems` 移除已解决条目
2. 追加到 `notepadLog`：`{ ...item, title: <你总结的短标题>, resolvedAt: <当前 ISO 时间>, source: 'agent' }`
   - **标题规则**：≤15 字，「对象 + 动作」式概括（如"封面画作裁剪功能"、"记事板外点不收起"），不带"目前打算/有一个bug"这类口语前缀；用户事后可凭标题一眼认出是哪条
3. 保留其余字段原样（先整体读入、改、整体写回，UTF-8 无 BOM）
4. 执行 `node scripts/notepad-claim.cjs release <item-id> <current-branch>` 释放自己的认领
5. 向用户汇报：归档了哪条、当前待办剩几条

面板或 agent 通过 `state:patch` 归档时会自动清理认领；确认认领已清理即可。

### 3. 接单迭代

用户指定要做的条目后，开始探索或修改前先以当前分支名认领：

```bash
node scripts/notepad-claim.cjs claim <item-id> <current-branch>
node scripts/notepad-claim.cjs release <item-id> <current-branch>
```

1. `claim` 成功后才进入探索和开发；同一 Agent 重复执行幂等，不设置自动过期
2. 已被其他 Agent 认领时默认跳过；只有用户明确要求接管时才在 `claim` 末尾加 `--force`
3. 取消接单时执行 `release`；只能释放自己的认领
4. 正常完成开发工作（遵循 AGENTS.md），完成后**回到第 2 步归档该条目**，遵守运行限制并确认认领已清理，再总结

### 4. 新增条目

替用户记录新需求时：要求用户指定三分类之一（若文本明显可推断可直接建议默认值），
向 `notepadItems` 追加 `{ id: 'n' + Date.now().toString(36) + 随机4位, text, category, createdAt: 当前ISO }`。
同样遵守"app 运行中不改 state.json / notepad.json"的前提——运行中让用户在面板里自行输入。

### 5. 处理已完成条目的评论

1. 用户指定评论后，按评论内容识别 bug / feature / improvement，并遵循 AGENTS.md 的对应开发流程；父条目保留在 `notepadLog`，不要移回 `notepadItems`
2. 完成代码修改与验证后，找到所属条目和匹配 comment，保留原字段并追加 `resolvedAt: <当前 ISO 时间>`、`resolution: <简短处理摘要 + 验证结果 + 提交号>`
3. 写回前同样检查 app 是否运行；运行中不要直接改 `notepad.json`，先请用户关闭 app，再继续写回
4. 向用户汇报处理了哪条评论；后续"看下评论"只处理仍未解决的评论

## 分类参考（guessCategory 同款规则）

- 含 bug / 修复 / 问题 / 收起 / 不符 / 错误 / 失败 → `bug`
- 含 删减 / 优化 / 改进 / 集成 / 长期 / 迁移 / 重构 → `improvement`
- 其余 → `feature`
