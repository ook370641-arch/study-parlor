# 学者夜话画作集 · 筛选与规整草案

> 创建时间：2026-09-28
> 流程：与语录集同构——粗找一批 → 可视化勾选 → 从勾选结果反推风格总结 → 按总结找下一批
> 状态：批一搜集中，**不预设立筛选标准**（文字与画作的标准未必一致，标准从勾选里长出来）
> 设计：`docs/superpowers/specs/2026-09-28-paintings-collection-design.md`

## 流程说明

1. 候选图与元数据放 `Pictures-staging/`（gitignored）：`candidates.json` + `<id>.jpg`
2. `node scripts/curation-gallery.cjs` 生成 `Pictures-staging/gallery.html`，浏览器打开勾选（点击卡片、localStorage 记忆、导出 selection.json 到该目录）
3. `node scripts/curation-merge.cjs`（先 `--dry-run` 预览）：选中入库（续编号命名 + index.json 追加 + manifest 重生成），落选移 `rejected/`
4. 本文件记录每批候选、勾选结果、风格总结

## 应用字段约束（搜集时对齐）

| 字段 | 说明 |
|---|---|
| id | 入库时自动生成 `<画家姓slug>-NN` |
| painter | 画家/导演（影视线填导演） |
| title | 画名/片名 |
| file | 入库时改为 `NNN-slug.jpg` 续编号 |
| category | color-field / illustration / post-impressionism / romanticism / film-still 等自由值 |
| year | 可空 |

展示约束：全屏 `object-cover` + vignette 暗角 + 米色文字压图——横构图、深色调存活率最高（仅作搜集倾向，不作筛选标准）。

## 批一候选（~60，三条线）

> 搜集中。清单见 `Pictures-staging/candidates.json`（含来源链接与一句话推荐语），此处待搜集完成后归档总表。

### 同类线（peers，~25）

Newman / Still / Frankenthaler / Agnes Martin / Sugimoto 海景 / Billout 式插画

### 经典线（classics，~15）

梵高（不限夜景）、透纳

### 影视线（films，~20）

迷失东京 / 醉乡民谣 / 边境杀手，各 6–8 帧

---

## 批一勾选结果

（待用户勾选后填写：入选 / 落选清单）

## 风格总结（批一后）

（从入选 vs 落选反推，作为批二搜集依据）
