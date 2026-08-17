# 写作按天备份设计

日期：2026-08-17
状态：已确认（用户口头确认，对照陈述见下）

## 目的

让应用知道每份写作文件**何时被改动过、改动了哪些**：

- `updated` frontmatter 字段回答"何时"——每次保存刷新为当天日期（`YYYY-MM-DD`）。
- `writing/.backups/` 里的镜像备份回答"改了什么"——保留每篇文章"今天之前"的最后一个版本，可与当前文件 diff。

## 用户陈述对照（验收语义）

1. 今天改了一份文件 → 自动保留一份今天之前的备份，同时 `updated` 更新为今天。
2. 今天之内无论多少次修改，备份文件不变；`updated` 粒度到日期，同天重写值相同，不反复变动。
3. 改天再次修改 → 备份更新为（新的）今天之前的版本，`updated` 变为当天。

## 现状（无需改动的部分）

- `created`：新建时写入 ISO 时间戳，改名/移动/保存不改动（commit 1e9ba67）。
- `updated`：`writeWritingFile` 每次保存写入 `YYYY-MM-DD`（`electron/lib/writing-tree.ts:278`）。
- 双字段语义保留：`created` = 首次创建时间，`updated` = 最新修改日期。**本设计不改动时间戳逻辑。**

## 设计

### ① 备份位置与结构

- 备份目录：`<学习库>/writing/.backups/`，镜像分组结构：
  `writing/组A/文.md` → `writing/.backups/组A/文.md`
- `.backups` 加入 `HIDDEN_FILE_PATTERNS`（`electron/lib/writing-tree.ts`），目录树不显示、不参与扫描。
- 每篇文章备份恒 ≤1：同路径覆盖写。
- 只备份 `writing/` 根下的文章；`repository/` 不备份。

### ② 备份写入时机

在 `writeWritingFile` 内、**写入新内容之前**判断。满足以下全部条件才备份：

1. 文章相对路径在 `writing/` 根下；
2. 磁盘上文件已存在（= 修改，而非新建）；
3. 旧文件正文非空（新建空壳的首次编辑不产生无意义备份）；
4. 备份不存在，或备份文件的 mtime 本地日期 ≠ 今天（= 今天还没备份过）。

备份方式：`copyFile` 原样拷贝保存前的完整旧文件（含 frontmatter）到镜像备份路径，父目录 `mkdir recursive`。

### ③ 生命周期跟随

- `renameNode`：源在 `writing/` 下且备份存在 → 备份同步重命名到镜像新路径（父目录 mkdir）。
- `moveNode`：`writing/` 根内移动 → 备份跟随移动；从 `writing/` 移到 `repository/` → 删除备份（repository 不备份）。
- `deleteNode`：删除 `writing/` 文章 → 同步删除其备份。
- 以上三条对**目录节点同理**：重命名/移动/删除分组时，`.backups/` 下对应镜像目录整体同步操作，避免孤儿备份。
- `dissolveGroup`：内部逐文件走 `moveNode`，备份自动跟随；空壳目录删除时镜像空目录一并清理。

### ④ 错误处理

- 备份写入失败（IO 错误）只 `console.warn` 记日志，**不阻断保存**——保存是主路径，备份是保险。
- 备份 mtime 读取异常视为"未备份"，执行备份。

### ⑤ 测试

新增 `tests/writing-backup.test.ts`（vitest，临时目录夹具）：

- 首次保存产生备份，备份内容 = 修改前旧文件；
- 同天第二次保存不覆盖备份；
- 将备份 mtime 改为昨天后再保存 → 备份被覆盖为新的旧版本；
- 重命名 → 备份跟随；根内移动 → 备份跟随；移出到 `repository/` → 备份删除；
- 删除文章 → 备份删除；分组重命名/删除 → 镜像备份目录跟随；
- `repository/` 文章保存不产生备份；
- 新建空文章首次编辑不产生备份；
- `scanRoot('writing')` 结果不含 `.backups`。

无 UI 出口（纯磁盘行为），不新增 E2E spec，`e2e/source-map.json` 无需更新。

## 验收清单

- [ ] 上述 9 条单元测试全部通过（分组跟随算 1 条）
- [ ] `tests/writing-tree.test.ts`、`tests/writing-created.test.ts` 等既有测试不回归
- [ ] 手动验证：改文章 → `writing/.backups/` 出现镜像备份；同天再改备份不变；目录树看不到 `.backups`
