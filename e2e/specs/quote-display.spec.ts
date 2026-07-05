import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@smoke quote display', () => {
  test('Cover shows a quote with author meta', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    const quoteText = window.locator(SELECTORS.quote.text)
    const quoteMeta = window.locator(SELECTORS.quote.meta)

    await expect(quoteText).toBeVisible()
    await expect(quoteText).toContainText('“')
    await expect(quoteMeta).toContainText('—')
  })

  test('Home shows a quote', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()

    const quoteText = window.locator(SELECTORS.quote.text)
    await expect(quoteText).toBeVisible()
  })

  test('Refresh button changes the quote', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()

    const quoteText = window.locator(SELECTORS.quote.text)
    const refreshButton = window.locator(SELECTORS.quote.refreshButton)

    await refreshButton.waitFor({ state: 'attached' })
    const initial = await quoteText.textContent()

    let current = initial
    let attempts = 0
    while (current === initial && attempts < 5) {
      await refreshButton.click({ force: true })
      // wait for re-render
      await window.waitForTimeout(150)
      current = await quoteText.textContent()
      attempts++
    }

    expect(current).not.toBe(initial)
  })
})

test.describe('@slow quote display on study', () => {
  test('Study chat shows a quote above the first message', async ({ window }) => {
    test.setTimeout(180000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('Quote E2E 测试主题')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()

    const messageList = window.locator(SELECTORS.study.messageList)
    const firstWrapper = messageList.locator(':scope > div').first()
    const quoteText = firstWrapper.locator(SELECTORS.quote.text)

    await expect(quoteText).toBeVisible()
  })
})
