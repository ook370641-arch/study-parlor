// electron/lib/library-layout.ts
import path from 'node:path'

/** 苏格拉底对话主题的根目录名（相对学习库根）。 */
export const SOCRATIC_ROOT = '苏格拉底对话'

/** 拼出某主题目录的绝对路径。 */
export function topicDir(lib: string, dirName: string): string {
  return path.join(lib, SOCRATIC_ROOT, dirName)
}
