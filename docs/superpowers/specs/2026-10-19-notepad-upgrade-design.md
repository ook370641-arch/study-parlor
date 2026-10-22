# 迭代记事板升级：条目化面板 + 迭代档案页 + notepad-triage skill

日期：2026-10-19
状态：已实施（方案经可视化稿确认；文档为实施后补写）
范围：封面记事板面板、新增档案页路由、state.json 新字段、记事板迁移、agent 归档 skill、AGENTS.md

## 背景与目标

迭代记事板原是封面右上角铅笔按钮打开的纯文本框（`coverNotepad`，防抖 300ms 写入），存在四个问题：

1. **bug**：点击面板外不收起，只能再点一次铅笔按钮（记事板 #4）
2. 纯文本不利于 agent 接单——无法区分条目状态与类型
3. 无已解决记录——做完的需求没有沉淀，无法统计长期迭代状况
4. 交互受限——面板固定大小、字号不可调

目标（visual 已对齐，mockup 见 `~/.codex/visualizations/2026/10/19/01a15473-*/notepad-{panel,archive}.png`）：

- 条目化待办，三分类强制标记：**bug / 新功能 / 功能优化**
- 面板 ✓ 完成 → 划线淡出动画 → 自动归档到档案页
- 新增档案页：统计卡 + 按月时间线
- 左下角拖拽手柄调大小、A−/A+ 字号，均持久化
- 封装 `notepad-triage` skill：每次迭代收尾自动把解决项移入档案（`source: 'agent'`）

## 分类规则

`category: 'bug' | 'feature' | 'improvement'`，UI 标签：bug / 新功能 / 功能优化。

新增时用户在输入框上方三选一（默认"新功能"，保证一次回车可录入）。迁移/猜测规则（`guessCategory`）：含 bug/修复/问题/收起/不符/错误/失败 → `bug`；含 删减/优化/改进/集成/长期/迁移/重构 → `improvement`；其余 → `feature`。

## 数据 Schema（state.json）

```ts
notepadItems: [{ id, text, category, createdAt }]                 // 待办
notepadLog: [{ id, text, category, createdAt, resolvedAt, source }] // 档案；source: 'user' | 'agent'
notepadFontSize: 'sm' | 'base' | 'lg'                              // 面板字号
notepadPanelSize: { w, h } | null                                  // 拖拽手柄写入，null=默认 384×560
```

**迁移**：`coverNotepad`（纯字符串）废弃为一次性迁移源。init 时若非空且 `notepadItems` 为空 → 按非空行拆分、去行首编号（`1、` / `-` 等）、猜测分类，落盘 `notepadItems` 并清空 `coverNotepad`。幂等：`notepadItems` 已存在则原样返回。

## 组件与路由

**`src/components/NotepadPanel.tsx`**（替换 Cover.tsx 内联 textarea）：

- 收起：`mousedown` 监听面板外点击 + `Esc`（修复 #4）；铅笔按钮的 toggle 不触发外点关闭（`closest` 豁免）
- 条目行：序号 + 分类圆点（橙 feature / 绿 improvement / 红 bug）+ 文本 + 悬停浮现 ✓/✕
- 完成动画：`completingId` 置位 → 划线 + 左移淡出 450ms → `resolveNotepadItem`
- 输入：三分类 chip + 输入框，回车添加；**粘贴多行自动拆条目**（`onPaste` 拦截含 `\n` 的文本）
- 拖拽手柄：左下角斜纹 grip，`pointermove` 实时改宽高（min 320×280，max 90vw×80vh），`pointerup` 时经 `setNotepadPanelSize` 落盘
- 字号：A−/A+ 三档（sm/base/lg），边界档 disable

**`src/pages/NotepadArchive.tsx`**（新路由 `notepadArchive`，面板头部「档案」按钮进入，返回键回封面）：

- 统计卡 ×4：累计解决 / 本月解决 / 当前待办 / 近 6 个月趋势条（`computeNotepadStats`）
- 时间线：按 `resolvedAt` 月份降序分组（`groupLogByMonth`），卡片 = 分类徽章 + 文本 + 记入/解决日期 + （`source==='agent'` 时）"由 agent 归档"

## Skill：notepad-triage

`.agents/skills/notepad-triage/SKILL.md`。触发词："迭代需求 / 记事板 / notepad"。流程：读 state.json 汇报待办（按分类分组 + 统计）→ 接单迭代 → **收尾时自动归档**（写 `resolvedAt` + `source:'agent'`）。

**关键约束（防覆盖）**：app 运行中 agent **不得直接改 state.json**——渲染进程内存中的旧 `notepadItems` 会在下次 patch 时覆盖外部写入。运行中应提示用户在面板点 ✓，或先关闭 app。（`patchState` 从磁盘重读合并，只保护非记事板字段。）

## AGENTS.md 更新

「迭代记事板」一节重写：新字段 schema、档案页路由、归档约定、skill 指引、`coverNotepad` 废弃说明。

## 明确不做

- 条目拖拽排序 / 编辑已有条目文本（删除重录即可）
- 档案页的删除/恢复操作（档案只增）
- app 运行中的外部写入冲突自动解决（用约定规避，不加文件锁）

## 验证

- `tests/notepad.test.ts` 8/8（分类猜测、迁移幂等、统计、分组）
- `npx tsc --noEmit` 与 `tsc -p tsconfig.node.json` 全绿（顺带修复了历史遗留的 `blog-icons.tsx` SVG `title` 属性类型错误——改为 `<title>` 子元素）
- `npx electron-vite build` 通过
- E2E：`cover.spec.ts` 7/7、`startup-health` 单跑通过（定向跑批中 anthropic-blog @real 系列失败为外网抓取测试的环境性失败，与本改动无关）

**遗留说明**：实施后经 notepad-triage 同款规则把原记事板 8 条播种进 state.json（保留原文全文）：待办 2 条（#1 笔记书架 / #3 删减伪功能——三来源删除已于 2026-10-10~12 落地，写作删除与 hermes 评估保留）；档案 6 条，resolvedAt 按 git 证据回填——#2 封面裁剪 2026-10-08（4a28c3d feat(crop)）、#5 健身跟踪 2026-10-12（4e42f8e merge）、#6 旁注与 #7 博客配图按用户确认移入（git 无对应修复提交）、#4/#8 本迭代完成。原 state.json 备份于 `state.json.bak-20261019`。

**2026-10-20 修订（四）**：山河长廊 v1 固定 380px 坐标系 + 左右窄卡，面板拉大后时间线缩在中央、条目边界不清——重构为 v2：**山河轨道收缩为左侧 96px 装饰列**（每行轨道格自绘本段 SVG，overflow visible 跨行衔接，行高变化不影响路径；河/山仍每 3 条交替），条目改通栏整行（徽章+日期+agent 标记一行、标题单行 truncate、点击展开全文），宽度随面板自适应。

**2026-10-20 修订（三）**：已完成 tab 改为「山河长廊」——每 3 条换一种地貌交替（河流段：S 形贝塞尔宽带+亮线；登山段：之字虚线+背景山峰剪影），节点坐标与 SVG 路径按条目数动态生成；条目卡边界感知挂左/右（`x + 16 + 165 > TL_W` 或过半则挂左），点击展开全文（限高 140px 内部滚动），最新条目发光节点，轴尾"山河仍在延伸…"。头部 tab 改为 markdown 预览/代码式分段切换（激活段实底 ember）；字号按钮去字母留 −/＋。

**2026-10-20 修订（二）**：独立档案页撤除，改为面板内双 tab（待完成/已完成）。已完成 tab 为**时间长廊**：竖向时间轴在条目左侧，日期字段挂在轴外（MM-dd），条目卡挂轴上，自上而下从最早延伸到今天，最新条目用发光节点强调，轴尾"仍在生长…"收束——一眼看出先做了什么、后做了什么。条目新增 `title` 短标题字段（≤15 字）：面板 ✓ 时 `deriveTitle` 取首句兜底，skill 归档时由 agent 总结准确标题；时间线默认只显示徽章+标题，点击行内展开全文与记入/解决日期。#3 删减伪功能按用户确认移入已完成（resolvedAt 2026-10-12，merge 9f23ac6）。

**2026-10-19 修订**：档案页背景接封面画作（`SurfaceBackground surface="cover"` + 加深遮罩，不占独立画作槽位）；条目分类由小圆点改为彩色文字徽章（bug 红 / 新功能 橙 / 功能优化 绿），一眼可辨。