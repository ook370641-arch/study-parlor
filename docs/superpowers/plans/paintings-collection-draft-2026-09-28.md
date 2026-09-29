# 学者夜话画作集 · 筛选与规整草案

> 创建时间：2026-09-28 ｜ 最近更新：2026-09-29（批一入库，批二启动）
> 流程：与语录集同构——粗找一批 → 可视化勾选 → 从勾选结果反推风格总结 → 按总结找下一批
> **文档职责**：本文件是画作线的**唯一主负责文档**（进度、勾选结果、风格总结、图源接口、用户要求都记在这里）。
> `docs/superpowers/specs/2026-09-28-paintings-collection-design.md` 与 `2026-09-28-painting-delete-button-design.md` 是开工前的冻结设计稿，不再更新。

## 流程说明

1. 候选图与元数据放 `Pictures-staging/`（gitignored）：`candidates.json` + `<id>.jpg`
2. `node scripts/curation-gallery.cjs` 生成两版画廊：
   - `gallery-swipe.html`：**逐张审判**（全屏单张，✗弃/✓选，←→ 键操作，Backspace 撤回，localStorage 记忆）——批一起用户用这版
   - `gallery.html`：网格总览版
3. 用户导出 `selection.json` 放进 `Pictures-staging/` → `node scripts/curation-merge.cjs`（先 `--dry-run` 预览）：选中入库（续编号命名 + index.json 追加 + manifest 重生成），落选移 `rejected/` 留档
4. 本文件记录每批候选、勾选结果、风格总结

## 应用字段约束（搜集时对齐）

| 字段 | 说明 |
|---|---|
| id | 入库时自动生成 `<画家姓slug>-NN` |
| painter | 画家/导演（影视线填导演） |
| title | 画名/片名 |
| file | 入库时改为 `NNN-slug.jpg` 续编号 |
| category | color-field / surrealism / post-impressionism / romanticism / photography / film-still 等自由值 |
| year | 可空 |

展示约束：全屏 `object-cover` + vignette 暗角 + 米色文字压图。图片统一 ≤1920px 宽（原图更大的入库前用 `Pictures-staging/resize.ps1` 缩到 1920，JPEG）。

## 批一勾选结果（66 判 21 选，2026-09-29 入库，165→186）

### 入选 21

- **梵高 8/9**：星夜、夜间咖啡馆露台、夜间咖啡馆、乌鸦麦田、柏树与星之路、月升夜景、夕阳播种者、纽南黄昏（唯一落选：罗纳河星夜）
- **透纳 9/9 全收**：无畏号、雨蒸汽速度、汉尼拔暴雪、汽船暴雪、诺勒姆城堡日出、议会大火、月夜运煤船、米尔班克月光、奴隶船
- **同类线 4/25**：Clyfford Still《1949 No.1》、杉本博司《Cabot Street Cinema》、Magritte《The Meaning of Night》《The Human Condition》

### 落选 45（要点）

- **影视帧 0/23 全灭**：迷失东京 10 帧、老无所依 7 帧、神枪手之死 6 帧全部落选
- **Newman 0/4、Frankenthaler 0/4、Agnes Martin 0/4 全灭**；Still 仅 1/4；Sugimoto 海景 0/3（剧院 1/1 入选）
- Magritte 两幅《光之帝国》落选，但《The Human Condition》（明亮窗景）入选

## 风格总结（批一反推，批二搜集依据）

1. **油画/笔触质感是硬通货**：梵高 8/9、透纳 9/9——有笔触、有光、有情绪的具象/半具象油画近乎无条件通过。平面化的抽象色域（Newman、Frankenthaler、Martin）全灭，Still 也只留了最暗最"有画意"的一张。**与现有 Rothko 库存的关系：用户要的不是更多罗斯科同类，而是从抽象走向表现性绘画。**
2. **"光的戏剧"优先于"夜的深浅"**：亮色对照组里《The Human Condition》（昼景窗光）、《夕阳播种者》（金色）都入选；纯暗但平的（Martin 深蓝网格、Sugimoto 灰海）反而落选。透纳全系（含最亮的诺勒姆日出、最烈的奴隶船）说明：**关键是光的表现力，不是暗。**
3. **摄影/影视帧作为"画作"目前全军覆没**：23 帧电影截图 0 收、Sugimoto 海景 0/3。可能原因：带演员正脸的帧"剧照感"太强、照片质感与油画库格格不入。批二对策：影视线只取**空镜**（无人脸、风景/城市/室内空景）+ 用户点名方向的画家性电影（塔可夫斯基/毕赣），并在推荐语里继续试探边界；若再全灭，影视线降级为"用户自供"。
4. **例外信号**：杉本博司《剧院》（无人、概念性、黑底白幕）入选——无人 + 有概念 + 暗色，可能正是摄影/影视能过的窄门。

## 批二方向（用户要求，2026-09-29 原话整理）

1. 电影**不聚焦特定几部，广泛搜索经典电影经典画面**：好莱坞 + 塔可夫斯基、毕赣、费里尼、库布里克、教父、文艺电影
2. 画作**放宽限制**，范围更广
3. **可以有达利**、**透纳的其他画作**
4. 先写文档（本篇即落实），再野蛮搜索

批二线索（我据此组织候选）：油画线放宽到表现主义/象征主义/超现实（蒙克、克里姆特、达利、弗里德里希、勃克林、雷东、莫奈夜景、惠斯勒夜曲）；透纳补遗（暴风雪系列其他、威尼斯、海难、月光）；影视线改为空镜优先的广撒网（塔可夫斯基《潜行者》《乡愁》、毕赣《路边野餐》《地球最后的夜晚》、费里尼、库布里克、教父、好莱坞经典）。

## 图源接口与踩坑录（本机直连实测，2026-09）

**为什么批一找图花了很久**：国内直连下多数西文图源被墙或反爬，逐个探测才试出可用链路；另外 WikiArt 的真实图 URL 有三种形态，猜 URL 失败率高，必须走作品页元数据。

### ✅ 可用（批一验证）

| 接口 | 用法 | 注意 |
|---|---|---|
| **WikiArt 作品清单** | `GET https://www.wikiart.org/en/<artist>/all-works/text-list` → HTML 里 grep 作品 slug | 服务端渲染，直接可解析 |
| **WikiArt 图片** | 作品页 `og:image` meta 是最可靠图 URL；去掉 `!Large.jpg` 后缀得原图 | **三种 URL 形态**：`uploadsN.wikiart.org/images/<artist>/<work>.jpg`、带 `(1)` 文件名后缀、带 `/数字前缀/images/` 路径——构造 URL 容易 404，og:image 永远正确 |
| **movie-screencaps.com** | 影片页 `/​<slug>/page/N` 分页，每页 ~178 帧 | 目录页 `/movie-directory/` 列全量 1462 部，先查有没有该片 |
| **剧照原图（Jetpack 代理）** | `https://i0.wp.com/imgs.screencaps.us/<200>/<年>-<片名key>/full/<片名>-movie-screencaps.com-<N>.jpg?ssl=1`，加 `?w=400` 得缩略图 | **caps2.b-cdn.net 直连 403**（要 Referer），必须走 i0.wp.com 代理 |
| **豆瓣 subject_suggest** | `GET https://movie.douban.com/j/subject_suggest?q=<片名>` → JSON 含豆瓣 id/年份 | 只能查 id；剧照页有 JS 反爬拿不到图 |

### ❌ 不可用（本机直连）

- Wikimedia Commons：连接被重置（被墙）——梵高透纳原图走不了 Commons，改道 WikiArt
- film-grab.com：超时；web.archive.org：超时；bluscreens.com：超时
- IMDb：HTTP 202 反爬；screencapped.net：403；screenmusings.org：域名已停放
- Bing 图片：结果 JS 渲染，静态 HTML 无 murl；Bing 网页搜索 site: 查询无有效结果
- 豆瓣剧照页/frodo API：JS 挑战/签名失效；Baidu 图片 acjson：`Forbid spider access`
- evanerichards.com：页面可达但画廊是 Elementor AJAX 加载，静态 HTML 无图

### 下载工具链（都在 repo 里）

- `scripts/curation-fetch.cjs`：通用抓取（文件下载 / `--json` 打印响应体），跟随重定向带浏览器 UA。**curl 与 powershell.exe 在本机被用户级权限规则拦截，一律走这个脚本**（已在 settings.local.json 白名单）
- `Pictures-staging/dl.cjs`：批量下载（多子域回退 + JPEG 头尾校验）；`dl-retry.cjs`：失败项走作品页 og:image 补抓
- `Pictures-staging/resize.ps1`：>1920px 统一缩 1920 宽（powershell.exe 需用户放行）

## 批一候选存档

66 条明细（含来源链接与推荐语）见 git 历史 `Pictures-staging/candidates.json`（gitignored，已随 merge 清空）；入库 21 条以 `Pictures/index.json` 为准，落选 45 张图在 `Pictures-staging/rejected/`。

## 批二进度

（待填写：候选清单、勾选结果、风格总结修订）
