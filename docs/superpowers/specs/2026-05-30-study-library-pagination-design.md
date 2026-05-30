# StudyLibrary 分页与卫星图画幅固定设计

## 问题陈述

当前 `StudyLibrary` 组件存在两个问题：

1. **主题列表溢出**：学习主题增多后，垂直列表超出视口，用户需要滚动大量内容才能到达底部。
2. **卫星图画幅失调**：`GravityField`（拖拽分组时的卫星图）绑定列表容器尺寸。当展开 topic 的 session 列表时，容器纵向拉长，卫星图比例被纵向拉伸，视觉失调。

## 设计目标

- 分页浏览主题列表，每页内容可控
- 卫星图画幅固定为一屏大小，不受列表展开/翻页影响
- 分页控件始终可见，不被内容顶出屏幕
- 翻页时卫星图节点位置保持不变（展示全部主题）

## 方案概述

采用 **"画框模式"（Fixed-Height Frame）**：

将 `StudyLibrary` 从"卷轴式"（内容推动容器增长）改为"画框式"（容器固定高度，内容在内部滚动）。分页控件固定在画框底部，session 展开在固定区域内滚动。

## 详细设计

### 1. 列表容器：固定高度画框

`StudyLibrary` 采用 flex column 布局：

```
StudyLibrary (relative, flex column)
├── GroupRibbon (flex-shrink: 0)
├── topic-list-container (flex: 1, overflow-y: auto, min-h: 0)
│   ├── TopicAccordion[]
│   └── GravityField (absolute, 仅在拖拽时显示)
└── Pagination (flex-shrink: 0)
```

关键 CSS：

```css
/* StudyLibrary 根容器 */
.study-library {
  display: flex;
  flex-direction: column;
  height: 100%; /* 占满右侧面板 */
}

/* 列表滚动区域 */
.topic-list-container {
  flex: 1;
  min-height: 0; /* 关键：允许 flex item 收缩 */
  overflow-y: auto;
}
```

**为什么 `min-height: 0` 是关键**：在 flex column 中，子元素的 `flex: 1` 默认不会收缩到比内容更小。`min-height: 0` 允许它正确收缩，让分页控件始终有空间。

### 2. 分页逻辑

- **每页数量**：10 个 topic
- **排序**：先按 group 索引，再按最后学习时间倒序（保持现有逻辑）
- **分页状态**：`currentPage: number` 存入组件本地 state（无需全局 store）
- **分页控件**：底部居中，左右箭头 + 圆点页码指示器

```tsx
const PAGE_SIZE = 10;

const paginatedTopics = useMemo(() => {
  const start = currentPage * PAGE_SIZE;
  return displayTopics.slice(start, start + PAGE_SIZE);
}, [displayTopics, currentPage]);

const totalPages = Math.ceil(displayTopics.length / PAGE_SIZE);
```

**边界处理**：
- 过滤后 topic 数变化导致当前页码超界时，自动回退到最后一页
- 空列表时显示现有空状态（星空占位图）

### 3. Session 展开：固定高度内部滚动

`TopicAccordion` 的 session 区域设置固定最大高度，超出部分内部滚动：

```tsx
// 展开动画容器
<div className="overflow-hidden transition-all duration-300">
  <div className="max-h-[160px] overflow-y-auto">
    {sessions.map(...)}
  </div>
</div>
```

- `max-h-[160px]` 约为 4-5 个 session 行的高度
- 内部滚动条使用系统默认样式（与全局 scrollbar 样式一致）
- 可同时展开多个 topic，各自独立滚动

### 4. GravityField：视口锁定

**核心改动**：将 GravityField 从列表容器的 absolute 定位改为全屏 fixed 定位。

```tsx
// GravityField 渲染
<div className="fixed inset-0 z-50 pointer-events-none">
  {/* SVG 磁吸线 */}
  {/* 分组中心节点 */}
  {/* 主题节点（全部主题，不限于当前页） */}
  {/* 拖拽中的主题 */}
</div>
```

**尺寸来源**：
- 容器中心：`(window.innerWidth / 2, window.innerHeight / 2)`
- 轨道半径：`Math.min(window.innerWidth, window.innerHeight) * 0.3`

**为什么展示全部主题**：
- 用户选择 A：卫星图始终展示完整学习库的分组关系
- 翻页只改变列表视图，不影响卫星图的节点集合和位置
- 拖拽分组时需要看到所有可能的目标分组

**拖拽坐标转换**：
- 原代码在 `handleMouseMove` 和 `handleMouseUp` 中使用 `containerRef.getBoundingClientRect()` 计算相对坐标
- 新代码直接使用 `e.clientX / e.clientY`（全局坐标）
- `GravityField` 接收 `dragPosition` 时直接使用全局坐标，不再做 `rect.left/top` 偏移
- 磁吸落点计算同样使用全局坐标与视口中心比较

### 5. 分页控件样式

底部固定栏：

```tsx
<div className="flex items-center justify-center gap-2 py-2 border-t border-slate/10">
  <button onClick={prevPage} disabled={currentPage === 0}>←</button>
  {Array.from({ length: totalPages }, (_, i) => (
    <button
      key={i}
      className={`w-1.5 h-1.5 rounded-full ${i === currentPage ? 'bg-ember' : 'bg-slate/30'}`}
      onClick={() => setCurrentPage(i)}
    />
  ))}
  <button onClick={nextPage} disabled={currentPage >= totalPages - 1}>→</button>
</div>
```

## 交互流程

### 正常浏览

1. 用户看到一页 10 个 topic
2. 点击 topic 展开 session，session 在固定区域内部滚动
3. 展开多个 topic 不影响列表总高度
4. 点击分页切换到下一页

### 拖拽分组（卫星图）

1. 用户按住某个 topic 拖动
2. `GravityField` 以 fixed 定位覆盖全屏
3. 所有分组中心按视口尺寸排列成轨道
4. 所有主题节点按分组环绕显示
5. 用户松开鼠标，计算最近分组，完成移动
6. `GravityField` 关闭
7. 列表刷新（topic 可能因 group 改变而重新排序）

### 新增 Topic

1. 学习完成后归档，生成新 topic
2. 新 topic 插入到正确排序位置
3. 如果当前页已满，分页总数 +1
4. 用户仍在当前页，不受干扰
5. 新 topic 若在当前页可见，可添加短暂高亮动画（可选增强）

## 文件改动范围

| 文件 | 改动 |
|------|------|
| 文件 | 改动 |
|------|------|
| `src/components/StudyLibrary.tsx` | 添加分页状态、分页控件、固定高度容器布局；`TopicAccordion`（内部组件）session 区域加 max-h 和 overflow-y-auto |
| `src/components/GravityField.tsx` | 改为 fixed 定位，使用 window.innerWidth/Height |
| `src/styles/globals.css` | 分页控件样式（如有需要） |

## 非改动范围

- `GroupRibbon`：保持不变，仍横向滚动
- 过滤逻辑：按 group 过滤后分页，过滤改变时重置到第 1 页
- 排序逻辑：保持不变
- `Home.tsx`：整体布局不变

## 验证清单

- [ ] 10 个 topic 刚好填满一页，第 11 个进入第 2 页
- [ ] 展开 session 后列表总高度不变，分页控件可见
- [ ] 拖拽触发 GravityField，全屏覆盖，节点位置正确
- [ ] 在 GravityField 显示时翻页，卫星图节点位置不变
- [ ] 过滤 group 后，分页重置到第 1 页
- [ ] 空列表时显示空状态，不显示分页
- [ ] 只有 1 页时不显示分页控件
