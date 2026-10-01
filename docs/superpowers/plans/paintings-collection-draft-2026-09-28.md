# 学者夜话画作集 · 筛选与规整草案

> 创建时间：2026-09-28 ｜ 最近更新：2026-10-02（裁剪工具落地 + 批三影视线重启：TMDB 高清链路）
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

另有裁剪调整工具：`node scripts/curation-crop.cjs` → `crop-tool.html`（全库逐张调焦点/恢复隐藏，导出 focus-selection.json 后 `--apply`），见下方专节。

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
| **TMDB 搜索页**（批三新增） | `GET https://www.themoviedb.org/search/movie?query=<片名>` → HTML 里 `href="/movie/<id>"` | 网页直连可达（API 子域 api.themoviedb.org 超时被墙，但 www 可达）；中文片名可搜，个别词会跑偏（如"Nostalghia"返回疾速追杀2），**id 必须再开电影页核对片名+年份** |
| **TMDB 剧照清单**（批三新增） | `GET https://www.themoviedb.org/movie/<id>/images/backdrops` → 静态 HTML 含全部 `image.tmdb.org/t/p/original/<hash>.jpg` | 按社区票选排序，越靠前越是"经典镜头"——正好解决批二"缺经典镜头"的问题 |
| **TMDB 图 CDN**（批三新增） | `GET https://image.tmdb.org/t/p/<size>/<hash>.jpg`，size ∈ w300/w780/w1280/original | 直连可达；original 多为 1920×1080，部分 4K（>1920 需缩）；w780 做挑选缩略图 |

### ❌ 不可用（本机直连）

- Wikimedia Commons：连接被重置（被墙）——梵高透纳原图走不了 Commons，改道 WikiArt
- film-grab.com：超时；web.archive.org：超时；bluscreens.com：超时
- IMDb：HTTP 202 反爬；screencapped.net：403；screenmusings.org：域名已停放
- Bing 图片：结果 JS 渲染，静态 HTML 无 murl；Bing 网页搜索 site: 查询无有效结果
- 豆瓣剧照页/frodo API：JS 挑战/签名失效；豆瓣图床 img*.doubanio.com：418 反爬
- Baidu 图片 acjson：`Forbid spider access`；时光网 search.mtime.com：DNS 解析失败
- pics.filmaffinity.com：403
- evanerichards.com：页面可达但画廊是 Elementor AJAX 加载，静态 HTML 无图

### ⚠️ 半可用（CDN 通、发现链路缺）

- assets.fanart.tv：直连可达，但发现图需要 fanart.tv API key（未申请）
- images.mubicdn.net：直连可达，但 MUBI 页面未发现稳定的静态剧照清单

### 下载工具链（都在 repo 里）

- `scripts/curation-fetch.cjs`：通用抓取（文件下载 / `--json` 打印响应体），跟随重定向带浏览器 UA。**curl 与 powershell.exe 在本机被用户级权限规则拦截，一律走这个脚本**（已在 settings.local.json 白名单）
- `Pictures-staging/dl.cjs`：批量下载（多子域回退 + JPEG 头尾校验）；`dl-retry.cjs`：失败项走作品页 og:image 补抓
- `Pictures-staging/dl-tmdb.cjs`（批三新增，gitignored）：TMDB 链路 `search/backdrops/thumbs/pick`。**坑：git-bash 会把 `/hash.jpg` 形式的参数改写成 `C:/Program Files/Git/...`（MSYS 路径转换），传 hash 时去掉前导斜杠**
- `Pictures-staging/resize.ps1`：>1920px 统一缩 1920 宽（powershell.exe 被权限拦截后，批三改用 `npm install --prefix Pictures-staging/.tmp-sharp --no-save sharp` + node 脚本缩放；**写临时文件再 rename，sharp 读着的文件原地写会被 Windows 锁死**）

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

## 裁剪调整工具（2026-10-01 落地，scripts/curation-crop.cjs）

**起因**（用户原话）：「有几张比例偏高的图片我害怕应用默认截掉了我想截掉的部分……我希望好的图片展示其关键部分」+「把今天用封面删除键删掉的几幅也放进去」。

- `node scripts/curation-crop.cjs` → 生成 `Pictures-staging/crop-tool.html`：读取全库 211 幅 + state.json 的 hiddenPaintings（**已隐藏的排最前**，带「已隐藏」标记）
- **原图完整展示 + 橙色裁剪框**（2026-10-02 v2，应用户要求从"全屏看裁切效果"改为"原图上看框"）：框内 = 应用实际可见范围（object-cover 几何，框外压暗），拖框调焦点、↑↓ 微调、T 切换封面全屏/简报画框 21:9 两种宽高比的框
- 每幅可「移出库 / 恢复入库」切换（相对原始态的差值才记录）
- 导出 `focus-selection.json`（含 focus 改动 + unhide/hide 差值）→ `node scripts/curation-crop.cjs --apply [--dry-run]` 写回 index.json + state.json + 重生成 manifest
- **首次应用（2026-10-02）**：用户调整 111 幅焦点（大量罗斯科/比尔outs 竖构图从居中改为偏上）、恢复 10 幅隐藏、新隐藏 6 幅 → hiddenPaintings 19→15

### 勾选+定焦点一体页（gallery-pick.html，批三起用）

`generateGallery` 现在同时生成三版：gallery.html（网格）、gallery-swipe.html（全屏判定）、**gallery-pick.html（原图+裁剪框，勾选的同时定焦点）**。pick 页导出的 selection.json 形如 `{ selected: [...], focus: { id: "50% 30%" } }`（只含选中且调过焦点的），curation-merge 优先采用这里的 focus 覆盖候选自带值。

## 批三进度（2026-10-02，影视线重启）

**起因**（用户原话）：「第三批搜索，我希望你可以多找一点电影照片的信息源，当前图片质量实在太低，缺乏经典镜头」。批二宣布的"影视线终止"是图源能力问题（movie-screencaps 画质低、无塔可夫斯基/毕赣/费里尼），不是用户不要电影——**TMDB 链路打通后影视线重启**。

### 批三候选（31 帧影视，全部 TMDB original 1920×1080，已生成 gallery-swipe.html 待勾选）

- **库布里克《巴里·林登》×2**：烛光酒馆（全片用烛光/自然光拍摄，就是 18 世纪油画）、石墙旷野
- **塔可夫斯基 ×13**：《潜行者》4（水中人与狗 / 废墟三人 / 沙丘房间×2）、《乡愁》3（护烛 / 水洼拱窗倒影 / 自焚）、《镜子》3（栅栏母亲 / 黄昏田野 / 燃烧的木屋）、《牺牲》3（海边枯树 / 客厅群像 / 烧房子）
- **毕赣 ×5**：《路边野餐》3（隧道摩托 / 芭蕉与山 / 火与蓝光）、《地球最后的夜晚》2（海鸥墙红房间 / 红夜市）
- **费里尼《八部半》×2**：飞越堵车（白日梦开场）、黑羽毛女人
- **王家卫 ×3**：《花样年华》海报墙巷弄、《重庆森林》绿色酒吧 / 扶梯倒影
- **好莱坞 ×6**：《教父》2（伦勃朗式黑暗 / 百叶窗耳语）、《银翼杀手》2（飞过巨幕 / 眼中的城市）、《银翼杀手2049》2（橙色拉斯维加斯 / 巨大乔伊全息）

挑选原则（延续风格总结）：无人脸特写优先、要"事件"或"情绪浓度"、画意构图（背面人物/剪影/火光/雾气）优先；人脸海报式 fan-art 已剔除。

### 批三油画候选（28 幅，2026-10-02 抓取，已与影视合并为 59 条待勾选）

用户要求批三包含油画+电影。WikiArt 链路（text-list → og:image → 原图 → sharp 缩 1920）：

- **蒙克 ×4**：生命之舞 / 灰烬 / 桥上的少女 / 卡尔约翰街的黄昏
- **柯克西卡 ×1**：风的新娘（WikiArt 上此画叫 Bride of the Wind，不叫 The Tempest）
- **克林姆特 ×3**：吻（试探最著名的一张）/ 死与生 / 白桦农舍（匹配到 Farmhouse with Birch Trees）
- **雷东 ×3**：独眼巨人 / 奥菲莉亚 / 金色细胞（Guardian Spirit of the Waters 在 WikiArt 只有转拍照片，换金色细胞）
- **达利 ×4**：大象 / 十字若望的基督 / 蜜蜂飞行引起的梦 / 幻觉斗牛士
- **德尔沃 ×2**：沉睡之城（The Sleeping Town；美人鱼村不在 WikiArt）/ 回声
- **透纳 ×4**：巴亚湾 / 叹息桥 / 恰尔德·哈罗德 / 晚星（**slug 是 `william-turner`**，j-m-w-turner 和 joseph-mallord-william-turner 都列不出作品）
- **弗里德里希 ×4**：橡树林修道院 / 冰海 / 两人望月 / 人生诸阶段
- **莫奈 ×3**：黄昏圣乔治马焦雷 / 日落国会大厦 / 日本桥（睡莲池）

**WikiArt 新坑**：og:image 形如 `<file>.jpg!Large.jpg`——`!Large.jpg` 是整体追加的缩图后缀，要**整体剥掉**（replace 成 ''），替换成 '.jpg' 会得到 `.jpg.jpg` 404。

**油画批三**（批二文档方向：表现主义/象征主义/超现实/浪漫海景/莫奈夜景）~~暂未启动~~ 已完成抓取，见上节。

## 数据问题记录

- **billout-54 重复 id**：index.json 中 Escalator 与 Harvest 两条共用 `billout-54`（历史遗留）。影响：pickRandom 排除与 hiddenPaintings 隐藏会同时作用于两幅。待用户确认后改为 `billout-55`（一处改动，无持久化依赖）。

## 批三方向（待用户确认）

以油画为主战场继续放宽：表现主义（蒙克其他、柯克西卡）、象征主义（雷东其他、克林姆特试探）、超现实（达利其他、德尔沃）、浪漫主义海景（透纳再补、弗里德里希完整构图者）、印象派光色（莫奈夜景系列）。影视线终止。
