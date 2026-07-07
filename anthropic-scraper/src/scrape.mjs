import { chromium } from 'playwright'
import TurndownService from 'turndown'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://www.anthropic.com'
const ENGINEERING_URL = `${BASE_URL}/engineering`
const DEFAULT_TARGET_URL = 'https://www.anthropic.com/engineering/april-23-postmortem'

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    url: null,
    limit: 10,
    outputDir: 'output',
    briefing: false,
    images: true,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    switch (arg) {
      case '--url':
        flags.url = next
        i++
        break
      case '--limit':
        flags.limit = parseInt(next, 10) || 10
        i++
        break
      case '--output-dir':
        flags.outputDir = next
        i++
        break
      case '--briefing':
        flags.briefing = true
        break
      case '--no-images':
        flags.images = false
        break
    }
  }

  return flags
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toAbsoluteUrl(relativeOrAbsolute) {
  if (!relativeOrAbsolute) return null
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute
  }
  if (relativeOrAbsolute.startsWith('//')) {
    return `https:${relativeOrAbsolute}`
  }
  return `${BASE_URL}${relativeOrAbsolute.startsWith('/') ? '' : '/'}${relativeOrAbsolute}`
}

function dateToRfc822(isoDate) {
  if (!isoDate) return ''
  try {
    return new Date(isoDate).toUTCString()
  } catch {
    return ''
  }
}

function parseDateString(str) {
  if (!str) return null
  try {
    // Handle "Apr 23, 2026" style dates from the Anthropic listing page
    const cleaned = String(str).trim().replace(/\.$/, '')
    const parsed = new Date(cleaned)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  } catch {}
  return null
}

function firstParagraphToSummary(markdown, maxLength = 280) {
  if (!markdown) return ''
  const firstBlock = markdown
    .split('\n\n')
    .map(b => b.trim())
    .find(b => b.length > 0 && !b.startsWith('#'))
  if (!firstBlock) return ''
  const text = firstBlock.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function extractArticle(page, url, includeImages, listingMeta = null) {
  console.log(`[scrape] loading article: ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

  // Try to wait for main content to appear
  await page.waitForSelector('main, article, [role="main"]', { timeout: 10000 }).catch(() => {})

  const result = await page.evaluate((baseUrl) => {
    const data = {
      title: '',
      url: window.location.href,
      publishedAt: null,
      authors: [],
      summary: '',
      contentHtml: '',
      images: [],
    }

    // Title
    data.title = document.querySelector('h1')?.textContent?.trim()
      || document.querySelector('title')?.textContent?.trim()
      || ''

    // Date: try <time>, meta tags, or structured data (JSON-LD)
    const timeEl = document.querySelector('time[datetime]')
    if (timeEl) {
      data.publishedAt = timeEl.getAttribute('datetime')
    }
    if (!data.publishedAt) {
      data.publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
        || document.querySelector('meta[name="publish-date"]')?.getAttribute('content')
        || null
    }
    if (!data.publishedAt) {
      try {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
          if (data.publishedAt) return
          const json = JSON.parse(script.textContent || '{}')
          const candidates = [json.datePublished, json?.['@graph']?.find?.(x => x.datePublished)?.datePublished]
          for (const d of candidates) {
            if (d) { data.publishedAt = d; break }
          }
        })
      } catch {}
    }

    // Authors
    const authorEls = document.querySelectorAll('a[href*="/authors/"], [data-testid="author-name"], .author')
    authorEls.forEach(el => {
      const name = el.textContent?.trim()
      if (name && !data.authors.includes(name)) data.authors.push(name)
    })
    if (data.authors.length === 0) {
      const authorMeta = document.querySelector('meta[name="author"]')?.getAttribute('content')
      if (authorMeta) data.authors.push(authorMeta)
    }
    if (data.authors.length === 0) {
      try {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
          if (data.authors.length > 0) return
          const json = JSON.parse(script.textContent || '{}')
          const author = json.author?.name || json?.['@graph']?.find?.(x => x.author)?.author?.name
          if (author && !data.authors.includes(author)) data.authors.push(author)
        })
      } catch {}
    }

    // Summary
    data.summary = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
      || document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')
      || document.querySelector('meta[name="description"]')?.getAttribute('content')
      || ''

    // Content: try to find the main article container
    const selectors = [
      'article',
      'main article',
      'main > div',
      '[data-testid="article-body"]',
      '.prose',
      '.article-content',
      'main',
    ]

    let contentEl = null
    for (const sel of selectors) {
      contentEl = document.querySelector(sel)
      if (contentEl) break
    }

    if (contentEl) {
      // Clone and remove non-content elements
      const clone = contentEl.cloneNode(true)
      clone.querySelectorAll('nav, header, footer, aside, script, style, form, .related-posts').forEach(el => el.remove())

      // Rewrite image src to absolute URLs in the clone before extracting HTML
      clone.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src')
        if (src) {
          const absolute = src.startsWith('http')
            ? src
            : `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}`
          img.setAttribute('src', absolute)
          img.removeAttribute('data-src')
        }
      })

      data.contentHtml = clone.innerHTML.trim()

      // Images
      clone.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src')
        if (src) {
          data.images.push({
            url: src,
            alt: img.getAttribute('alt') || '',
          })
        }
      })
    }

    return data
  }, BASE_URL)

  // Fallback for images if page.evaluate didn't capture them
  if (includeImages && result.images.length === 0) {
    const imageSrcs = await page.$$eval('article img, main img', imgs =>
      imgs.map(img => ({
        url: img.getAttribute('src') || img.getAttribute('data-src'),
        alt: img.getAttribute('alt') || '',
      })).filter(img => img.url)
    )
    result.images = imageSrcs.map(img => ({
      url: toAbsoluteUrl(img.url),
      alt: img.alt,
    }))
  }

  // Clean up images
  if (includeImages) {
    result.images = result.images
      .filter(img => img.url && !img.url.includes('data:image'))
      .map(img => ({ url: toAbsoluteUrl(img.url), alt: img.alt }))
  } else {
    result.images = []
  }

  // Convert HTML to Markdown
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })
  const markdown = result.contentHtml ? turndown.turndown(result.contentHtml) : ''

  // Fallback summary: article pages currently share a generic site-wide meta description,
  // so derive a useful summary from the first paragraph when no specific summary exists.
  const summary = result.summary || firstParagraphToSummary(markdown)

  return {
    title: result.title,
    url: result.url,
    publishedAt: result.publishedAt || listingMeta?.publishedAt || null,
    authors: result.authors,
    summary,
    content: {
      markdown,
      html: result.contentHtml,
    },
    images: result.images,
    scrapedAt: new Date().toISOString(),
  }
}

async function scrapeListing(page, limit) {
  console.log(`[scrape] loading listing: ${ENGINEERING_URL}`)
  await page.goto(ENGINEERING_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('a[href^="/engineering/"]', { timeout: 20000 }).catch(() => {
    console.warn('[scrape] could not find engineering article links with expected selector')
  })

  const links = await page.evaluate(() => {
    const seen = new Set()
    const results = []

    const findCardDate = (a) => {
      // Look for the date inside the card container. Anthropic currently uses a div
      // with a class suffix __date (e.g. ArticleList-module-scss-module___tpu-a__date).
      let container = a.closest('[class*="ArticleList"], article, li')
      if (!container) container = a.parentElement
      const dateEl = container?.querySelector('[class*="__date"]')
      if (dateEl) return dateEl.textContent?.trim() || null

      // Fallback: search siblings / ancestors for a date-like string
      const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/
      let el = a
      for (let i = 0; i < 4 && el; i++) {
        const match = el.textContent?.match(datePattern)
        if (match) return match[0]
        el = el.parentElement
      }
      return null
    }

    document.querySelectorAll('a[href^="/engineering/"]').forEach(a => {
      const href = a.getAttribute('href')
      const url = href.startsWith('http') ? href : `https://www.anthropic.com${href}`
      if (!seen.has(url)) {
        seen.add(url)
        const title = a.querySelector('h2, h3, h4, [class*="__title"], [class*="title"]')?.textContent?.trim()
          || a.textContent?.trim()
        results.push({
          url,
          title,
          dateText: findCardDate(a),
        })
      }
    })
    return results
  })

  const parsed = links.slice(0, limit).map(link => ({
    url: link.url,
    title: link.title,
    publishedAt: parseDateString(link.dateText),
  }))

  console.log(`[scrape] found ${parsed.length} article links, processing up to ${limit}`)
  return parsed
}

function generateRss(feed, articles) {
  const items = articles.map(a => `
    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.url)}</link>
      <guid isPermaLink="true">${escapeXml(a.url)}</guid>
      <pubDate>${dateToRfc822(a.publishedAt)}</pubDate>
      <description>${escapeXml(a.summary)}</description>
      ${a.content?.html ? `<content:encoded><![CDATA[${a.content.html}]]></content:encoded>` : ''}
    </item>
  `).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(feed.url)}</link>
    <description>${escapeXml(feed.description)}</description>
    <lastBuildDate>${dateToRfc822(feed.lastUpdated)}</lastBuildDate>
    ${items}
  </channel>
</rss>`
}

function generateBriefing(articles) {
  return {
    blogs: articles.map(a => ({
      name: a.authors?.[0] || 'Anthropic Engineering',
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
    })),
  }
}

async function main() {
  const args = parseArgs()
  const outputDir = path.resolve(args.outputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  let articles = []

  try {
    // Always fetch listing metadata first so single-article mode can inherit the
    // publish date (Anthropic detail pages don't expose it in meta/structured data).
    const listing = await scrapeListing(page, args.url ? 50 : args.limit)
    const listingMetaByUrl = new Map(listing.map(item => [item.url, item]))

    if (args.url) {
      const targetUrl = args.url
      const meta = listingMetaByUrl.get(targetUrl) || null
      const article = await extractArticle(page, targetUrl, args.images, meta)
      articles.push(article)
    } else {
      for (const link of listing) {
        const article = await extractArticle(page, link.url, args.images, link)
        articles.push(article)
        await sleep(1500)
      }
    }
  } finally {
    await browser.close()
  }

  const feed = {
    title: 'Anthropic Engineering Blog',
    url: ENGINEERING_URL,
    description: 'Engineering posts from Anthropic',
    lastUpdated: new Date().toISOString(),
  }

  const richJson = { feed, articles }

  // Write rich JSON
  const jsonPath = path.join(outputDir, 'anthropic-engineering.json')
  fs.writeFileSync(jsonPath, JSON.stringify(richJson, null, 2), 'utf8')
  console.log(`[scrape] wrote ${jsonPath}`)

  // Write RSS
  const rssPath = path.join(outputDir, 'anthropic-engineering.rss')
  fs.writeFileSync(rssPath, generateRss(feed, articles), 'utf8')
  console.log(`[scrape] wrote ${rssPath}`)

  // Write briefing JSON
  if (args.briefing) {
    const briefingPath = path.join(outputDir, 'anthropic-engineering-briefing.json')
    fs.writeFileSync(briefingPath, JSON.stringify(generateBriefing(articles), null, 2), 'utf8')
    console.log(`[scrape] wrote ${briefingPath}`)
  }

  console.log(`[scrape] done. scraped ${articles.length} article(s)`)
}

main().catch(err => {
  console.error('[scrape] failed:', err)
  process.exit(1)
})
