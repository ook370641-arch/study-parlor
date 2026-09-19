# LLM 多配置切换 + 报纸主题纸白背景 — 设计稿

日期：2026-09-19
状态：已确认（brainstorming 完成）
来源：用户诉求——机器储存多个 API key 方便切换；报纸主题下扩展/设置页背景从画作降级为露棕底，应铺白纸

## 背景与原则

### 用户侧核心原则（本次设计的锚）

**任何让已存数据"看起来消失"的交互都是事故，哪怕数据还在。** 用户不该需要信任系统，系统要出示证据。新增配置的草稿流程中，原配置必须收起但可见，草稿区必须有独立的"未保存"视觉身份。

### 现状

- 设置页"AI 服务"卡片 = 三个自由文本框（API Key / Base URL / Model），保存写 `.env` 的 `KIMI_*` 组，底部全局保存按钮附带"重启后生效"提示。
- 主进程 `main.ts` 启动时 `cfg = loadEnv()` 一次性捕获，`registerAllIpc(cfg)` 将引用传给 15 个域注册处，各处理器闭包共享同一对象。
- `buildChatBody`（electron/lib/kimi.ts）按**模型名**分支（kimi-k3 / kimi-* / deepseek-* / 其他），与 provider 身份无关——本设计不引入厂商概念。
- 报纸主题下 `SurfaceBackground` 对 `surface !== 'cover'` 一律 return null（89f0b8e），扩展/设置页露出深褐底色，与报纸白纸美学冲突。

## Part A：LLM 多配置切换

### 数据模型（state.json 新增字段）

```jsonc
{
  "llmConfigs": [
    { "id": "cfg-<uuid>", "apiKey": "sk-...", "baseUrl": "https://...", "model": "kimi-k3" }
  ],
  "activeLlmConfigId": "cfg-<uuid>"
}
```

- 无 `name` 字段：条目标识由 `model` 派生；同 model 冲突时追加 `@<host>` 区分（派生逻辑在渲染层一处实现）。
- 旧 state.json 无此字段 → 启动迁移（见下）；字段默认值落 `state.ts` DEFAULT + store 初始化（ipc-state §3）。

### 启动迁移与 cfg 持有者

`main.ts` boot 序列：

1. `envCfg = loadEnv(process.env)`（现状不变；失败进 setup 向导）。
2. 读 state.json。`llmConfigs` **缺失或为空** → 从 envCfg 播种第一条配置（id 用 `crypto.randomUUID()`），`activeLlmConfigId` 指向它，**立即持久化** state.json（保证重启稳定）。
3. `activeLlmConfigId` 无效/悬空 → 归一为第一条配置。
4. `cfg` 持有者 = envCfg 对象本身，随后 `Object.assign(cfg, 激活配置的 apiKey/baseUrl/model)`。**`registerAllIpc(cfg)` 签名不变**——15 个注册处闭包共享同一对象引用，切换即字段突变，全部调用点即时可见。
5. `libraryPath` 永远只来自 envCfg，不进配置profile。

**前置审计（实现第一步）**：grep 全部注册处，确认没有在注册时解构 `const { apiKey } = cfg` 这类快照写法；有则改为访问时取（`libraryPath` 快照可容忍——它不随切换变）。

### `.env` 的新角色

单一职责：**首装种子 + E2E/测试兜底**。profiles 存在后它是死字母，设置页不再写它（`setup:writeConfig` 向导路径除外——首装仍只写 `KIMI_*` 一组，boot 迁移成配置 #1）。E2E 种子只写 `KIMI_*` → 迁移出单配置 → UI 与今天完全一致，现有断言零破坏（除 settings.spec 的 .env 写回断言，见测试节）。

### IPC 变更（types → handler → preload → facade → store → 组件）

新增（`electron/ipc/config.ts`）：

| IPC | 签名 | 行为 |
|---|---|---|
| `llmConfig:list` | `() → { configs: LlmConfig[], activeId: string }` | 全量返回（含明文 key——与今天 UI 回显 key 的行为一致，用户已选明文方案） |
| `llmConfig:setActive` | `(id) → {ok:true}` | `Object.assign(cfg, 目标)` + 写 state.json activeLlmConfigId |
| `llmConfig:save` | `(id \| null, {apiKey, baseUrl, model}) → {ok:true, id}` | `id=null` 新建（main 分配 uuid）；更新 state.json；若保存的是激活项 → 同步 `Object.assign(cfg, ...)` 立即生效 |
| `config:setLibraryPath` | `(path) → {ok:true}` | 仅写 .env 的 STUDY_LIBRARY_PATH（libraryPath 维持"重启生效"语义，不在本次范围） |

`src/types/index.ts` 新增 `LlmConfig` 类型 + IpcApi 四个方法签名。每个新 IPC 至少一个测试断言验证 `window.api` 暴露（ipc-state §1）。

### 设置页 UI（Settings.tsx "AI 服务"卡片）

**状态 1：单配置（默认）= 现状**

三个字段 + 验证/保存，与今天像素级一致；卡片底部多一个低调入口「+ 新增模型配置」（`data-testid="settings-add-llm-config"`）。

**状态 2：新增草稿（关键状态，原则的直接体现）**

```
┌ ▸ 当前配置：kimi-k3  ●使用中        ← 原配置收成一行摘要，可展开回看
├ ✏️ 新配置（未保存）  [琥珀虚线框]     ← 独立视觉身份
│   API Key / Base URL / Model（空）
│   [验证连接] [保存为新配置] [取消]
```

- 摘要行显示**新增前正在查看**的配置（不一定激活；它是激活项才带「使用中」徽标），不消失、可展开——用户在任何时候都能确认已有数据还在。
- 「验证连接」用草稿字段临时探测（现有 `setup:probeKey`，不写盘）。
- 「取消」无条件弃草稿，回到新增前所看的配置（单配置时即状态 1）；「保存为新配置」调 `llmConfig:save(null, ...)` → 进入状态 3。
- 草稿是渲染进程内存态，离开设置页即弃（有显式取消路径，可接受）。

**状态 3：≥2 配置**

卡片顶部出现切换器（chips 横排，`data-testid="settings-llm-config-chip"`），条目 = model 派生标签 + 「使用中」徽标（仅激活项）：

- 点 chip = 选择**正在编辑**的配置，表单回填其字段。**编辑选择 ≠ 激活**。
- 非激活且已保存的配置，表单区出现「启用此配置」（`data-testid="settings-activate-llm-config"`），**key 为空时禁用**——不可激活一份必然坏掉的配置。
- 启用 → `llmConfig:setActive` → 立即生效 + toast「已切换到 <model>」。
- 编辑中切走（点别的 chip / 展开摘要）：未保存改动丢弃，与今天"保存/作废"语义一致，不加确认弹窗。

**保存粒度对齐既有约定**：AI 服务卡片有自己的「保存」（仿 Tavily/求职简报卡片的分区保存模式）；学习库卡片配独立「保存」走 `config:setLibraryPath`；页面底部全局保存按钮及"重启后生效"提示移除（AI 配置现在立即生效，libraryPath 提示挪进学习库卡片）。

### 错误处理

- **空 key 保存**：允许（占位用途），但该配置「启用」禁用；启用他人后 LLM 调用失败走现有 `LLM_ERROR` 路径。
- **state.json 字段非法**（手改）：`llmConfigs` 非数组/空 → 重新播种；`activeLlmConfigId` 悬空 → 归一第一条；配置项缺字段 → baseUrl/model 落空字符串（UI 显示为空，验证会失败——不静默填厂商默认，保持厂商中立）。
- **网络/鉴权失败**：复用现有 probe 与 LLM 错误码，不新增。

### 明确不做（YAGNI）

- 不做配置删除、不做自定义名称字段、不做拖拽排序。
- 不做 key 加密（用户决定明文；未来升级 safeStorage 时数据模型不变）。
- 不动 setup 向导、不动 libraryPath 的重启语义。
- Home 页报纸主题维持现状（用户只点名设置/扩展）。

## Part B：报纸主题纸白背景

`Settings.tsx` 与 `Extension.tsx`：报纸主题下页面根容器铺纸白 `#f5f2ed`（与简报报纸纸张色一致），加 `data-testid` 供断言；学术主题不动，封面画作不动。

实现时 checklist（ui-styling §9）：确认两页在报纸主题下 SwapPaintingButton/换画入口不渲染（无画可换时按钮是死入口）。

## 测试清单

**单元**（定向跑，禁止全量）：
- `tests/state*.test.ts` / safe-json：llmConfigs/activeLlmConfigId 默认值与迁移（缺失/空数组/悬空 id/字段残缺）。
- 新增 main 侧迁移逻辑测试（播种、归一、Object.assign 后 cfg 字段正确）。
- `tests/settings.test.tsx`：单配置现状渲染 / 新增草稿区出现且原配置摘要可见 / 取消弃草稿 / 保存后切换器出现 / 启用按钮禁用逻辑 / chip 切换回填表单。

**E2E**（`e2e-changed --run` 定向）：
- `settings.spec.ts`：更新 .env 写回断言（AI 字段不再写 .env）→ 改断言 state.json 持久化（切换后 reload 仍保持）。
- 新增配置 → 填写 → 保存 → 启用 → reload 后仍为激活。
- 报纸主题下设置/扩展页纸白背景断言。
- `e2e/source-map.json` 同步：`electron/ipc/config.ts` 新 IPC 归入 settings 相关 group。

**真实 API 回归**：`tests/guide-v2-real.test.ts`（REPLAY=1 回放优先）确认激活配置路径完好。

## 验收清单

- [ ] 单配置时设置页与今天一致（截图对比级）
- [ ] 新增草稿时原配置摘要可见、可展开
- [ ] 切换/启用无需重启，下一次 LLM 调用即走新配置
- [ ] 重启后激活选择保持（state.json）
- [ ] DeepSeek 预置配置就位（实施时写入本机 state.json）
- [ ] 报纸主题设置/扩展页纸白背景；学术主题与封面无回归
- [ ] E2E 种子路径（无 llmConfigs）行为与今天一致
