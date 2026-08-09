# 写作树 行内新建 + 日记日期默认 + 悬停重命名 / 去 .md — 设计

日期:2026-08-09
状态:已设计,待实现

## 背景

用户希望新建文章时**直接在文章列里原地填名字**(知识库软件惯例),而非居中的 `PromptDialog` 弹窗。调查确认该交互从未实现过(git worktree / stash / 历史 / spec 均无此功能),当前新建文章(`WritingListColumn.handleCreateFile`、`WritingTree.doNewFile`)全部走 `PromptDialog`。本设计一并交付三件事:

1. **行内新建文章**(替代居中弹窗);
2. **日记分组日期默认**(新建预填当天日期);
3. **文章悬停重命名 + 全部文章名去 `.md` 后缀**。

同时修复一个现存 bug:`renameNode`(`electron/lib/writing-tree.ts:156`)不补 `.md`,重命名输入不带后缀的名字会把文件改成无扩展名、从树里消失。

## 用户决策记录

1. **行内新建一并实现**(用户确认):三个新建入口(根级「＋ 新建文章」、分组悬停「＋」、分组右键「新建文章」)统一改为列表内原地输入,不再弹窗。
2. **重命名行内编辑**(用户确认):文章悬停「✎」→ 该行名称变输入框,与行内新建交互统一。
3. **输入位置 = 落盘显示位置**(用户反馈):输入行出现在新建文件排序归位后的位置,不是分组末尾。输入值变化时输入行实时移动到对应槽位;空值时在列表末尾。
4. **日期格式 M.D 无补零**(用户确认):8 月 9 日 → `8.9`,文件名 `8.9.md`。
5. **去 `.md` 仅改显示**:磁盘文件名不动,树/折叠列/删除确认/重命名预填统一显示去后缀名。
6. **分组悬停保持「＋ + 🗑」**:重命名小 UI 只加在文章悬停;分组重命名仍走右键菜单。

## 范围

In:
- `src/components/writing/InlineNameInput.tsx`(新):通用行内输入行,Enter 确认 / Esc 取消 / 外部点击取消,支持预填、全选、错误提示,双主题(academic/newspaper)样式。
- `src/lib/writing-tree-utils.ts` 新增纯函数:
  - `displayWritingName(node)` — 文件去 `.md` 显示名;
  - `normalizeWritingFileName(name, isFile)` — 文件补 `.md`(修 rename 丢扩展名 bug);
  - `diaryPrefillName(root, dir, children)` — 日记预填当天 `M.D`,已存在返回空串;
  - `sortedInsertIndexForFile(children, order, value)` — 新文件在显示列表的落盘槽位(空值→末尾)。
- `WritingListColumn.tsx`:根级「＋ 新建文章」改为行内;inline 状态提升至此(供 `WritingTree` 消费);折叠列最近文章名去 `.md`。
- `WritingTree.tsx`:`TreeNode` 新建入口改行内(含日记预填),文章悬停加「✎ 重命名」,行内重命名,删除确认书名去 `.md`。
- 测试:`tests/writing-tree-utils.test.ts` 补 4 个纯函数单测;`e2e/specs/writing-tree.spec.ts`、`e2e/specs/writing-edge.spec.ts` 更新(去 `.md` 断言、PromptDialog→行内、悬停按钮断言);按 `e2e/source-map.json` 登记。

Out(YAGNI):
- 不改分组的新建/重命名入口(分组新建子分组、分组右键重命名仍用 `PromptDialog`/右键菜单)。
- 不改 `electron/lib/writing-tree.ts` 的 `renameNode` 补 `.md`(在渲染层 `normalizeWritingFileName` 处理,保持主进程语义不变,避免影响其他调用方)。
- 不做文章名的非法字符白名单校验,沿用 IPC `assertInsideRoots` 路径穿越拦截。
- 不做重命名实时定位(重命名输入行固定在该行,不随名字跳槽)。

## 数据流

### 行内新建

```
点击入口 → startInlineNew({ root, dir, prefill })
  → WritingTree/TreeNode 在 sortedInsertIndexForFile(...) 处渲染 <InlineNameInput value={inlineNew.value}>
输入变化 → 更新 inlineNew.value → 树重渲染,输入行移动到新槽位
Enter:
  value.trim() 为空 → cancelInlineNew()(不创建)
  否则 → ipc.writingCreateFile({ root, dir, name: value })
    ok → cancelInlineNew() → loadWritingTree() → selectWritingFile(r.value.path)
    !ok → inline 行内显示 code→文案 错误,输入保持打开
Esc / 外部点击 → cancelInlineNew()
```

### 日记预填

`doNewFile`(分组悬停＋ / 右键新建文章共用)计算 `prefill`:

```
prefill = diaryPrefillName(root, dir, node.children)
  root === 'writing' && dir === '日记'            → `${month}.${day}`(M.D 无补零)
  children 已存在 `${prefill}.md`                 → ''(正常流程)
  其他(root 级 / 其他分组 / 日记子分组)            → ''
```

根级「＋ 新建文章」入口 `prefill` 恒为空串。

### 行内重命名

```
点文章悬停「✎」 → TreeNode 局部 editing=true,名称区变 <InlineNameInput value=displayWritingName(node)>
Enter:
  normalized = normalizeWritingFileName(value.trim(), isFile)  // 文件补 .md
  normalized === node.name → editing=false(无操作)
  否则 → ipc.writingRename({ path: node.path, newName: normalized })
    ok → editing=false → loadWritingTree()
    !ok(WRITING_NAME_CONFLICT / WRITING_PATH_FORBIDDEN)→ 行内错误提示,保持编辑
Esc / 外部点击 → editing=false
```

## 界面行为

- **新建输入行定位**:目标位置 = `sortedInsertIndexForFile(该级 children(扫描序), writingOrder[dir], value)`,与创建后 `sortNodesByOrder` 的落盘槽位一致。空值 → 列表末尾;键入时输入行实时移动到排序槽位。输入行 `key` 固定(不随槽位变化 remount,保持焦点)。
- **新建输入行 autofocus + 全选**:预填 `8.9` 时全选,直接 Enter 即可确认;键入则覆盖。
- **新建输入行出现时自动展开目标分组**(沿用现有 `if (!open) setOpen(true)`)。
- **文章悬停**:`✎ 重命名` + `🗑 删除`;分组悬停:`＋ 新建` + `🗑 解散`(不变)。
- **去 `.md` 显示**:树行、折叠列最近文章、删除确认《书名》、重命名预填值。

## 错误码 → 文案

| code | 文案 |
|---|---|
| `WRITING_NAME_CONFLICT` | 同名文件已存在 |
| `WRITING_PATH_FORBIDDEN` | 名称无效 |
| `WRITING_NOT_FOUND` | 文件不存在 |

新建失败 → 输入行下方红字提示,输入保持打开;重命名失败同。

## 边界与降级

| 场景 | 行为 |
|---|---|
| 空名新建 | 视为取消,不调用 IPC |
| 重命名后名字不变(含归一化后相同) | 无操作,关闭输入 |
| 重命名输入带 `.md` | `normalizeWritingFileName` 不再追加,保持原样 |
| 文件重命名输入不带 `.md` | 自动补 `.md`(修现存 bug,防止文件变无扩展名从树消失) |
| 日记无子级 / 分组不存在 | `diaryPrefillName` 直接返回空串,无特殊行为 |
| 日记已存在当天文件 | 预填空,正常命名流程 |
| 已有手动排序(writingOrder) | `sortedInsertIndexForFile` 沿用同一 order,新文件落无序尾部的扫描序槽位 |
| 新建/重命名失败 | 行内红字提示,输入保持打开可重试 |
| 外部点击 / Esc | 取消,不产生任何副作用 |
| 双主题 | InlineNameInput 沿用 academic/newspaper 配色变量 |

## 测试

### 单元(`tests/writing-tree-utils.test.ts`)

1. `displayWritingName`:文件 `8.9.md`→`8.9`;目录名不变。
2. `normalizeWritingFileName`:文件 `foo`→`foo.md`、`foo.md`→`foo.md`;目录不变。
3. `diaryPrefillName`:
   - `writing`/`日记` 无 `8.9.md` → `8.9`(mock 当天 8 月 9 日);
   - `writing`/`日记` 已存在 `8.9.md` → `''`;
   - `repository`/`日记` → `''`(仅 writing);
   - `writing`/`日记/子组` → `''`(仅直接子级);
   - `writing`/`随笔` → `''`。
4. `sortedInsertIndexForFile`:
   - 无 order:目录靠前、文件按 `localeCompare` zh 插入;
   - 有 order:有序节点在前,新文件落其后无序文件中的扫描序槽位;
   - 空值 → children.length(末尾)。

### E2E(`e2e/specs/writing-tree.spec.ts` 更新 + 新增)

- 存量更新:`/七月夜话\.md/` → `/七月夜话/`;新建改走行内输入(`writing-inline-new` testid)替代 `writing-prompt-input`;悬停断言补文章 `writing-node-rename` 存在、分组不显示 rename。
- 新增:
  1. 根级行内新建:点「＋ 新建文章」→ 输入行出现 → 填名 Enter → 文件出现并选中;
  2. 分组行内新建:点分组「＋」→ 分组展开、输入行出现在排序槽位 → Enter → 文件在该分组下;
  3. 空名 Enter / Esc → 不创建;
  4. 日记预填:seed 日记分组,点「＋」→ 输入行预填当天 `M.D`;预置当天文件 → 输入行空白;
  5. 文章悬停重命名:点「✎」→ 行内改名 Enter → 文件名更新且无 `.md`;
  6. 重命名冲突:改名成已存在名 → 行内提示"同名文件已存在"。
- `e2e/specs/writing-edge.spec.ts`:`/临时\.md/` → `/临时/`。
- `e2e/source-map.json`:writing 分组登记更新/新增的 spec。

## 影响文件

- `src/components/writing/InlineNameInput.tsx`(新)
- `src/lib/writing-tree-utils.ts`(4 个纯函数)
- `src/components/writing/WritingListColumn.tsx`(行内新建状态 + 根级入口 + 折叠列去 .md)
- `src/components/writing/WritingTree.tsx`(新建/重命名入口行内化 + 悬停 ✎ + 去 .md)
- `tests/writing-tree-utils.test.ts`
- `e2e/specs/writing-tree.spec.ts`
- `e2e/specs/writing-edge.spec.ts`
- `e2e/source-map.json`

## 不做的事(明确排除)

- 分组新建子分组 / 分组重命名保持 `PromptDialog` + 右键菜单,不入本设计。
- 不改 `renameNode` 主进程语义(渲染层归一化即可,避免影响其他调用方)。
- 不做输入长度/非法字符白名单;路径穿越由 IPC 兜底。
- 不做新建行草稿持久化(取消即丢,符合"最小可用")。
