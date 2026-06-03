# 学习报告图表自动生成 — 设计文档

> 日期：2026-06-03
> 状态：待实现
> 决策者：用户确认通过 brainstorming 流程
> 实验验证：已运行子 agent 测试 LLM 直接生成 SVG，确认存在文本重叠/溢出等布局问题，排除方案三

---

## 1. 背景与目标

### 1.1 当前状态

学者夜话已有学习报告归档功能（`finalizeProgress`），报告以 `.md` 文件存入 session 目录。学习库页面（`StudyLibrary`）可浏览历史会话，但报告是纯文本，缺乏可视化辅助。

现有图片功能（`学习配图`）是用户手动放置图片到 session 目录，应用只负责展示。该功能使用率低，未形成闭环。

### 1.2 目标

为每次学习报告**自动生成一张知识图谱**（Mermaid 图表），帮助用户在复习时一眼抓住核心结构。图表与学习报告绑定，跟随 session 持久化。

### 1.3 成功标准

- 归档完成后，90%+ 的 session 能在 30 秒内生成有效图表
- 图表能在前端正确渲染，暗色主题与现有 UI 一致
- 已有报告但无图表的 session，提供一键补生成
- 图表生成失败时静默降级，不阻断用户体验

---

## 2. 方案选择

### 2.1 实验验证

子 agent 调用 Kimi k2.6 直接生成 SVG XML（方案三），输入 Agent 规划方法学习报告。

**结果**：
- SVG 结构完整、颜色正确
- **发现硬 bug**：同一坐标（y="462"）出现两行重叠文字，第二行完全不可见
- **发现溢出风险**：多行文本字符数远超容器宽度
- **根因**：LLM 无布局引擎，坐标估算必然出错

**结论**：方案三（LLM 直接 SVG）不可靠，排除。

### 2.2 最终方案：Mermaid 路线

| 维度 | 评估 |
|------|------|
| 布局可靠性 | ✅ mermaid.js 引擎自动计算，零布局风险 |
| 内容适应性 | ✅ 换内容不改语法，引擎自适应 |
| 暗色主题 | ✅ themeVariables 完全可控 |
| 实施成本 | 低 — 一个 npm 包 + prompt 模板 + 前端集成 |

---

## 3. 架构

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  学习会话结束   │────▶│ finalizeProgress│──▶│ generateDiagram │──▶│  保存 .mmd   │────▶│ mermaid.js  │
│  (用户点结束)   │     │ (归档流程)     │     │ (Kimi分析)    │     │ (session目录) │     │ (前端渲染)  │
└─────────────────┘     └──────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
                                                              │
                                                              ▼
                                                    ┌──────────────┐
                                                    │ 补生成按钮   │
                                                    │ (已有报告    │
                                                    │  无图表时)   │
                                                    └──────────────┘
```

### 3.1 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 图表生成器 | `electron/lib/diagram.ts` | 接收报告文本，组装 prompt，调 Kimi API，解析 JSON，保存 `.mmd` |
| Prompt 模板 | `electron/prompts/diagram_prompt_v1.md` | 已诊断优化，结构化输出 JSON |
| 诊断报告 | `electron/prompts/diagram_diagnosis_report.md` | Prompt 诊断过程记录 |
| 前端渲染器 | `src/components/MermaidRenderer.tsx` | mermaid.js 渲染封装 |

### 3.2 存储约定

- **文件名**：`学习图表.mmd`
- **位置**：与 `学习报告.md` 同 session 目录
- **MIME 类型**：`text/plain`
- **编码**：UTF-8

---

## 4. Prompt 设计

文件：`electron/prompts/diagram_prompt_v1.md`

经过 prompt-diagnosis skill 诊断，已修复以下问题：
- 删除无效的 `:::tip` Mermaid 语法引用
- 新增 6 个禁止字符红线（`<`, `>`, `&`, `#`, `"`, `'`）
- 新增规则优先级排序：语法正确性 > 可读性 > 节点数 > 信息覆盖
- 新增好坏标准（节点必须有连线关系，禁止纯平铺）
- 使用 Mermaid v11 标准 `%%{init}%%` 单行语法

Prompt 核心结构：
1. **角色定义**：学习可视化专家
2. **分析阶段**：4 种图表类型（comparison/flow/mindmap/timeline）+ 判断标准
3. **输出格式**：严格 JSON（chartType/title/rationale/mermaid）
4. **Mermaid 语法规范**：init 指令、节点命名、文字约束、禁止字符、数量限制、关系要求、样式覆盖、禁止事项
5. **规则优先级**：4 级排序
6. **好坏标准**：对照表
7. **示例**：Agent 规划方法对比（含完整 JSON + mermaid 语法）
8. **输入占位**：`{{report_body}}`

---

## 5. 图表类型匹配策略

Kimi 根据报告内容自动判断：

| 内容特征 | 图表类型 | Mermaid 语法 |
|---------|---------|-------------|
| 概念对比/关系网络 | 对比图 | `flowchart LR/TD` |
| 方法论/步骤流程 | 流程图 | `flowchart TD` + 判断节点 |
| 分类/层级/发散 | 思维导图 | `mindmap` |
| 演变/历史/时序 | 时间线 | `timeline` |

---

## 6. API 与类型变更

### 6.1 SessionMeta 扩展

```typescript
// src/types/index.ts
export type SessionMeta = {
  // ... existing fields ...
  hasDiagram: boolean      // 新增，替代 hasImage 语义
  diagramFile?: string     // 新增，"学习图表.mmd"
}
```

### 6.2 getSessionMeta 更新

`electron/ipc/files.ts` 中 `getSessionMeta` 函数：
- 扫描文件时查找 `学习图表.mmd`
- 设置 `hasDiagram` 和 `diagramFile`

### 6.3 新增 IPC

新增 `diagram:generate` IPC，由主进程读取报告内容并执行生成：

```typescript
// src/types/index.ts 中 IpcApi
'diagram:generate': (args: { dirName: string; sessionNumber: number }) => Promise<void>
```

主进程根据 `dirName` + `sessionNumber` 定位 session 目录，读取 `学习报告.md` 内容，调用 `generateDiagram` 函数生成图表。渲染进程无直接 LLM 调用能力，必须通过 IPC。

---

## 7. 前端渲染

### 7.1 MermaidRenderer 组件

```tsx
// src/components/MermaidRenderer.tsx
// 使用 mermaid npm 包
// initialize({ startOnLoad: false, securityLevel: 'strict' })
// render(id, source) -> svg string
// dangerouslySetInnerHTML 注入
// 错误时显示 "图表渲染失败，请重试"
```

### 7.2 SessionViewer 扩展

```tsx
const isMermaid = fileName.endsWith('.mmd')

{isMermaid && content && <MermaidRenderer source={content} />}
```

### 7.3 暗色主题

暗色配色通过 Mermaid `theme: base` + `themeVariables` 在语法层面配置，前端无需额外 CSS。

配色值（与项目暗色主题一致）：
- 背景：`#2a1f1a`
- 节点填充：`#3d2b22`
- 节点文字：`#e8d5b7`
- 边框/连线：`#8c6b5d`
- 强调：`#d97757`

---

## 8. 触发逻辑

### 8.1 全自动触发

```
finalizeProgress 归档完成
  └── 后台触发 generateDiagram(reportBody) [不 await]
        ├── 读取 prompt 模板
        ├── 调 Kimi API (30s timeout)
        ├── 解析 JSON 响应
        ├── 验证 mermaid 字段
        └── 保存为 学习图表.mmd
              ├── 成功：静默更新 hasDiagram
              └── 失败：记录日志，不通知用户
```

### 8.2 补生成按钮

- **位置**：`StudyLibrary` session 卡片
- **条件**：`hasReport && !hasDiagram`
- **文案**：`📊 生成图表`
- **行为**：点击后调用 `diagram:generate` IPC，完成后刷新卡片状态
- **加载态**：显示轻量 spinner，不阻断其他操作

### 8.3 异步不阻塞

`generateDiagram` 在 `finalizeProgress` 完成后通过 `setTimeout` 或 `Promise.resolve().then()` 触发，不 await。归档流程不受图表生成延迟影响。

---

## 9. UI 迁移

原有手动图片功能（`学习配图`）废弃，`StudyLibrary` 中图片相关 UI 完全替换为图表：

| 原 | 新 | 说明 |
|---|---|---|
| `hasImage` | `hasDiagram` | 类型字段替换 |
| `imageFile` | `diagramFile` | 类型字段替换 |
| `学习配图.xxx` | `学习图表.mmd` | 文件扫描规则替换 |
| 图片图标 | `📊` 图标 | UI 文案 |
| "图片" | "图表" | UI 文案 |

**迁移策略**：
- `getSessionMeta` 中移除 `学习配图` 扫描逻辑，改为扫描 `学习图表.mmd`
- `SessionViewer` 中移除 `mimeType.startsWith('image/')` 分支的通用图片渲染，改为 `.mmd` 文件走 `MermaidRenderer`
- 如果 session 目录中存在旧的 `学习配图` 文件，不再显示（功能已废弃）

---

## 10. 错误处理

| 错误场景 | 行为 |
|---------|------|
| Kimi 返回非 JSON | 静默失败，记录日志 |
| JSON 缺少 mermaid 字段 | 静默失败，记录日志 |
| Mermaid 语法错误 | 前端渲染失败，显示"图表渲染失败，请重试" |
| API 超时（30s） | 静默失败，记录日志 |
| 保存文件失败 | recoveryDump 暂存，记录日志 |

---

## 11. 测试策略

### 11.1 Prompt 测试

用同一份学习报告，分别用原 prompt 和新 prompt 各调一次 Kimi：
- 对比语法错误率
- 对比节点平均字数
- 对比是否存在伪图表（纯平铺）

### 11.2 集成测试

- `diagram:generate` IPC 端到端测试
- `SessionViewer` 渲染 `.mmd` 测试
- `StudyLibrary` 补生成按钮交互测试

---

## 12. 依赖

- `mermaid` npm 包（v11+）
- 现有 Kimi API 封装（`electron/lib/kimi.ts`）
