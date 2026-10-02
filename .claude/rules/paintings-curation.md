---
description: 画作策展流水线（Pictures 画库搜集/筛选/入库/焦点）的指针与硬约束
paths:
  - "Pictures/**"
  - "Pictures-staging/**"
  - "scripts/curation-*.cjs"
---

# 画作策展规则

## 1. 单一事实源先读，不要凭记忆重建流程

**Why:** 图源可达性、片名坑、批次史、用户风格结论全部沉淀在一份草案文档里，脱离它重做调研会重复踩坑。

- 事实源：`docs/superpowers/plans/paintings-collection-draft-2026-09-28.md`（图源接口与踩坑录 / 各批勾选结果 / 风格总结修订 / 累积制方向）。
- 文档末尾的「风格总结修订（当前最准）」是用户审美的最新判据，选片选画前先读。
- 每完成一批：把勾选结果与风格修订写回该文档（用户要求持续更新）。
- Source: 2026-10-03 用户要求「在 rules/AGENTS 留动态指针」。

## 2. 脚本序列固定，下载只走 curation-fetch.cjs

**Why:** curl 有用户级 deny；curation-fetch.cjs 是 settings.local.json 白名单内的唯一联网通道。

- 搜集：`Pictures-staging/wikiart-batchN.cjs`（油画）或 `Pictures-staging/dl-tmdb.cjs`（影视，search/backdrops/thumbs/pick；剧集 id 加 `tv` 前缀）→ `assemble-bN.cjs`（改名+压缩+合并 candidates.json）→ `node scripts/curation-gallery.cjs` 生成 gallery-pick.html。
- 入库：用户导出 selection.json 到桌面 → 拷入 Pictures-staging/ → `node scripts/curation-merge.cjs`（自动续编号、续画家 id、写 manifest）。
- 焦点/隐藏调整：`node scripts/curation-crop.cjs` 生成 crop-tool.html → 用户导出 focus-selection.json → `--apply` 写回 index.json 与 state.json。
- 单元测试在 `tests/curation.test.ts`，改脚本后只跑它。

## 3. 搜索模式：TMDB 链 + WikiArt 链，细节以事实源为准

**Why:** 两个链条都是本机直连实测可达的；域名/id 规则有坑（og:image 后缀、slug 变体、MSYS 路径转换）。

- TMDB：`/search/movie|tv` → `/movie|tv/NNN/images/backdrops` 静态页（社区票选排序，越前越经典）→ `image.tmdb.org/t/p/original/<hash>.jpg`；id 必须抓 `/movie/NNN` 页 title 核对。
- WikiArt：`/en/<slug>/all-works/text-list` 找作品 slug → 作品页 og:image 剥掉 `!Large.jpg` 后缀得原图；slug 坑（william-turner、franz-stuck 等）见文档。
- 预挑原则：影视选「物件/奇观帧」，油画按文档风格总结；缩略图逐张人工看过再下原图。

## 4. 策展判断与去重

**Why:** 用户明确过两条反直觉规则，违背会浪费批次。

- 落选 ≠ 风格否定：像素/尺寸也是硬门槛（透纳批三案例），风格合意但低清的标记后可换源重试。
- 累积制：每批保守配额=上一批入选画家换侧重加码，创新配额=全新画家自由探索；不要给早期画家成堆加。
- 入库后跑感知哈希去重（同画不同名会逃过标题去重，如 Salvador Dalí 重音变体）；保留高像素/大文件版本，删前必须用户确认。
- 本地预览服务器必须绑 127.0.0.1 并屏蔽 .env；后台任务 2h 上限会杀它，用户说打不开就重启 `Pictures-staging/serve.cjs`。
