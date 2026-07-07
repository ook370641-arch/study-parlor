# Anthropic Engineering Blog Scraper

Standalone Playwright-based scraper that extracts full article text, metadata, and image URLs from `https://www.anthropic.com/engineering`.

## Setup

```bash
cd anthropic-scraper
npm install
npx playwright install chromium
```

## Usage

Scrape a single article:

```bash
node src/scrape.mjs --url https://www.anthropic.com/engineering/april-23-postmortem
```

Scrape the latest N articles from the listing page:

```bash
node src/scrape.mjs --limit 5
```

Also emit a briefing-compatible JSON feed:

```bash
node src/scrape.mjs --limit 10 --briefing
```

Skip image extraction:

```bash
node src/scrape.mjs --limit 5 --no-images
```

## Output

All output is written to `output/`:

- `anthropic-engineering.json` — rich JSON with full article content (markdown + html) and image URLs
- `anthropic-engineering.rss` — RSS 2.0 feed
- `anthropic-engineering-briefing.json` — lightweight feed matching the `FeedBlogs` shape consumed by Study Parlor's briefing feature

## Integration with Study Parlor

The `anthropic-engineering-briefing.json` file follows the shape expected by `electron/ipc/briefing.ts` in the main app. Host this file somewhere accessible and point `BRIEFING_FEED_BLOGS_URL` at it to include Anthropic posts in `夜航简报`.

## Notes

- Anthropic's engineering blog is client-side rendered, so plain `fetch`/`curl` does not work. Playwright is required.
- The site markup may change over time; update selectors in `src/scrape.mjs` if scraping breaks.
- Please scrape responsibly: keep `--limit` modest and avoid hammering the site.
