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

### 批二候选（55 条，2026-09-29 就位，待勾选）

**画作线 35（放宽：表现主义/象征主义/超现实/色调主义/印象派/美国写实）**

- **达利 ×4**：记忆的永恒 / 记忆永恒的解体 / 水仙的变形 / 天鹅倒影成大象
- **Caspar David Friedrich ×5**：雾海上的旅人 / 海边月升 / 易北河谷的雾 / 暮色杉林(1824) / 群山起雾
- **蒙克 ×4**：星夜(1924) / 月光(1893) / 忧郁(1892) / 夏夜之谜（刻意不选《呐喊》——太被耗尽）
- **Odilon Redon ×2**：闭眼 / 但丁的幻象
- **Whistler 夜曲 ×4**：老巴特西桥 / 切尔西 / 威尼斯圣马可 / 火轮
- **Böcklin ×2**：死之岛 / 静海
- **Hopper ×5**：夜鹰 / 自动餐馆 / 加油站 / 蓝色的夜 / 周日清晨（亮色对照）
- **莫奈 ×4**：雾中国会 / 雪日草垛 / 埃特勒塔落日 / 威尼斯贡多拉
- **透纳补遗 ×5**：驶向威尼斯 / 海上渔民（其第一幅展出油画）/ 芬格尔洞 / 背风岸的渔民 / 彭布罗克城堡雷雨

**影视线 20（批一教训修正：空镜/无人正脸优先，广撒 8 部）**

- **2001 太空漫游 (4K) ×3**：天体对齐 / 黎明云海 / 红色地平线（"几乎就是一张透纳"）
- **闪灵 ×3**：空大堂打字机 / 雪夜迷宫 ×2
- **教父 ×2**：铁门黄昏 / 五大家族黑暗会议（人脸密度对照组）
- **现代启示录 ×2**：湄公河黄昏 / 神庙剪影
- **出租车司机 ×3**：雨窗霓虹（纯氛围）/ 牛奶静物（怪诞对照）/ 夜街俯瞰
- **柏林苍穹下 ×2**：黑白柏林俯瞰 ×2
- **天使爱美丽 ×3**：绿光走廊背影 / 夜色旋转木马 / 红房间烛光（"电影感暖色"对照组）
- **红磨坊 ×2**：云海铁塔 / 剧院后台烛光

> **目录覆盖说明**：可达图源（movie-screencaps 1462 部）中**没有塔可夫斯基、费里尼、王家卫、毕赣**——这几位需用户自供截图方可纳入；本轮以库布里克/科波拉/斯科塞斯/文德斯/好莱坞经典的空镜代替。

### 批二勾选结果（55 判 25 选，2026-09-29 入库，186→211）

**入选 25**：达利 4/4、蒙克 4/4、Hopper 4/5（自动餐馆落选）、莫奈 3/4、Whistler 2/4、Böcklin 死之岛、Friedrich 旅人、Redon 闭眼、透纳补遗 4/5、**影视仅 2001 天体对齐帧 1/20**

**落选要点**：Friedrich 4/5 落选（只留最"完整构图"的旅人，安静的雾景全灭）；影视线再次近全灭（1/20），幸存者是全场最不像电影截图的一帧。

### 风格总结修订（批二后，当前最准描述）

1. **影视线终止**：两批合计 1/43。无论是剧照感强的还是纯空镜都不收——用户要的是"画"，摄影介质本身可能就是红线。唯一幸存帧（2001 天体对齐）是纯图形。未来不再主动搜集影视帧；若用户想要特定帧可自供。
2. **确认批一判断并收窄**：笔触/表现性 > 平面抽象。蒙克（表现主义笔触）4/4、达利（超现实具象）4/4 全收；安静到近乎"空"的风景（Friedrich 雾景、Sugimoto 海景、Martin 网格）不收——**画面需要"事件"或"情绪浓度"，纯氛围/纯留白不行。**
3. **"完整构图的标志性"加分**：Friedrich 只收旅人（最完整）、Whistler 收桥与切尔西（元素明确）——有清晰视觉锚点的优于弥散构图。
4. **介质光谱收敛**：油画 > 坦培拉/粉彩（Redon 1/2）> 摄影（几乎全灭）。后续批次以油画为主战场：表现主义、象征主义、超现实、浪漫主义海景、印象派光色。

## focus 焦点机制（2026-09-29 落地）

**问题**：应用全屏 `object-cover` 居中裁切，211 幅中 141 幅 h/w > 1.05，竖构图的关键部位会被裁掉。
**机制**：`Pictures/index.json` 与 `Painting` 类型新增可选 `focus`（CSS object-position，如 `"50% 30%"`），经 manifest 插件透传，`SurfaceBackground` 与 `PaintingPlate` 应用；缺省 `50% 50%` 居中。curation-merge 同步透传 candidates.json 的 focus 字段。
**首批焦点值**：friedrich-1 雾海旅人 `50% 55%`、whistler-1 巴特西桥 `50% 30%`、gogh-2 咖啡馆露台 `50% 45%`、gogh-5 柏树之路 `50% 40%`。
**调优方式**：直接改 index.json 对应条目的 focus 重跑 `node scripts/build-manifest.cjs` 即可（dev 重启生效）。

## 数据问题记录

- **billout-54 重复 id**：index.json 中 Escalator 与 Harvest 两条共用 `billout-54`（历史遗留）。影响：pickRandom 排除与 hiddenPaintings 隐藏会同时作用于两幅。待用户确认后改为 `billout-55`（一处改动，无持久化依赖）。

## 批三方向（待用户确认）

以油画为主战场继续放宽：表现主义（蒙克其他、柯克西卡）、象征主义（雷东其他、克林姆特试探）、超现实（达利其他、德尔沃）、浪漫主义海景（透纳再补、弗里德里希完整构图者）、印象派光色（莫奈夜景系列）。影视线终止。
