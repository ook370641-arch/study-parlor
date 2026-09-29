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

## 批一候选（66 条，三条线）

> 已就位：`Pictures-staging/candidates.json` + `gallery.html`（2026-09-29 生成）。
> 来源：WikiArt（画作，og:image 原图，统一 ≤1920px）+ movie-screencaps.com（影视帧，Blu-ray 全尺寸）。

### 同类线（peers，25）

- **Barnett Newman ×4**：Vir Heroicus Sublimis(1951) / Onement I(1948) / The Wild(1950，白墙对照) / Black Fire I(1963)
- **Clyfford Still ×4**：1957-D No.1 / 1949 No.1 / PH-104(1952) / 1957-J No.2
- **Helen Frankenthaler ×4**：Mountains and Sea / Interior Landscape / Blue Atmosphere III / Tales of Genji I
- **Agnes Martin ×4**：Night Sea(1963) / The Tree / The Islands / Untitled #15(Peace)
- **杉本博司 ×4**：North Atlantic / Sea of Japan / Revolution 008 Caribbean / Cabot Street Cinema（剧院系列）
- **René Magritte ×5**：The Empire of Lights ×2 / The Meaning of Night / The Hunters at the Edge of Night / The Human Condition（亮色对照）

### 经典线（classics，18）

- **梵高 ×9**：星夜 / 罗纳河星夜 / 夜间咖啡馆露台 / 夜间咖啡馆 / 乌鸦麦田 / 柏树与星之路 / 月升夜景 / 夕阳播种者（亮色对照）/ 纽南黄昏（早期暗调）
- **透纳 ×9**：无畏号 / 雨蒸汽速度 / 汉尼拔暴雪 / 汽船暴雪 / 诺勒姆城堡日出 / 议会大火 / 月夜运煤船 / 米尔班克月光 / 奴隶船（重口对照）

### 影视线（films，23）

- **迷失东京 (Sofia Coppola, 2003) ×10**：夜路口霓虹 / 酒吧 Bob / 夜车 / 浴室暮光 / 酒吧光斑 / 卡拉OK暗场 / 斑马纹包厢 / 酒店夜灯 / 暗处特写 / 暮色高速
- **老无所依 (Coen, 2007) ×7**：警长办公室 / 岩石狙击 / 交易现场 / 树下取水 / 夜街车灯 / 拖车屋夜灯 / 拖车屋内
- **神枪手之死 (Andrew Dominik, 2007) ×6**：雾光酒馆 / 窗边软光 / 草原落日 / 白桦林 Ford / 林中用餐 / 林中剪影

> **替换说明**：用户点名的边境杀手、醉乡民谣在可达图源（movie-screencaps 全量目录 1462 部）中不存在；
> 以同摄影指导（Deakins）+ 同气质的老无所依（边境荒漠/夜）、神枪手之死（烛光/忧郁）替换。
> 若一定要原片，用户可自行截图放入 staging 后再跑 gallery。

### 网络可达性备忘（本机直连，2026-09）

- ✅ WikiArt 页面+CDN、movie-screencaps.com（cap 原图走 i0.wp.com/imgs.screencaps.us，caps2.b-cdn.net 403 需 Referer）
- ❌ Wikimedia Commons（RST）、film-grab（超时）、web.archive.org（超时）、豆瓣剧照页（JS 反爬）、IMDb（202）、Bing 图片（结果 JS 化，静态 HTML 无 murl）、screencapped.net（403）

## 批一勾选结果

（待用户勾选后填写：入选 / 落选清单）

## 风格总结（批一后）

（从入选 vs 落选反推，作为批二搜集依据）
