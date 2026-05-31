# Loading Screen 设计文档 — 学者夜话

## 1. 问题背景

应用启动时窗口会显示 5-6 秒纯色背景（`#2a1f1a`），期间执行：探活模型（网络请求）、扫描学习库（文件 IO）、加载状态等。用户面对空无一物的棕色画面等待，体验断裂。

## 2. 设计目标

- **视觉填充**：用有质感的画面填满加载等待期
- **进度可感知**：加载阶段与视觉变化一一对应
- **风格统一**：延续极乐迪斯科暗色油画质感 + 波兰尼默会知识隐喻
- **流程优化**：窗口先显示，后台并行完成初始化

## 3. 视觉方案：墨色扩散（Ink Bloom）

### 3.1 整体概念

暗色画布上，一滴墨缓缓扩散——从混沌中涌现秩序，隐喻默会知识从不可言说的潜意识中结构化浮现。

### 3.2 视觉元素

| 元素 | 描述 | 进度映射 |
|------|------|----------|
| **墨滴中心** | 画布中央的暖褐墨滴，边缘模糊 | 0%-20%：从 20px 膨胀到 60px |
| **涟漪环** | 4 层同心圆环向外扩散 | 15%-70%：逐层浮现，opacity 0→0.4 |
| **墨斑 blob** | 5 个有机形状的墨渍，方向各异 | 25%-80%：逐个浮现，模拟墨水在纸上的自然晕染 |
| **神经节点** | 12 个暖橙色光点 | 50%-95%：逐个点亮，象征知识网络激活 |
| **连接线** | 13 条节点间的微弱连线 | 60%-100%：逐条显现，形成网络拓扑 |
| **背景渐变** | 画布从纯黑向深褐微暖过渡 | 10%-50%： warmth 从 0 到 0.3 |
| **底部标签** | "EMERGING" 字样 | 75%-100%：从透明渐显到 opacity 0.35 |
| **进度条** | 底部 2px 细线 | 全程实时映射真实加载进度 |
| **阶段文字** | 当前加载阶段名称 | 随阶段切换：加载配置 → 探活模型 → 扫描学习库 → 初始化状态 |

### 3.3 配色

沿用现有设计系统：
- 背景：`#1a1410` → `#231610`（微暖过渡）
- 墨滴/涟漪：`rgba(100, 60, 30, α)` — 深褐
- 神经节点/连线：`rgba(217, 119, 87, α)` — `ember` 暖橙
- 文字：`rgba(232, 213, 183, α)` — `parchment` 米色
- 进度条：从左到右 `#d97757` → `rgba(217, 119, 87, 0.4)`

### 3.4 压暗边缘（Vignette）

画面四周保持 `box-shadow: inset 0 0 100px 30px rgba(0,0,0,0.55)`，强化沉浸感和油画质感。

## 4. 启动流程

```
用户点击应用图标
        ↓
  窗口立即创建并显示（ backgroundColor: #2a1f1a ）
        ↓
  React 挂载，渲染 <LoadingScreen />（墨色扩散动画启动）
        ↓
  后台并行执行：
    ├─ 探活模型（llmProbe）
    ├─ 扫描学习库（scanLibrary）
    ├─ 加载状态（getState）
    └─ 加载会话/分组（loadSessions / loadGroups）
        ↓
  各阶段完成 → 通过 IPC 推送进度到渲染进程
        ↓
  全部完成 → LoadingScreen 淡出（~600ms）→ 显示 Cover/Home
```

## 5. 组件设计

### 5.1 LoadingScreen 组件

独立组件，不依赖 Zustand store（store 尚未初始化）。

Props：无（通过 IPC 监听启动进度）

内部状态：
- `progress: number` — 0-100
- `stage: string` — 当前阶段名
- `visible: boolean` — 控制退出动画

生命周期：
1. 挂载时开始监听 `boot:progress` IPC 事件
2. 收到进度更新 → 更新 state → 驱动视觉元素
3. 收到 `boot:complete` → `visible = false` → CSS 淡出 → 卸载

### 5.2 视觉元素实现

全部使用 CSS + React state 驱动：
- 墨滴中心：`<div>` + `border-radius: 50%` + `filter: blur()`，大小由 progress 计算
- 涟漪环：4 个绝对定位 `<div>`，border + border-radius，opacity/scale 由 progress 阈值驱动
- 墨斑 blob：5 个椭圆 `<div>`，`filter: blur(5-8px)`，每个有独立的 progress 阈值
- 神经节点：12 个 2-4px 圆点，progress 阈值触发 background/box-shadow 变化
- 连接线：`<div>` + `transform: rotate()`，通过两点坐标计算角度和长度

**不使用 canvas/WebGL**：CSS 足够表达所需效果，且与现有技术栈一致。

### 5.3 动画节奏

总加载时间约 5-6 秒，视觉变化分布：
- 0-20%：墨滴膨胀，背景微暖
- 15-50%：涟漪环逐层扩散
- 25-80%：墨斑 blob 有机浮现
- 50-95%：神经节点逐个点亮
- 60-100%：连线逐条显现
- 75-100%："EMERGING" 渐显
- 100%：淡出过渡

所有过渡使用 `transition` + `requestAnimationFrame` 更新，不使用 CSS keyframe 动画（因为进度是离散推进的，需要响应真实状态）。

## 6. 错误处理

- `.env` 配置错误：在 `bootstrap()` 阶段就捕获，窗口创建后直接显示 fatal error 页面（不进入 LoadingScreen）
- 网络超时（探活模型）：LoadingScreen 继续运行，阶段标签显示"探活模型..."，超时后显示警告 toast，不影响进入应用
- 文件扫描错误：LoadingScreen 中阶段标记完成，错误在 Home 页面以 toast 提示

## 7. 与现有代码的关系

| 文件 | 改动 |
|------|------|
| `electron/main.ts` | 窗口创建提前；probeModel 改为异步后台执行 |
| `electron/preload.ts` | 新增 `onBootProgress` 通道 |
| `src/App.tsx` | 新增 `isBooting` 状态，booting 时渲染 `<LoadingScreen>` |
| `src/components/LoadingScreen.tsx` | **新增文件**，本设计的核心实现 |
| `src/store/index.ts` | `init()` 调用时机延后到 loading 完成后 |

## 8. 验收标准

- [ ] 启动时不再看到纯色背景，而是墨色扩散画面
- [ ] 底部进度条和阶段文字反映真实加载进度
- [ ] 5-6 秒内墨滴、涟漪、墨斑、节点、连线按节奏依次显现
- [ ] 加载完成后平滑过渡到 Cover 或 Home 页面
- [ ] 配置错误时仍正确显示 fatal error（不进入 loading）
- [ ] 视觉上与现有暗色油画风格保持一致
