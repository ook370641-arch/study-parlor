// 真实 API 回归：三级抓取管线 smoke（手动运行，不进 CI 默认链路）
// 用法：npx tsx scripts/test-scout-fetch.js [url]
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = process.argv[2] || 'https://ysymyth.github.io/The-Second-Half/'
  console.log('=== Scout fetch pipeline smoke test ===')
  console.log('Target URL:', url)
  console.log('Tavily API key present:', !!process.env.TAVILY_API_KEY)
  console.log()

  const fetcherPath = pathToFileURL(
    path.join(__dirname, '..', 'electron', 'lib', 'scout', 'article-fetcher.ts')
  ).href
  const mod = await import(fetcherPath)
  const { fetchArticle, makeTavilyExtract, plainFetch, scraperFetch } = mod

  const deps = {
    tavilyExtract: makeTavilyExtract(process.env.TAVILY_API_KEY ?? ''),
    plainFetch,
    scraperFetch,
  }

  const start = Date.now()
  const r = await fetchArticle({ url, deps })
  const elapsed = Date.now() - start

  console.log(`tier=${r.tier} title="${r.title}" len=${r.markdown.length} time=${elapsed}ms`)
  console.log(`summary: ${r.summary}`)
  console.log(`authors: [${r.authors.join(', ') || 'none'}]`)
  console.log(`publishedAt: ${r.publishedAt ?? 'null'}`)
  console.log()
  console.log('=== PASS ===')
}

main().catch((e) => {
  console.error('=== FAIL ===')
  console.error(e.code || e.name, e.message)
  process.exit(1)
})
