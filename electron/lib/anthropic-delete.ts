import fs from 'node:fs'
import path from 'node:path'
import { IMPORT_DIR } from './anthropic-scraper'
import { deleteSiblingFiles } from './sibling-files'

export function deleteAnthropicArticleFile(
  libraryPath: string,
  filePath: string
): { ok: true } | { ok: false; message: string } {
  const dir = path.resolve(libraryPath, IMPORT_DIR)
  const abs = path.resolve(filePath)
  if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
    return { ok: false, message: '文件不存在或路径非法' }
  }
  try {
    fs.rmSync(abs)
    deleteSiblingFiles(abs)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
