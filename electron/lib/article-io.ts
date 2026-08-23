import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const ALLOWED_DIRS = ['Anthropic博客', '拾贝']

function code(code: string): Error {
  return Object.assign(new Error(code), { code })
}

export function writeArticleBody(lib: string, absPath: string, body: string): void {
  const normLib = path.resolve(lib)
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(normLib + path.sep) && resolved !== normLib) {
    throw code('ARTICLE_PATH_FORBIDDEN')
  }
  const rel = path.relative(normLib, resolved)
  const top = rel.split(path.sep)[0]
  if (!ALLOWED_DIRS.includes(top)) throw code('ARTICLE_PATH_FORBIDDEN')
  if (path.extname(resolved).toLowerCase() !== '.md') throw code('ARTICLE_PATH_FORBIDDEN')

  try {
    let fm: Record<string, unknown> = {}
    if (fs.existsSync(resolved)) {
      fm = (matter(fs.readFileSync(resolved, 'utf8')).data as Record<string, unknown>) ?? {}
    }
    const content = matter.stringify(body.replace(/^\n/, ''), fm)
    fs.writeFileSync(resolved, content, 'utf8')
  } catch (err) {
    if ((err as { code?: string })?.code) throw err
    throw code('ARTICLE_WRITE_ERROR')
  }
}
