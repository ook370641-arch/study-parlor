# 扩展页面设计文档

## 背景与目的

Study Parlor 当前有 4 个页面：Cover → Home → Study/Profile。用户希望在 Home 增加一个"扩展"入口，打开一个独立的 Extension 页面，作为用户指南，说明三件事：

1. **学习库根目录** — 当前配置的路径，以及扩展原理（所有学习内容统一保存）
2. **本地 Agent 打通** — 如何把项目自带的 study/fable skill 复制到 Claude Code skills 目录使用
3. **自选配图** — 如何手动增删 `Pictures/` 目录下的图片

同时，把全局的 `learner` 和 `research` skill 复制到项目内，改名为 `study` 和 `fable`，纳入 git 跟踪。

## 设计概要

### 页面结构

Extension 是独立的全屏页面，与 Profile（卷宗）同级：

- **背景**：`SurfaceBackground` + `SwapPaintingButton`
- **导航**：左上角 `← 返回夜话`，右上角 `换画`
- **主体**：标题"扩展" + 三卡片纵向排列
- **数据**：纯静态展示，无状态变更

### 导航入口（Home 页面）

Home 顶部按钮栏从左到右：`换画` | `卷宗` | `扩展`
（当前已有 `卷宗` 在右侧，`换画` 在 `卷宗` 左侧，新增 `扩展` 在最右侧）

### 路由与状态

- `currentPage` 类型从 `'cover' | 'home' | 'study' | 'profile'` 扩展为 `'cover' | 'home' | 'study' | 'profile' | 'extension'`
- Zustand store 中 `goto('extension')` 即可切换

---

## 卡片 1：学习库

### 展示内容

- 当前 `STUDY_LIBRARY_PATH` 的值（从 `.env` 读取，主进程通过 IPC 暴露）
- 扩展原理说明：所有学习内容（学习报告、复习记录、寓言、流程图）统一保存到本目录，应用自动扫描显示

### 不展示的内容

- 不列出具体主题名（避免运行时扫描目录，降低实现复杂度）

---

## 卡片 2：本地 Agent 打通

### 展示内容

- 已安装 skill 列表：`study`、`fable`
- 使用步骤（两步）：
  1. 把项目 `.claude/skills/` 下的 `study/` 和 `fable/` 复制到你的 Claude Code skills 目录
  2. 在 agent 聊天里用 `/study` 或 `/fable` 触发
- 关键说明：skill 会自动读取应用配置的学习库路径，无需手动修改

### Skill 文件设计

#### study（原 learner 改名）

文件位置：`Study tutor/.claude/skills/study/SKILL.md`

核心修改点：
- `name` 从 `learner` 改为 `study`
- 触发词从 `learner`、`想学`、`教我` 等改为 `study`
- 保存配置中的**学习库根目录**从硬编码路径改为**动态读取**

**动态读取 `.env` 的机制**：

skill 在 `SKILL.md` 的顶部增加一个步骤：触发时先尝试读取项目根目录的 `.env` 文件，提取 `STUDY_LIBRARY_PATH` 的值。如果读取成功，用该值作为学习库根目录；如果读取失败（`.env` 不存在或字段缺失），提示用户：

> "未能自动读取学习库路径。请在 skill 的 SKILL.md 中将 `STUDY_LIBRARY_PATH` 替换为你的实际路径。"

读取方式：skill 文件中使用 bash 命令在项目根目录（通过查找 `.git` 或 `package.json` 定位）执行 `cat .env | grep STUDY_LIBRARY_PATH`，解析值。

> **注意**：skill 文件中的路径读取是**建议性**的，skill 的运行环境（Claude Code agent）与 Study Parlor 应用是不同的进程。skill 读取 `.env` 的机制依赖于：skill 被复制到用户的全局 skills 目录后，用户从 Study Parlor 项目目录内启动 Claude Code，此时 skill 可以通过相对路径或 git root 定位到项目的 `.env`。

#### fable（原 research 改名）

文件位置：`Study tutor/.claude/skills/fable/SKILL.md`

核心修改点：
- `name` 从 `research` 改为 `fable`
- 触发词从 `research`、`寓言`、`讲个故事` 等改为 `fable`
- 保存目录同样改为动态读取 `.env` 中的 `STUDY_LIBRARY_PATH`

#### 路径一致性检查

Extension 页面不做运行时路径对比（skill 路径由 skill 自己读取，页面无法直接访问 skill 内部配置）。页面仅文字说明"skill 会自动读取 .env 中的路径"。

---

## 卡片 3：自选配图

### 展示内容

- 当前图片数量（从 `Pictures/index.json` 数组长度读取）
- 添加步骤：
  1. 把图片文件（.jpg / .png）放入项目根目录的 `Pictures/` 文件夹
  2. 编辑 `Pictures/index.json`，在数组末尾追加一个 JSON 对象
  3. 保存文件，重启应用生效
- 删除说明：从 `Pictures/` 移除图片文件，同时从 `index.json` 删除对应条目，重启生效

### 字段说明（最小要求）

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✓ | 唯一标识，任意字符串 |
| `file` | ✓ | 图片文件名，必须和 `Pictures/` 下的实际文件一致 |
| `title` | ✓ | 作品名，在应用中显示 |
| `painter` | — | 作者名，显示在画面左下角。可写任意值 |
| `category` | — | 分类标签，仅用于筛选。可写 `custom` 或其他任意值 |
| `year` | — | 年份，填 `null` 或任意数字均可 |

### JSON 示例

```json
{
  "id": "custom-1",
  "painter": "Mark Rothko",
  "title": "No. 61",
  "file": "no61.jpg",
  "category": "color-field",
  "year": 1953
}
```

### 配图显示机制（已有，不修改）

- `Pictures/index.json` 在 `SurfaceBackground` 组件中被读取
- 每个条目通过 `file` 字段拼接为 `Pictures/{file}` URL 加载
- 只有 `id`、`file`、`title` 三个字段影响显示，其余字段仅用于信息展示

---

## 组件拆分

### 新增文件

- `src/pages/Extension.tsx` — 扩展页面主组件

### 修改文件

- `src/App.tsx` — 注册 Extension 页面渲染
- `src/pages/Home.tsx` — 顶部按钮栏增加"扩展"入口
- `src/store/index.ts` — `currentPage` 类型扩展（如果类型是显式声明的）

### 新增 Skill 文件

- `.claude/skills/study/SKILL.md` — 从全局 learner 复制并修改
- `.claude/skills/fable/SKILL.md` — 从全局 research 复制并修改

---

## 数据流

Extension 页面是纯展示型，无状态变更：

```
主进程 (env.ts) 读取 .env
    → IPC 暴露 STUDY_LIBRARY_PATH
    → Extension 页面读取并显示

Pictures/index.json
    → 渲染进程直接读取（通过 fs 或 IPC）
    → Extension 页面显示数组长度
```

---

## 错误处理

- `.env` 读取失败：主进程在启动时已做校验，Extension 页面假设路径一定存在
- `Pictures/index.json` 不存在：显示"暂无配图"或 0 张

---

## 范围外（不做）

- 不在 Extension 页面提供"一键安装 skill"功能（skill 安装需要复制文件到全局目录，超出应用权限）
- 不提供配图预览网格（只做数量统计和文字说明）
- 不提供配图上传 UI（手动操作已足够）
- 不修改配图加载机制（`SurfaceBackground` 等已有逻辑不变）
