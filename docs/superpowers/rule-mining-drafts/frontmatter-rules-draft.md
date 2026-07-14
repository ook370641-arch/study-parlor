# Frontmatter / 学习库规则候选（规则挖掘草稿）

> 来源：Study Parlor 学习库文件 / Frontmatter 模块规则挖掘
> 日期：2026-07-10
> 覆盖范围：frontmatter schema、renderer 与主进程一致性、文件扫描、类型推断、归档/复习追加

---

## 规则 1：渲染进程禁止依赖会在 Renderer 上下文崩溃的主进程解析库

- **问题类型**：进程隔离 / 运行时稳定性
- **问题描述**：`src/components/md/MarkdownRenderer.tsx` 同时从 `@electron/lib/frontmatter` 引入主进程解析逻辑、直接引入 `gray-matter`，并使用正则 strip 三套机制提取正文。`src/components/StudyLibrary.tsx` 的提交 `b9d69bf` 已证明 `gray-matter` 在 Renderer 中会因 `Buffer` 问题报错，但 MarkdownRenderer 仍保留 `matter()` 调用作为 fallback。
- **Agent 行为偏差**：把主进程可用的库默认可用于渲染进程；为“保险”而叠加多套解析路径，反而引入依赖边界风险和结果不一致。
- **正确行为**：Renderer 侧只使用不依赖 Node 内置对象（`Buffer`、`fs` 等）的纯 JS 实现；若必须与主进程共享解析逻辑，应通过 IPC 或 Preload 暴露，而不是直接 import `electron/lib/` 下的文件。
- **检测信号**：`src/` 中出现 `import ... from '@electron/...'` 或 `import matter from 'gray-matter'`；同一段 markdown 正文经过多种 strip/parser 处理后再取“最短 body”。
- **代码信号**：`MarkdownRenderer.tsx` 第 1、7、83-103 行。

---

## 规则 2：Frontmatter 持久化的字段必须完整出现在共享 TypeScript 类型中

- **问题类型**：类型契约 / Schema 一致性
- **问题描述**：`electron/lib/frontmatter.ts` 为 `review` 类型定义了扩展字段 `review_index` 和 `source_title`，`writeReviewReport` 也会把它们写入文件；但 `src/types/index.ts` 的 `Frontmatter` 类型没有这两个字段。TypeScript 当前能通过是因为 `serializeFrontmatter` 的参数签名是 `Partial<Frontmatter> & Record<string, unknown>`，把类型检查架空了。
- **Agent 行为偏差**：为了绕过类型错误，用 `Record<string, unknown>` 或 `any` 吞掉 schema 扩展字段，导致“写得出但类型不知道”。
- **正确行为**：新增持久化字段时，先更新共享 `Frontmatter` 类型（或引入按 `DocType` 拆分的 discriminated union），再更新序列化/解析函数；禁止用 `Record<string, unknown>` 逃避类型。
- **检测信号**：`EXT_FIELDS` 中有字段名，但 `Frontmatter` 类型中搜不到；`as` 类型断言或 `Record<string, unknown>` 出现在序列化入口。
- **代码信号**：`electron/lib/frontmatter.ts` 第 10 行；`src/types/index.ts` 第 72-91 行。

---

## 规则 3：文件名推断与 frontmatter `type` 字段必须保持对称和完整

- **问题类型**：向后兼容 / 类型推断一致性
- **问题描述**：
  1. `inferDocTypeFromFilename` 支持 `external-materials`，但 `src/components/md/fileType.ts` 的 `detectDocType` 不认识 `external-materials` 与 `briefing`，导致渲染时走默认 `report` 样式。
  2. 旧 spec 中的 `research` 类型已从 `DocType` 中删除，但旧文件可能仍含 `type: research`。
  3. 旧 spec 要求把 `medium` 统一为 `mid`，当前 `parseFrontmatter` 只是缺省值设为 `mid`，未做 `medium` → `mid` 归一化。
- **Agent 行为偏差**：新增类型时只改解析/扫描路径，忘记同步渲染侧的类型映射；删除类型时不做迁移或兜底；兼容性映射停留在“默认值”层面而非“归一化”层面。
- **正确行为**：`DocType` 枚举、`inferDocTypeFromFilename`、`detectDocType`、`ReportHeader` 的 TYPE_LABELS/BADGE_STYLES 四者应同步更新；旧值映射要显式写进 parse 函数（如 `difficulty = data.difficulty === 'medium' ? 'mid' : ...`）。
- **检测信号**：某个 DocType 只出现在 `EXT_FIELDS` 或 filename 推断中，没出现在渲染侧 switch/Record 里；旧 spec 提到但当前类型已删除的值没有兼容分支。
- **代码信号**：`electron/lib/frontmatter.ts` 第 28-37 行；`src/components/md/fileType.ts` 第 5-24 行；`src/components/md/ReportHeader.tsx` 第 3-21 行。

---

## 规则 4：扫描元数据时应优先读取 frontmatter `type`，不能仅靠硬编码中文文件名

- **问题类型**：文件扫描 / 嵌套目录结构
- **问题描述**：`getSessionMeta` 完全靠硬编码文件名（`学习报告.md`、`原始对话.md`、`复习报告.md`、`寓言.md`）判断会话包含哪些文件。一旦用户手动改名或未来支持多语言文件名，扫描结果就会错误。 spec 设计原则是“frontmatter type 优先”。
- **Agent 行为偏差**：为省事继续用“文件名包含关键词”做判定，而不是读取已写入的 `type` 字段；把文件系统约定当作唯一真相来源。
- **正确行为**：扫描时读取 `.md` 文件的 frontmatter `type` 字段作为首要判定依据；文件名匹配仅作为无 frontmatter 旧文件的兜底。
- **检测信号**：`fs.readdirSync` 后出现大量 `n === '学习报告.md'` 或 `lower.includes('学习报告')` 式判定，且未调用 `parseFrontmatter`。
- **代码信号**：`electron/ipc/files.ts` 第 19-34 行、第 180-195 行。

---

## 规则 5：追加型归档操作必须是幂等的，禁止简单拼接正文

- **问题类型**：归档 / 复习记录追加
- **问题描述**：`files:writeReviewReport` 在文件已存在时，把旧正文与新增章节用 `\n\n---\n\n` 直接拼接。若用户多次触发复习归档或流程重试，同一次复习的内容可能被重复追加；且 `review_index` 直接从调用参数写入，不做冲突校验。
- **Agent 行为偏差**：用“追加即拼接”实现追加语义，未考虑重试、幂等、去重；把 frontmatter 中的 `review_index` 当作调用方一定正确的输入。
- **正确行为**：追加归档应基于稳定的 session/timestamp/attempt key 去重；或采用“读取 → 合并结构化数据 → 重新序列化”的方式，并在合并前校验重复；`review_index` 应从已存在的复习记录数 +1 计算，而非盲目信任入参。
- **检测信号**：写文件逻辑中出现 `existingBody + '\n\n---\n\n' + body` 或类似字符串拼接；追加操作没有唯一键或去重检查。
- **代码信号**：`electron/ipc/files.ts` 第 417-427 行。

---

## 规则 6：扩展字段若不在序列化时写入，就不应列入 EXT_FIELDS 作为 schema 承诺

- **问题类型**：Schema 兼容性 / 缺字段处理
- **问题描述**：`EXT_FIELDS['external-materials']` 包含 `summary` 和 `sources`，但 `writeExternalMaterials` 的 frontmatter 只写入 `session_number`、`topic`，summary/sources 是从正文用正则二次解析出来的。这会让 reader 误以为这两个字段存在于 frontmatter，实际上不存在。
- **Agent 行为偏差**：把“希望未来支持的字段”或“从正文解析的字段”混进 frontmatter schema；schema 描述与实际 IO 不一致。
- **正确行为**：`EXT_FIELDS` 只列出该类型 `serializeFrontmatter` 实际会写入的字段；从正文解析的字段应通过独立 parser 返回，不在 frontmatter 类型里占位。
- **检测信号**：`EXT_FIELDS[type].includes(key)` 为真，但同类型写入路径从未给 `data[key]` 赋值。
- **代码信号**：`electron/lib/frontmatter.ts` 第 14 行；`electron/ipc/files.ts` 第 532-543 行；`parseExternalMaterialsBody` 第 180-195 行。

---

## 规则 7：正文提取必须有单一、可验证的权威路径

- **问题类型**：Renderer / 主进程依赖一致性
- **问题描述**：`MarkdownRenderer.tsx` 为了得到正文，依次执行：
  1. `parseFrontmatter(safeContent, ...).body`（被忽略，未使用）；
  2. 正则 force-strip；
  3. `matter(safeContent).content`，并取“更短”的结果。
  这种“谁短用谁”的启发式不可解释，容易在不同 frontmatter 边界场景下产生不一致渲染。
- **Agent 行为偏差**：遇到解析不确定性时，不修复根因，而是叠加 fallback 并取“看起来对”的结果。
- **正确行为**：只保留一种与 Renderer 环境兼容的 frontmatter strip/parser；若该 parser 失败，应报错或使用安全 fallback（如直接显示 raw content），而不是在多个输出中取最短。
- **检测信号**：同一段内容经过 ≥2 种 parser/strip，并对结果做长度比较或合并。
- **代码信号**：`src/components/md/MarkdownRenderer.tsx` 第 82-103 行。

---

## 规则 8：新增 DocType 必须完成“写入 → 扫描 → 渲染 → 类型”全链路同步

- **问题类型**：类型推断与向后兼容
- **问题描述**：以 `anthropic-article` 为例，它的 frontmatter 写入、扫描（通过 `source_url` 去重）已实现，`detectDocType` 也映射到 `report` 样式，但 `ReportHeader` 的元数据行（`buildMetadata`）不会显示 `source_url`、`authors`、`published_at` 等关键信息；`briefing` 类型则完全没有被 `detectDocType` 处理。
- **Agent 行为偏差**：新增类型时只做最小 IO 实现，认为“能写文件就够了”，不检查渲染侧、扫描侧、类型侧是否同步。
- **正确行为**：新增 DocType 应列出改动清单：类型枚举 → 序列化扩展字段 → 文件名推断 → 渲染类型映射 → ReportHeader 差异化展示 → 扫描识别逻辑 → 测试覆盖。
- **检测信号**：某个 DocType 只出现在主进程写入/解析代码，没出现在 `src/components/md/` 的渲染决策中；或 ReportHeader 对该类型只显示徽章而无其他元数据。
- **代码信号**：`src/components/md/fileType.ts` 第 10 行；`src/components/md/ReportHeader.tsx` 第 37-57 行；`electron/lib/anthropic-scraper.ts` 第 358-367 行。

---

## 附：问题 → Agent 行为偏差映射速查

| 模块问题 | Agent 行为偏差 |
|---------|----------------|
| Renderer 仍用 `gray-matter` 和 `@electron/lib/frontmatter` | 跨进程边界共享库，忽视 Renderer 运行时不安全性 |
| `review_index`/`source_title` 写入但不在类型中 | 用 `Record<string, unknown>` / `any` 绕过类型 |
| `research` 删除、`medium` 未归一化、`external-materials` 渲染缺失 | 类型变更不同步到推断与渲染 |
| `getSessionMeta` 硬编码中文文件名 | 把约定文件名当作唯一真相，忽视 frontmatter type |
| 复习报告直接拼接正文 | 追加语义不幂等，不考虑重试与去重 |
| `external-materials` EXT_FIELDS 含未写入字段 | schema 描述与实际 IO 不一致 |
| MarkdownRenderer 三种正文提取取最短 | 用启发式 fallback 掩盖解析不确定性 |
| `anthropic-article`/`briefing` 渲染不完整 | 新增类型只做最小 IO，不完成全链路 |

---

*规则数量：8 条*
*覆盖领域：frontmatter schema 兼容性（规则 2、3、6、8）、renderer/主进程一致性（规则 1、7）、文件扫描与嵌套目录（规则 4）、类型推断与向后兼容（规则 3、8）、归档/复习追加（规则 5）*
