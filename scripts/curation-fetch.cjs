// 画作策展抓取器：下载候选图片 / 查询公开 API（Commons、WikiArt、剧照站）。
// 用法：
//   node scripts/curation-fetch.cjs <url> <outfile>     # 下载文件（图片）
//   node scripts/curation-fetch.cjs --json <url>        # 打印响应体到 stdout（API/HTML）
// 跟随 301/302 重定向，带浏览器 UA。
const fs = require('node:fs')
const path = require('node:path')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function fetch(url, redirects = 5) {
  const mod = url.startsWith('https') ? require('node:https') : require('node:http')
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        if (redirects <= 0) return reject(new Error('too many redirects'))
        const next = new URL(res.headers.location, url).toString()
        return resolve(fetch(next, redirects - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      resolve(res)
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(new Error(`timeout for ${url}`)) })
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--json') {
    const res = await fetch(args[1])
    let body = ''
    res.setEncoding('utf8')
    for await (const chunk of res) body += chunk
    process.stdout.write(body)
    return
  }
  const [url, outfile] = args
  if (!url || !outfile) {
    console.error('usage: node scripts/curation-fetch.cjs <url> <outfile> | --json <url>')
    process.exit(1)
  }
  const res = await fetch(url)
  fs.mkdirSync(path.dirname(outfile), { recursive: true })
  const ws = fs.createWriteStream(outfile)
  res.pipe(ws)
  await new Promise((resolve, reject) => { ws.on('finish', resolve); ws.on('error', reject) })
  const size = fs.statSync(outfile).size
  if (size < 1024) console.warn(`[fetch] WARNING suspiciously small (${size}B): ${outfile}`)
  console.log(`[fetch] ${size}B → ${outfile}`)
}

main().catch(err => { console.error(`[fetch] FAIL: ${err.message}`); process.exit(1) })
