---
name: notepad-triage
description: >
  迭代记事板的需求分诊与归档助手。读取 ~/.studyparlor/state.json 的 notepadItems（待办）与
  notepadLog（已解决档案），帮助用户浏览、分类、接单迭代需求。
  每次迭代完成后，自动把已解决条目从 notepadItems 移入 notepadLog（写 resolvedAt + source:'agent'）。
  触发词："迭代需求"、"记事板"、"notepad"。
---

# /notepad-triage — 迭代记事板分诊与归档

## 数据源

`~/.studyparlor/state.json`（Windows: `%USERPROFILE%\.studyparlor\state.json`）的两个字段：

- `notepadItems`: `[{ id, title, text, category, createdAt }]` — 待办条目；`title` 创建时自动生成兜底
- `notepadLog`: `[{ id, title, text, category, createdAt, resolvedAt, source }]` — 已解决档案；`title` 为短标题，面板默认只显示它，全文点击展开

`category` 三选一：`'bug'`（bug）/ `'feature'`（新功能）/ `'improvement'`（功能优化）。
`source`：`'user'`（用户在面板点 ✓）/ `'agent'`（本 skill 归档）。

旧字段 `coverNotepad`（纯文本）已被 `notepadItems` 取代；如它仍非空且 `notepadItems` 为空，
按非空行拆分、去掉行首编号后迁入（分类规则见下），并清空 `coverNotepad`。

## 流程

### 1. 读取与汇报

用户说"看看迭代需求"等触发语时：

1. 读 `state.json`，汇报 `notepadItems`，按 category 分组展示（bug / 新功能 / 功能优化）
2. 附简短统计：待办 N 条、本月已解决 M 条（来自 notepadLog 的 resolvedAt）
3. 用户指出"哪条已完成/要做哪条"时进入对应分支

### 2. 归档已解决条目（每次迭代收尾必做）

**前提检查：app 是否在运行**。运行 `Get-Process electron -ErrorAction SilentlyContinue`
（或任务管理器）。若 Study Parlor 正在运行：

- **不要直接改 state.json**——app 内存中的旧状态会在下次保存时覆盖你的写入
- 改为提示用户："请在记事板面板里给该条目点 ✓"，或请用户先关闭 app

app 未运行时，直接编辑 state.json：

1. 从 `notepadItems` 移除已解决条目
2. 追加到 `notepadLog`：`{ ...item, title: <你总结的短标题>, resolvedAt: <当前 ISO 时间>, source: 'agent' }`
   - **标题规则**：≤15 字，「对象 + 动作」式概括（如"封面画作裁剪功能"、"记事板外点不收起"），不带"目前打算/有一个bug"这类口语前缀；用户事后可凭标题一眼认出是哪条
3. 保留其余字段原样（先整体读入、改、整体写回，UTF-8 无 BOM）
4. 向用户汇报：归档了哪条、当前待办剩几条

### 3. 接单迭代

用户指定要做的条目后：正常完成开发工作（遵循 AGENTS.md），
完成后**回到第 2 步归档该条目**，再总结。

### 4. 新增条目

替用户记录新需求时：要求用户指定三分类之一（若文本明显可推断可直接建议默认值），
向 `notepadItems` 追加 `{ id: 'n' + Date.now().toString(36) + 随机4位, text, category, createdAt: 当前ISO }`。
同样遵守"app 运行中不改 state.json"的前提——运行中让用户在面板里自行输入。

## 分类参考（guessCategory 同款规则）

- 含 bug / 修复 / 问题 / 收起 / 不符 / 错误 / 失败 → `bug`
- 含 删减 / 优化 / 改进 / 集成 / 长期 / 迁移 / 重构 → `improvement`
- 其余 → `feature`