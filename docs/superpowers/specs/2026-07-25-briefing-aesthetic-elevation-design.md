# 夜航简报审美提升 · 第二批设计（生成仪式 / 重量语法 / 聚焦呼吸 等九件）

日期：2026-07-25
状态：已批准（用户经三轮高保真原型评审逐件裁决，决策见 §2）
范围：夜航简报页四来源（digest / 求职 / Anthropic / 写作）为主；归位的手感（换画通用组件）与抵达（四源通用动画）按用户决策跨出简报页
关联：`2026-07-24-candlelight-design.md`（烛光随行，本批 F1 依附于它）
原型档案：`.superpowers/brainstorm/1934-1784901039/content/`（docent-walkthrough / gallery-hifi-prototype）、`.superpowers/brainstorm/13716-1784913295/content/`（review-part2 三方对比 / walkthrough-11-13 全场景）

## 1. 背景与目标

继 2026-07-23 批次（星图/语录带/遮罩/空态）与烛光随行之后，本批把简报模块的审美从「视觉资产」推进到「交互物理」：动画收敛为一种重量语法、生成过程获得节奏与悬念、阅读获得聚焦照明、文档开始记得读者。全部经高保真原型（真实画作、真实排版、可交互）逐件评审裁决。

原则（用户明示）：文字服务于功能且适度；审美由交互与一切非语言要素承担；用户选择权优先（氛围功能给开关）。

## 2. 决策总表（十三件逐件裁决）

| # | 作品 | 裁决 | 关键修正 |
|---|---|---|---|
| 1 | 烛光随行 | ✅（已独立 spec） | 左下角开关，默认开 |
| 2 | 烛光有识 | ✅ | 见 §3-F1 |
| 3 | 归位的手感 | ✅ | **升级为换画通用组件**，不只简报页 |
| 4 | 展签 | ✅ | 替换现有 tooltip |
| 5/6 | 生成仪式 | ✅ **采用 B 原生方案**（卫星滑入井中），不采用混合 C | 见 §3-F4 |
| 7 | 抵达 | ✅ | **四来源通用**展示动画 |
| 8 | 燃熄 | ✅ | 新增持久化 `briefingRead` |
| 9 | 阖卷 | ✅ | 与燃熄共享 `use-reading-finished` |
| 10 | 内化脊柱 | ✅ | 零新持久化，复用既有标注 |
| 11 | 今日展 | ❌ **出局（不做）** | — |
| 12 | 并置 | ✅ | **默认不展示**；左下角按钮开关，决策权留给用户 |
| 13 | 凑近即现 | ✅ | **重新定义为三区聚焦呼吸**（见 §3-F10），非逐元素距离 |

## 3. 功能设计

### F1 · 烛光有识（candle-aware）

依附 `CandlelightLayer`（烛光 spec），为其加调制通道：

- **识标注**：光标悬停在带标注的段落/标注标记上时，光晕变暖变宽（琥珀占比上升 ≤10%，filter `saturate(1.3) brightness(1.12)` 量级），标注 ✎ 回以一次柔和辉光（text-shadow）
- **助手呼吸**：旁注/写作助手流式回复期间，烛光进入 ~4s 周期缓慢呼吸（opacity 振幅 ≤0.4）；流结束（done/error/cancel 均以 store streaming 态为准）即停
- 调制通道**不经过 React state**：事件代理（正文容器单个 `pointerover/out`）+ 直写 glow DOM 的 class/CSS 变量（高频 pointer 事件不触发重渲染）
- 所有调制上限锁死（只能被感到，不能被看清）；烛光总开关关闭时监听器一并卸载
- reduced-motion：调制静态化（悬停 = 静态微暖色调，无呼吸动画）
- testid：复用 `briefing-candlelight`；E2E 断言悬停标注时 glow class 变化、mock 流式期间 breathing class 存在/结束后移除

### F2 · 归位的手感（重量语法 + 换画通用组件）

全应用统一的双弹簧物理，登记为引力/轨道语言的触觉层（§11 登记，非新装饰语言）：

- 新常量文件 `src/lib/motion-presets.ts`（只导出常量，ui-styling §10）：`SPRING_SETTLE`（过冲回稳，CSS 近似 `cubic-bezier(.34,1.4,.5,1)`）、`SPRING_SLIDE`（快出慢停，`cubic-bezier(.22,1,.36,1)`）
- **换画通用组件**：`SwapPaintingButton` + `SurfaceBackground` 改造为通用件——旧画向下坠出（translateY + 微旋转 0.5deg、重力 ease-in，500ms），新画从上方落入过冲回稳（spring-settle，550ms）；中点插入 ~200ms CRT 细颗粒闪烁（微检定手势）；四 surface（cover/home/study/briefing）全部生效。换画期间容器 `pointer-events: none` 防连点叠态，600ms 解锁
- 卫星落定回弹（并入 F4 交付）；抽屉/面板开合不对称（开 ease-out / 关 ease-in + 末端 ≤8px 过冲）：旁注面板、写作助手面板
- 日期选中：条目向内容区方向移 4px 落定（spring-settle），旧选中弹回
- 过冲硬上限：scale ≤4% / 位移 ≤8px（克制红线）
- reduced-motion：全部退化为 150ms 透明度变化（塌缩为「淡」，不塌缩为「无」）
- E2E：换画触发后存在落定动画 class 且 600ms 后消失；连点两次不产生叠态

### F3 · 展签（PaintingLabel）

- 新组件 `src/components/PaintingLabel.tsx`：挂换画按钮旁，hover/focus-visible 时浮出一行低透明米色衬线斜体小字（`formatAttribution()` 输出：`画家 · 标题 · 年份`），离开淡出；换画后新展签浮现一次（~1.8s）作为「已挂上」确认再隐退
- 替换现有 `title` tooltip（同一信息只保留一种可见协议）
- 数据来源：store `currentPaintings[surface]`，零新状态；无画作不渲染；Newspaper 主题换墨色
- testid `painting-label`；E2E：hover 换画按钮断言展签可见且含画家名；换画后文本更新

### F4 · 生成仪式（B 原生方案：滑入 + 脉搏 + 检定）

改造 `BriefingConstellation`（digest 4 站 / 求职 5 站，坐标预设不变）：

- **卫星滑入**：stage 推进时，已完成卫星沿引力线滑入引力井（transform 至井心 + scale 0.6 + 淡出，spring-settle 700ms），井口 bloom 一次；信息通道 = 井内 `n/N 已归位` 计数（用户已知悉并接受「已完成卫星不再驻留原位」）
- **生成脉搏**：引力井随 token 流微呼吸（scale 1.00↔1.015，240ms，节流 ≤2.5Hz 最小间隔而非 debounce）。数据源：store 新增**非持久化瞬态字段** `lastChunkAt`（复用既有 chunk 事件落点，无 IPC 协议变更）
- **全场让路**：生成期间烛光半径 -8%、亮度 -6%（仅 Academic 且烛光开启时）；完成后 1.2s 缓回
- **归档检定**：stage 进入 `finalizing` → 计数隐去，两粒光子沿井环互逐（正反 orbit，辉光）；`finalizing` <400ms 完成则压缩/跳过华彩（诚实约束，不设人为最短时长）
- **成功收束**：光子急停坠入井心、琥珀绽光一次（bloom）、计数 4/4（或 5/5）
- **失败收束**：先**屏息 400ms**（井环冻结），再卫星整体外漂数像素 + 主色褪冷（saturate .35 brightness .75，600ms），随后才切现有错误面板。失败先被感到，再被读到
- **取消**：用户主动取消 → 检定冻结回中性（非失败收束），无 400ms 屏息
- 失败驻留定时器必须在卸载/取消/快速切换路径全部清理（async 生命周期规则；组件 key = source+date 重挂载天然归零）
- testid 契约保留：`briefing-progress`、`briefing-progress-step-{stageKey}`（落在对应卫星上，docked 后仍可断言）、`briefing-constellation`、`briefing-constellation-well`；新增井体 `data-state="checking|resolved|failed"`
- reduced-motion：光子静态呈现、无旋转/呼吸 scale（改为井环透明度 0.85↔1.0 慢速交替）；`data-state` 照常迁移
- 求职源：同构换星蓝 `#7fa8d9`；Newspaper：墨色同构

### F5 · 抵达（四源通用展示动画）

- **digest/求职**：生成完成不是硬切——星图退潮（fade + scale 1.04，600ms）→ 遮罩报头处透亮一拍（veil opacity 短暂下探，~900ms，仅 Academic）→ 报题/日期/语录带/正文依次落定（`--spring-slide` 阶梯 animation-delay，全程 ~800ms）
- **Anthropic/写作**：无星图，保留「遮罩透亮 + 内容阶梯落定」段。Anthropic 在打开文章时触发；写作源在切换文章时对**编辑器容器**做阶梯落定（容器级 opacity/transform，不触碰 Milkdown 内部状态）
- **仅「新抵达」触发**：`arrivalKey = source:date:generatedAt`，来自生成流（loading→result 跳变）时 `data-arrival="fresh"`；切换历史日期/已读文章 = `data-arrival="revisit"`，直接呈现不重演
- 正文从第一帧起可交互（纯 opacity/transform，绝不阻塞）；生成→报错→重试快速切换不叠加（key 变化即重挂载）
- Newspaper 主题：同样生效（无遮罩透亮拍，因无画作）
- testid：`briefing-reading-pane` + `data-arrival` 属性；E2E：mock 生成完成断言 `fresh`，切历史日期断言 `revisit`，reduced-motion 下无位移类

### F6 · 燃熄（日期列烛火）

- 日期列每项前置 6px 烛火点，三态：`unlit`（未生成=空芯圆）/ `lit`（已生成未读=琥珀燃着，求职星蓝）/ `spent`（读过=温灰，日期文字沉半阶）；折叠态 mini 按钮同三态
- **持久化（新字段，已获批准）**：`state.json` 增加 `briefingRead: { digest: string[], 'job-briefing': string[] }`，默认空数组（旧用户向后兼容，safe-json 归一化），每源裁剪保留最近 120 个日期；零新 IPC（走现有持久化通道）
- store：`markBriefingRead(source, date)` action
- 「读完」判定：与 F7 共享 `src/lib/use-reading-finished.ts`——卷尾 sentinel + IntersectionObserver + hasScrolled 守卫（防短正文打开即已读）
- 当天重新生成维持 `spent`（读过的那期已燃尽，新一期是同一日的余温——设计决策）；删除简报后 read 数组孤儿条目在裁剪窗口内惰性清理
- Newspaper 主题：墨色烛火
- testid：`briefing-date-flame-{date}` + `data-state`；E2E：生成→`lit`，滚到底→`spent`，重启后仍 `spent`（持久化）

### F7 · 阖卷（colophon）

- 滚到卷尾（正文+来源区之后的真实卷尾 sentinel，`data-testid="briefing-volume-end"`），一枚 9px 琥珀 ◆ 一次性 600ms 淡入后**静驻**（`data-testid="briefing-colophon"`）；无 toast、无进度条
- 触发瞬间若烛光开启：全场烛光做一次 1.5s 呼吸式微暗再回稳（阖卷带起的风）；耦合方向仅 阖卷→烛光，反向无引用
- 与 F6 共享同一 `use-reading-finished`（hasScrolled 守卫 + IntersectionObserver），禁止两套「读完」语义分叉；极短简报不滚动则无阖卷（可接受，不加 dwell 计时器）
- 重开已读旧报：◆ 由 `spent` 态直接静态渲染，无需再滚
- reduced-motion：◆ 静态出现，无淡入、无烛光呼吸

### F8 · 内化脊柱（InternalizationSpine）

- 新组件 `src/components/briefing/InternalizationSpine.tsx`，挂 `AcademicBriefingLayout` 正文容器左缘：每 ❧ chunk 一节点的细竖脊，三态——**未访**（空心）/ **行经**（滚动经过填米色，会话级）/ **已内化**（琥珀 ◆ 封印，跨会话）
- 封印推导：既有 `annotationsRead(filePath)` IPC（零新 IPC），`selectedText` 包含匹配映射到 chunk；映射失败宁可少封不可错封；标注删除后封印下次打开消失（内化可被遗忘）
- 行经态：复用 `ArticleBodyChunks` 既有 `onChunkEnter` 上报，组件内以 filePath 为 key 累积 max-seen（本地 state）
- hover 节点 → 对应 ❧ 章节头泛暖光；点击 → 平滑滚动至该章（脊柱兼导航）
- 无 guide chunks 时回退 markdown 章节锚点，仍无则不渲染；窄窗口（<900px）自动隐藏
- 删除全部标注/切换日期：key=filePath 重挂载，行经归零、封印重推导
- reduced-motion：状态瞬时切换
- §11 登记：脊柱是引力/轨道语汇的衍生（显式声明）
- testid：`internalization-spine`、`spine-node-{i}` + `data-state`；E2E：滚动后节点 visited；seed 标注后对应节点 sealed

### F9 · 并置（PaintingPlate + 左下角开关，默认关）

- 新组件 `src/components/briefing/PaintingPlate.tsx`：digest Academic 阅读态报头区，21:9 画框（aspect-ratio 固定防 CLS）、发丝边框、深褐衬底 mat、画下展签行（`formatAttribution()` + 「今日展品」）；框内亮度/饱和略升（brightness 1.1）与压暗背景拉开「展品 vs 环境光」两级
- **默认不展示**：`state.json` 新增 `paintingPlateEnabled: boolean`（默认 `false`，旧数据兼容）；左下角控制簇新增开关按钮（与烛光开关同簇，纵向堆叠，画框 glyph），`data-testid="painting-plate-toggle"`；点击展示/隐藏，跨重启保持
- 数据复用 `currentPaintings.briefing`（浏览器缓存命中，无双倍加载）；无画作 → 开关置灰
- 换画按钮移入画框角上（展示态）；隐藏态报头塌回现有布局
- Newspaper 主题：不渲染画框、开关置灰（无画作可裱）
- 仅 digest 源落地（Anthropic/写作/求职 YAGNI，后续按需）
- E2E：默认画框不存在 → 点开关出现且 img src 与 surface 背景一致 → reload 后保持；换画后画框内 src 更新

### F10 · 聚焦呼吸（三区照明，原「凑近即现」重定义）

页面划分为三个照明区，光标所在区全亮、其余两区缓熄（250ms opacity 过渡）。静息态（光标不在任何区/离窗）三区统一降至 **0.38 基线透明度**——原型即此参数，用户评审原话「这种呼吸感很棒」；可读性红线：任何状态下文字不得因透明度不可读、控件不得失焦（边界 #12）：

- **Z1 阅读区**：正文 + 旁注标记 + 摘要/导读面板（三者联动，同亮同熄）
- **Z2 来源侧栏**（`BriefingSourceSidebar`）
- **Z3 列表列**（日期列 / 写作列 / Anthropic 列表列——当前源是哪个就哪个）
- 光标在 Z1 → Z1 全亮，Z2/Z3 熄；光标在 Z2 → Z2 亮，Z1/Z3 熄；Z3 同理（**悬停一侧栏，另一侧栏也熄**——用户明示）
- 实现：页面根容器挂 `data-focus-zone="article|rail-source|rail-list|none"`，各区容器 CSS 响应；光标分类用区容器 `pointerenter/leave`（冒泡代理，零 per-move 计算）；键盘 focus 进入某区视同光标进入（无障碍）
- 光标离窗 → 回静息态；与烛光共存（烛光管「点」的照亮，聚焦呼吸管「区」的明灭，物理自洽）
- 熄灭仅降透明度（保有可点击性），不 `visibility:hidden`、不移动布局
- reduced-motion：opacity 过渡保留（非位移），可接受
- E2E：hover 列表列 → 根 `data-focus-zone="rail-list"` 且正文容器计算透明度 < 1；hover 正文 → `article`

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
| `briefingRead` | `{ digest: [], 'job-briefing': [] }` | F6 燃熄（每源裁剪 120） |
| `paintingPlateEnabled` | `false` | F9 并置开关 |
| `candlelightEnabled` | `true` | 烛光（已独立 spec） |

## 6. ui-styling §11 登记清单（随实现补入规则）

1. 重量/归位语法（motion-presets 双弹簧）——引力语言的触觉层
2. 检定动效协议（掷骰悬念：互逐→急停坠落 vs 漂移褪冷）
3. 内化脊柱 motif——引力/轨道语汇衍生
4. 聚焦呼吸（三区照明）——烛光语言的区域层
5. 已出局不登记：今日展

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
| 10 | reduced-motion | 位移类动画退化为透明度变化（150ms）；光呼吸改透明度通道；脊柱/烛火/◆ 静态呈现；`data-state` 语义不丢 |
| 11 | 窄窗口 | 脊柱 <900px 隐藏；星图 SVG viewBox 自适应沿用 |
| 12 | 对比度红线 | 烛光 alpha ≤0.20；聚焦呼吸熄灭下限保证文字可读可点 |
| 13 | 跨午夜挂着 | 烛火按日期字符串 key，today 按渲染计算，自然正确 |
| 14 | 旧 state.json | 三个新字段全部缺省回退默认值 |

## 8. 测试策略

- **单元**：store 新字段默认值与 action（`markBriefingRead`、两个 toggle）；`motion-presets` 常量存在；脊柱 标注→chunk 映射（含失败兜底）；`use-reading-finished` hasScrolled 守卫
- **组件**：星图 `data-state` 迁移序列（pending→checking→resolved/failed）；卫星 docked 后 testid 仍可断言；展签 hover/换画更新；画框开关两态；聚焦区 `data-focus-zone` 分类
- **E2E**（扩展现有 briefing specs，每功能至少一条，入口 testid 必断言，feature-development §12）：
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
4. **批四（照明层）**：烛光有识（F1，烛光本体落地后）+ 并置（F9）+ 聚焦呼吸（F10）
5. 每批末尾：§11 规则登记 + E2E 补齐

## 10. 明确不做（YAGNI）

- 今日展（用户裁决出局）；混合方案 C（用户选 B）；逐元素距离版凑近即现（被三区聚焦取代）
- Anthropic/写作/求职源的并置画框；滚动光阶（此前已砍）；档案包浆做旧；行经态跨会话持久化；环境音/音效；思维内阁完整版（跨简报术语结晶）
- 聚焦呼吸的开关（无功能拉力，先不加；若真实反馈过暗再议）
