# 夜航简报审美提升 · 总设计（烛光随行 + 九件入藏）

日期：2026-07-24 启动，2026-07-25 合并定稿
状态：已批准（烛光经高保真原型试用批准；其余九件经三轮原型逐件裁决，决策见 §2）
范围：夜航简报页四来源（digest / 求职 / Anthropic / 写作）为主；归位的手感（换画通用组件）与抵达（四源通用动画）按用户决策跨出简报页
原型档案：`.superpowers/brainstorm/1934-1784901039/content/`（烛光原型 / docent-walkthrough 十三件导览 / gallery-hifi-prototype）、`.superpowers/brainstorm/13716-1784913295/content/`（review-part2 生成仪式三方对比 / walkthrough-11-13 全场景）

## 1. 背景与目标

Academic 主题正文区遮罩压到 0.86–0.94（`BriefingVeil.tsx`），画作——应用仅有的三个注册诗意资产之一——在阅读区不可见，页面断裂为「报头是画廊，正文是终端」。继 2026-07-23 批次（星图/语录带/遮罩/空态）之后，本设计把简报模块的审美从「视觉资产」推进到「交互物理」：光随人行、动画收敛为一种重量语法、生成获得节奏与悬念、阅读获得聚焦照明、文档开始记得读者。全部经高保真原型（真实画作、真实排版、可交互）逐件评审裁决。

原则（用户明示）：文字服务于功能且适度；审美由交互与一切非语言要素承担；氛围功能给用户开关。

## 2. 决策总表（十三件逐件裁决）

| # | 作品 | 裁决 | 关键修正 |
|---|---|---|---|
| 0 | 烛光随行 | ✅ | 左下角开关，默认开；仅 Academic；求职源星蓝烛光 |
| 1 | 烛光有识 | ✅ | 依附烛光本体的调制层 |
| 2 | 归位的手感 | ✅ | **升级为换画通用组件**，不只简报页 |
| 3 | 展签 | ✅ | 替换现有 tooltip |
| 4 | 生成仪式 | ✅ **采用 B 原生方案**（卫星滑入井中），不采用混合 C | 三方对比原型评审后裁决 |
| 5 | 抵达 | ✅ | **四来源通用**展示动画 |
| 6 | 燃熄 | ✅ | 新增持久化 `briefingRead` |
| 7 | 阖卷 | ✅ | 与燃熄共享 `use-reading-finished` |
| 8 | 内化脊柱 | ✅ | 零新持久化，复用既有标注 |
| 9 | 今日展 | ❌ **出局（不做）** | — |
| 10 | 并置 | ✅ | **默认不展示**；左下角按钮开关，决策权留给用户 |
| 11 | 凑近即现 | ✅ → ❌ **2026-07-26 下线**（真实反馈过暗，静息 0.38 不可接受，spec「过暗再议」条款触发） | 重新定义为三区聚焦呼吸（F10），非逐元素距离 |

## 3. 功能设计

### F0 · 烛光随行（CandlelightLayer）

光标携带一池暖光，光在遮罩之上、文字之下，`mix-blend-mode: screen` 加法提亮；光照之处画作隐约透出，光标离开光渐熄。已否决替代方案：遮罩挖孔（CSS mask 全屏重绘、咬字风险）、Canvas/WebGL（过度工程）。

- 新组件 `src/components/briefing/CandlelightLayer.tsx`：固定定位全屏层，`z-index` 介于遮罩（z-1）与内容（z-5）之间，`pointer-events: none`
- 光源：640×640px 双层径向渐变，alpha ≤0.20（对比度红线）；rAF 惯性跟随 `pos += (target-pos) * 0.11`（光比光标慢半拍），只写 `transform`
- 首次 mousemove 淡入（opacity 0.45s）；mouseleave/窗口失焦渐熄；移动重燃；静止 8s 渐熄（定时器 + opacity class），再移动重燃
- **开关**：左下角固定按钮，内联 SVG 火焰 glyph，`aria-pressed`，`data-testid="briefing-candlelight-toggle"`；`state.json` 新增 `candlelightEnabled`（默认 `true`，旧数据回退 `true`）
- 配色：digest/Anthropic/写作 = 暖琥珀；求职源 = 星蓝 `#7fa8d9`（例外主色，§11 声明）
- 仅 Academic 主题；Newspaper 不渲染光层，开关置灰 + title「Academic 主题下可用」
- 挂载于 `Briefing.tsx`：全局 Chrome 始终挂载、不受内容分支影响（ui-styling §8）
- reduced-motion：退化为无惯性直接跟随（保留光，去位移平滑）
- 光层 `data-testid="briefing-candlelight"`

### F1 · 烛光有识（candle-aware）

依附 F0 的调制通道：

- **识标注**：悬停带标注段落/标注标记时，光晕变暖变宽（≤10%，`saturate(1.3) brightness(1.12)` 量级），✎ 回以柔和辉光
- **助手呼吸**：旁注/写作助手流式回复期间，烛光 ~4s 周期缓慢呼吸（opacity 振幅 ≤0.4）；done/error/cancel 均以 store streaming 态为准，结束即停
- 调制通道**不经过 React state**：正文容器单个 `pointerover/out` 事件代理 + 直写 glow DOM class（高频 pointer 不重渲染）
- 调制上限锁死；烛光总开关关闭时监听器一并卸载
- reduced-motion：调制静态化（静态微暖色调，无呼吸）
- E2E：悬停标注时 glow class 变化；mock 流式期间 breathing class 存在/结束后移除

### F2 · 归位的手感（重量语法 + 换画通用组件）

全应用统一的双弹簧物理，登记为引力/轨道语言的触觉层（§11 登记，非新装饰语言）：

- 新常量文件 `src/lib/motion-presets.ts`（只导出常量，ui-styling §10）：`SPRING_SETTLE`（过冲回稳，`cubic-bezier(.34,1.4,.5,1)`）、`SPRING_SLIDE`（快出慢停，`cubic-bezier(.22,1,.36,1)`）
- **换画通用组件**：`SwapPaintingButton` + `SurfaceBackground` 改造——旧画向下坠出（translateY + 微旋转 0.5deg、重力 ease-in，500ms），新画上方落入过冲回稳（spring-settle，550ms）；中点 ~200ms CRT 细颗粒闪烁（微检定手势）；四 surface（cover/home/study/briefing）全部生效。动画期间容器 `pointer-events: none` 防连点叠态，600ms 解锁
- 卫星落定回弹（随 F4 交付）；抽屉/面板开合不对称（开 ease-out / 关 ease-in + 末端 ≤8px 过冲）：旁注面板、写作助手面板
- 日期选中：条目向内容区移 4px 落定，旧选中弹回
- 过冲硬上限：scale ≤4% / 位移 ≤8px（克制红线）
- reduced-motion：全部退化为 150ms 透明度变化（塌缩为「淡」，不塌缩为「无」）
- E2E：换画落定 class 生命周期；连点两次无叠态

### F3 · 展签（PaintingLabel）

- 新组件 `src/components/PaintingLabel.tsx`：挂换画按钮旁，hover/focus-visible 浮出低透明米色衬线斜体小字（`formatAttribution()`：`画家 · 标题 · 年份`），离开淡出；换画后新展签浮现一次（~1.8s）作「已挂上」确认再隐退
- 替换现有 `title` tooltip（同一信息只保留一种可见协议）
- 数据来源 store `currentPaintings[surface]`，零新状态；无画作不渲染；Newspaper 换墨色
- testid `painting-label`；E2E：hover 断言可见且含画家名；换画后文本更新

### F4 · 生成仪式（B 原生方案：滑入 + 脉搏 + 检定）

改造 `BriefingConstellation`（digest 4 站 / 求职 5 站，坐标预设不变）：

- **卫星滑入**：stage 推进时已完成卫星沿引力线滑入引力井（transform 至井心 + scale 0.6 + 淡出，spring-settle 700ms），井口 bloom 一次；信息通道 = 井内 `n/N 已归位` 计数（用户已知悉并接受「已完成卫星不再驻留原位」）
- **生成脉搏**：引力井随 token 流微呼吸（scale 1.00↔1.015，240ms，节流 ≤2.5Hz 最小间隔而非 debounce）。数据源：store 新增**非持久化瞬态字段** `lastChunkAt`（复用既有 chunk 事件落点，无 IPC 协议变更）
- **全场让路**：生成期间烛光半径 -8%、亮度 -6%（仅 Academic 且烛光开启时）；完成后 1.2s 缓回
- **归档检定**：stage 进入 `finalizing` → 计数隐去，两粒光子沿井环互逐（正反 orbit）；`finalizing` <400ms 完成则压缩/跳过华彩（诚实约束，不设人为最短时长）
- **成功收束**：光子急停坠入井心、琥珀绽光一次（bloom）、计数 N/N
- **失败收束**：先**屏息 400ms**（井环冻结），再卫星整体外漂数像素 + 主色褪冷（saturate .35 brightness .75，600ms），随后才切现有错误面板。失败先被感到，再被读到
- **取消**：用户主动取消 → 检定冻结回中性（非失败收束），无屏息
- 失败驻留定时器必须在卸载/取消/快速切换路径全部清理（组件 key = source+date 重挂载天然归零）
- testid 契约保留：`briefing-progress`、`briefing-progress-step-{stageKey}`（docked 后仍可断言）、`briefing-constellation`、`briefing-constellation-well`；新增井体 `data-state="checking|resolved|failed"`
- reduced-motion：光子静态、无旋转/呼吸 scale（改井环透明度 0.85↔1.0 慢速交替）；`data-state` 照常迁移
- 求职源：同构换星蓝 `#7fa8d9`；Newspaper：墨色同构

### F5 · 抵达（四源通用展示动画）

- **digest/求职**：生成完成不是硬切——星图退潮（fade + scale 1.04，600ms）→ 遮罩报头处透亮一拍（~900ms，仅 Academic）→ 报题/日期/语录带/正文依次落定（`--spring-slide` 阶梯 delay，全程 ~800ms）
- **Anthropic/写作**：无星图，保留「遮罩透亮 + 内容阶梯落定」。Anthropic 打开文章时触发；写作源切换文章时对**编辑器容器**做阶梯落定（容器级 opacity/transform，不触碰 Milkdown 内部状态）
- **仅「新抵达」触发**：`arrivalKey = source:date:generatedAt`，生成流（loading→result 跳变）时 `data-arrival="fresh"`；历史日期/已读文章 = `data-arrival="revisit"`，直接呈现不重演
- 正文从第一帧起可交互（纯 opacity/transform，绝不阻塞）；生成→报错→重试快速切换不叠加（key 变化即重挂载）
- Newspaper 主题：同样生效（无遮罩透亮拍）
- testid：`briefing-reading-pane` + `data-arrival`；E2E：mock 生成完成断言 `fresh`，切历史日期断言 `revisit`，reduced-motion 无位移类

### F6 · 燃熄（日期列烛火）

- 日期列每项前置 6px 烛火点，三态：`unlit`（未生成=空芯圆）/ `lit`（已生成未读=琥珀燃着，求职星蓝）/ `spent`（读过=温灰，日期文字沉半阶）；折叠态 mini 按钮同三态
- **持久化（新字段）**：`state.json` 增加 `briefingRead: { digest: string[], 'job-briefing': string[] }`，默认空数组（safe-json 归一化，旧用户兼容），每源裁剪保留最近 120 个日期；零新 IPC
- store：`markBriefingRead(source, date)` action
- 「读完」判定：与 F7 共享 `src/lib/use-reading-finished.ts`——卷尾 sentinel + IntersectionObserver + hasScrolled 守卫（防短正文打开即已读）
- 当天重新生成维持 `spent`（已燃尽的那期不因重生成复燃——设计决策）；删除简报后 read 数组孤儿条目在裁剪窗口内惰性清理
- Newspaper 主题：墨色烛火
- testid：`briefing-date-flame-{date}` + `data-state`；E2E：生成→`lit`，滚到底→`spent`，重启后仍 `spent`

### F7 · 阖卷（colophon）

- 滚到卷尾（正文+来源区之后的真实卷尾 sentinel，`data-testid="briefing-volume-end"`），一枚 9px 琥珀 ◆ 一次性 600ms 淡入后**静驻**（`data-testid="briefing-colophon"`）；无 toast、无进度条
- 触发瞬间若烛光开启：全场烛光做 1.5s 呼吸式微暗再回稳；耦合方向仅 阖卷→烛光，反向无引用
- 与 F6 共享同一 `use-reading-finished`（唯一「读完」语义，禁止分叉）；极短简报不滚动则无阖卷（可接受，不加 dwell 计时器）
- 重开已读旧报：◆ 由 `spent` 态直接静态渲染
- reduced-motion：◆ 静态出现，无淡入、无烛光呼吸

### F8 · 内化脊柱（InternalizationSpine）

- 新组件 `src/components/briefing/InternalizationSpine.tsx`，挂 `AcademicBriefingLayout` 正文容器左缘：每 ❧ chunk 一节点的细竖脊，三态——**未访**（空心）/ **行经**（滚动经过填米色，会话级）/ **已内化**（琥珀 ◆ 封印，跨会话）
- 封印推导：既有 `annotationsRead(filePath)` IPC（零新 IPC），`selectedText` 包含匹配映射到 chunk；映射失败宁可少封不可错封；标注删除后封印下次打开消失
- 行经态：复用 `ArticleBodyChunks` 既有 `onChunkEnter` 上报，组件内以 filePath 为 key 累积 max-seen（本地 state）
- hover 节点 → 对应 ❧ 章节头泛暖光；点击 → 平滑滚动至该章（脊柱兼导航）
- 无 guide chunks 回退 markdown 章节锚点，仍无则不渲染；窄窗口（<900px）自动隐藏
- 切换日期/来源：key=filePath 重挂载，行经归零、封印重推导
- reduced-motion：状态瞬时切换
- §11 登记：脊柱是引力/轨道语汇衍生（显式声明）
- testid：`internalization-spine`、`spine-node-{i}` + `data-state`；E2E：滚动后 visited；seed 标注后 sealed

### F9 · 并置（PaintingPlate + 左下角开关，默认关）

- 新组件 `src/components/briefing/PaintingPlate.tsx`：digest Academic 阅读态报头区，21:9 画框（aspect-ratio 固定防 CLS）、发丝边框、深褐衬底 mat、画下展签行（`formatAttribution()` + 「今日展品」）；框内 brightness 1.1 与压暗背景拉开「展品 vs 环境光」两级
- **默认不展示**：`state.json` 新增 `paintingPlateEnabled`（默认 `false`，旧数据兼容）；左下角控制簇新增开关（与烛光开关同簇纵向堆叠，画框 glyph），`data-testid="painting-plate-toggle"`；跨重启保持
- 数据复用 `currentPaintings.briefing`（缓存命中，无双倍加载）；无画作 → 开关置灰
- 换画按钮移入画框角上（展示态）；隐藏态报头塌回现有布局
- Newspaper 主题：不渲染画框、开关置灰
- 仅 digest 源落地（其余源 YAGNI）→ **2026-07-26 用户决策变更**：画框扩展至四来源（digest / 求职 / Anthropic / 写作），仍仅 Academic 主题
- E2E：默认画框不存在 → 点开关出现且 img src 与 surface 背景一致 → reload 保持；换画后画框内 src 更新

### F10 · 聚焦呼吸（三区照明，原「凑近即现」重定义）

> **2026-07-26 已下线**：用户真实反馈「页面默认变暗、灰蒙蒙效果很差」，触发本节末尾「过暗再议」条款。实现（`use-focus-zone.ts` + `data-zone` 三区 + globals.css 聚焦呼吸块）已整体移除，ui-styling §11 登记同步撤销。以下为历史设计记录。

页面划分三个照明区，光标所在区全亮、其余两区缓熄（250ms opacity 过渡）。静息态（光标不在任何区/离窗）三区统一 **0.38 基线透明度**——原型即此参数，用户评审原话「这种呼吸感很棒」；可读性红线：任何状态文字可读、控件可点（边界 #12）：

- **Z1 阅读区**：正文 + 旁注标记 + 摘要/导读面板（三者联动，同亮同熄）
- **Z2 来源侧栏**（`BriefingSourceSidebar`）
- **Z3 列表列**（日期列 / 写作列 / Anthropic 列表列——按当前源）
- 光标在 Z1 → Z1 全亮，Z2/Z3 熄；光标在 Z2 → Z2 亮，Z1/Z3 熄；Z3 同理（**悬停一侧栏，另一侧栏也熄**——用户明示）
- 实现：页面根容器挂 `data-focus-zone="article|rail-source|rail-list|none"`，各区容器 CSS 响应；区容器 `pointerenter/leave` 代理分类（零 per-move 计算）；键盘 focus 进入视同光标进入（无障碍）
- 光标离窗 → 回静息态；与烛光共存（烛光管「点」的照亮，聚焦呼吸管「区」的明灭）
- 熄灭仅降透明度，不 `visibility:hidden`、不动布局
- reduced-motion：opacity 过渡保留（非位移），可接受
- E2E：hover 列表列 → `data-focus-zone="rail-list"` 且正文计算透明度 < 1；hover 正文 → `article`

## 4. 共享基建

| 基建 | 文件 | 服务 |
|---|---|---|
| 双弹簧常量 | `src/lib/motion-presets.ts`（新） | F2/F4/F5 |
| `use-reading-finished` | `src/lib/use-reading-finished.ts`（新） | F6/F7 共用，唯一「读完」语义 |
| 聚焦区管理 | `src/lib/use-focus-zone.ts`（新） | F10 |
| store 瞬态 `lastChunkAt` | `src/store/index.ts` | F4 脉搏（非持久化） |
| 换画通用组件 | `SwapPaintingButton` + `SurfaceBackground` 改造 | F2，四 surface |

## 5. 持久化字段（全部向后兼容，safe-json 归一化默认值）

| 字段 | 默认 | 用途 |
|---|---|---|
| `candlelightEnabled` | `true` | F0 烛光开关 |
| `briefingRead` | `{ digest: [], 'job-briefing': [] }` | F6 燃熄（每源裁剪 120） |
| `paintingPlateEnabled` | `false` | F9 并置开关 |

## 6. ui-styling §11 登记清单（随实现补入规则）

1. 烛光（点照明）与聚焦呼吸（区照明）——光的语言两个层级
2. 重量/归位语法（motion-presets 双弹簧）——引力语言的触觉层
3. 检定动效协议（掷骰悬念：互逐→急停坠落 vs 漂移褪冷）
4. 内化脊柱 motif——引力/轨道语汇衍生
5. 例外主色声明：求职星蓝烛光（同既有求职星图同色系）
6. 已出局不登记：今日展

## 7. 边界行为总清单（实现前冻结）

| # | 边界 | 行为 |
|---|---|---|
| 1 | 快速切源/切日期 | 组件 key=source+date(/filePath) 重挂载，动画态归零；定时器/rAF 全部清理 |
| 2 | 生成失败/取消 | F4：失败=屏息→漂移褪冷→错误面板；取消=冻结回中性，无屏息 |
| 3 | `finalizing` <400ms | 检定华彩压缩或跳过，诚实绑定真实时长 |
| 4 | 换画连点 | 动画期间容器 pointer-events:none，600ms 解锁 |
| 5 | 短正文 | hasScrolled 守卫：未滚动不触发燃熄/阖卷 |
| 6 | 无画作 | 展签/画框不渲染，画框开关置灰 |
| 7 | 无 guide chunks | 脊柱回退 markdown 章节锚点，仍无则不渲染 |
| 8 | 标注映射失败 | 宁可少封不可错封；删除标注后封印消失 |
| 9 | Newspaper 主题 | 烛光/画框不渲染、开关置灰；星图/烛火/展签换墨色；其余同构 |
| 10 | reduced-motion | 位移类动画退化 150ms 透明度；光呼吸改透明度通道；脊柱/烛火/◆ 静态；`data-state` 语义不丢 |
| 11 | 窄窗口 | 脊柱 <900px 隐藏；星图 SVG viewBox 自适应沿用 |
| 12 | 对比度红线 | 烛光 alpha ≤0.20；聚焦呼吸熄灭下限 0.38 保证文字可读可点 |
| 13 | 跨午夜挂着 | 烛火按日期字符串 key，today 按渲染计算，自然正确 |
| 14 | 旧 state.json | 三个新字段全部缺省回退默认值 |
| 15 | 烛光静止 8s | 渐熄；再移动重置定时器重燃 |
| 16 | 组件卸载 | rAF、定时器、IO 观察者全部清理，无泄漏 |

## 8. 测试策略

- **单元**：store 新字段默认值与 action（`markBriefingRead`、`toggleCandlelight`、plate toggle）；`motion-presets` 常量存在；脊柱 标注→chunk 映射（含失败兜底）；`use-reading-finished` hasScrolled 守卫
- **组件**：烛光层挂载/卸载与开关 `aria-pressed`、Newspaper 置灰；星图 `data-state` 迁移序列；卫星 docked 后 testid 可断言；展签 hover/换画更新；画框开关两态；聚焦区 `data-focus-zone` 分类
- **E2E**（扩展现有 briefing specs，每功能至少一条，入口 testid 必断言，feature-development §12）：
  - F0 烛光默认可见 → toggle 熄灭 → reload 仍熄灭（持久化）；求职星蓝光
  - F1 悬停标注 glow 变化；mock 流式 breathing 出现/消失
  - F2 换画落定 class 生命周期 + 连点防叠态
  - F4 生成全流程 data-state 序列 + 失败先于错误面板 + 求职星蓝同构
  - F5 fresh/revisit 两路
  - F6 生成→lit→滚到底 spent→重启仍 spent
  - F7 卷尾 ◆ 静驻 + 烛光 breath（开关关闭时不触发）
  - F8 脊柱 visited/sealed 两态
  - F9 画框默认无→开关→reload 保持
  - F10 三区 hover 的 data-focus-zone 与透明度断言
  - reducedMotion:'reduce' 全链路跑一遍
- 验收核对：空数据、失败中断、跨主题、跨源切换、跨重启持久化、取消/超时

## 9. 交付顺序建议

1. **批一（物理层）**：motion-presets + 换画通用组件（F2）+ 展签（F3）
2. **批二（仪式层）**：生成仪式 B（F4）+ 抵达（F5）
3. **批三（阅读层）**：use-reading-finished + 燃熄（F6）+ 阖卷（F7）+ 内化脊柱（F8）
4. **批四（照明层）**：烛光随行（F0）→ 烛光有识（F1）→ 并置（F9）→ 聚焦呼吸（F10）
5. 每批末尾：§11 规则登记 + E2E 补齐

## 10. 明确不做（YAGNI）

- 今日展（用户裁决出局）；混合方案 C（用户选 B）；逐元素距离版凑近即现（被三区聚焦取代）
- ~~Anthropic/写作/求职源的并置画框~~（2026-07-26 用户要求落地至四来源）；滚动光阶（此前已砍）；档案包浆做旧；行经态跨会话持久化；环境音/音效；思维内阁完整版（跨简报术语结晶）
- 聚焦呼吸的开关（无功能拉力，先不加；若真实反馈过暗再议）

---

## 2026-07-26 补充：画作深色化双层架构根因

### 发现

画作深色化是**双层架构**，本 spec 实施期间未察觉此依赖关系，导致后续修复反复失败。

### 两层的职责

| 层 | 组件 | 覆盖范围 | 创建时间 | 是否在本 spec 中变更 |
|---|------|---------|---------|-------------------|
| **第1层** | `SurfaceBackground` vignette（暗角） | **仅边缘**：中心 35% 为 `transparent`，文字所在区域零压暗 | 2026-05-11 (`ba810c1`) | **否**——暗角值从未改变 |
| **第2层** | 全页深色叠加层 | **整页**：包括文字所在的中心区域 | 2026-07-22 (`d1b998a`) 引入 `bg-[#0c0806]/[0.72]`，2026-07-23 (`3adcb02`) 升级为 `BriefingVeil` 渐变 | **否**——本 spec 未触及其存在 |

### 关键认知

暗角从 `ba810c1`（5月11日）引入至今**从未被修改过**。本 spec 的 F10（聚焦呼吸）和后续叠加的 `bg-ink/45 backdrop-blur-md` 是在已有双层之上**新增**的第三层，而非对原有层的修改。

2026-07-26 的批量修复 spec（`2026-07-26-briefing-polish-batch-design.md` §#0）错误地认为暗角在审美升级中被"削弱"，建议"恢复"暗角并删除 BriefingVeil。实际上暗角从未改变，删除全页叠加层（第2层）后只剩边缘暗角，中心区域画作完全无压暗——文字不可读。

### 正确修复

恢复全页深色叠加层（`bg-[#0c0806]/[0.72]`），即7月22日 BriefingVeil 引入前的原始方案。该值（72% 不透明度）经过真实使用验证，不会造成"灰蒙蒙"问题。
