import { chromium } from 'playwright'

const url = 'https://www.anthropic.com/engineering'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

const links = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href^="/engineering/"]')).slice(0, 5).map(a => ({
    href: a.getAttribute('href'),
    text: a.textContent?.trim().slice(0, 120),
    html: a.outerHTML.slice(0, 500),
    parent: a.parentElement?.outerHTML?.slice(0, 800),
  }))
})

console.log(JSON.stringify(links, null, 2))
await browser.close()
