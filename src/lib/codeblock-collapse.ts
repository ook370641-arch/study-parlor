// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块折叠持久化(设计 2026-08-23 追加需求):块身份 = 语言+内容的 djb2 hash,
// 存 state.json 不锁 .md;同一文件按多重集合匹配(相同内容折叠前 N 个)。
export function codeblockHash(language: string, text: string): string {
  const s = `${language}\n${text}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}
