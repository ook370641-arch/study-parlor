import { chromium } from 'playwright'

const url = process.argv[2] || 'https://www.anthropic.com/engineering/april-23-postmortem'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

const info = await page.evaluate(() => {
  return {
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim(),
    time: document.querySelector('time')?.outerHTML,
    meta: Array.from(document.querySelectorAll('meta')).map(m => ({
      name: m.getAttribute('name'),
      property: m.getAttribute('property'),
      content: m.getAttribute('content'),
    })).filter(m => m.content && (m.name || m.property)),
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent),
  }
})

console.log(JSON.stringify(info, null, 2))
await browser.close()
