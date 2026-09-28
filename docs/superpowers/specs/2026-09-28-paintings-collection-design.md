# 画作搜集与勾选工具线 · 设计（B2 画作替换 · 主线）

> 日期：2026-09-28
> 状态：已与用户对齐，开工
> 关联：`docs/6.27 V2 OKR.md` B2；流程参照 `docs/superpowers/plans/quotes-collection-draft-2026-06-22.md`

## 目标

丰富应用背景画作序列。流程与语录集同构：**我粗找一批 → 用户用可视化工具勾选 → 从勾选结果反推风格总结 → 按总结找下一批**。不预设立筛选标准——标准从用户的实际勾选里长出来，不由我预先写死。

## 三条搜集线（首批 ~60 候选，有意放宽多样性）

1. **同类线 ~25**：与现有 Rothko / Guy Billout 气质相近的画家——色域/抽象表现（Newman、Still、Frankenthaler、Agnes Martin、Sugimoto 海景）+ Billout 式超现实插画（Moebius 等）
2. **经典线 ~15**：梵高、透纳。不限夜景，白天/亮色也放，让勾选暴露偏好
3. **影视线 ~20**：迷失东京 / 醉乡民谣 / 边境杀手各 6–8 帧，以夜色、室内低照度、城市空镜为主，也放少量白昼帧对照

## 字段（与应用现有管线对齐）

数据源 `Pictures/index.json`，每幅六字段：`id` / `painter` / `title` / `file` / `category` / `year`（后两者可空）。

- 影视条目映射：`painter` = 导演、`title` = 片名、`year` = 年份 → 展签自动显示 "Sofia Coppola · Lost in Translation · 2003"，UI 零改动
- `category` 自由值：`color-field` / `illustration` / `post-impressionism` / `romanticism` / `film-still` 等
- **类型改动**：`Painting.painter` 从字面量联合 `'Mark Rothko' | 'Guy Billout'` 放宽为 `string`（随首批入库一并改）

## 工具与目录

- `Pictures-staging/`（.gitignore，不进库）：候选图（`<id>.jpg`）+ `candidates.json` + 生成的 `gallery.html` + 用户导出的 `selection.json` + merge 后的 `rejected/`
- `candidates.json` 每条：`{ id, painter, title, year, category, file, source, note, line }`（`source` 来源链接留痕，`note` 一句话推荐语，`line` 分组线）
- `scripts/curation-gallery.cjs`：读 candidates.json → 生成单文件暗色画廊 `gallery.html`
  - 按线 → 画家分组网格；点击卡片切换勾选；localStorage 记忆；每幅显示 `painter · title · year`；顶栏计数 + 「导出选中」下载 selection.json
- `scripts/curation-merge.cjs`：读 selection.json →
  - 选中：按现有 `NNN-slug.jpg` 规范取 Pictures/ 最大编号 +1 续编命名，移入 `Pictures/`；自动生成 id（`<画家key>-NN` 顺序制）追加进 `index.json`
  - 未选中：移入 `Pictures-staging/rejected/`（留痕不丢）
  - 末尾调用现有 manifest 生成逻辑，打印入库摘要

## 搜集记录文档

`docs/superpowers/plans/paintings-collection-draft-2026-09-28.md`（与语录集同目录、名字在前日期在后）。骨架：目的与流程说明 + 批一候选总表（搜集完填充）+ 勾选结果（待用户）+ 风格总结（待，从勾选反推）。

## 验收清单

- [ ] 两个脚本有单元测试（编号续编、id 生成、缺文件跳过、rejected 移动；gallery 缺文件标注）
- [ ] staging 全目录被 .gitignore 覆盖
- [ ] merge 后 `node scripts/build-manifest.cjs` 无警告、manifest 条目数正确
- [ ] 新画在 dev 下能正常被抽取展示（painter 类型放宽不破坏现有测试）
- [ ] 记录文档随批次更新（候选表 → 勾选结果 → 风格总结）

## 不做（YAGNI）

- 不做应用内策展页、不做带本地服务的勾选页
- 不动换画/展签/四个 surface 的抽取逻辑（新画进统一大池）
- 不预写筛选标准
