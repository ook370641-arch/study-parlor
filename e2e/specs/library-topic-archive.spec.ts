import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { SettingsPage } from '../pages/SettingsPage'
import { seedNewTopic } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 主题归档与重命名', () => {
  test('归档主题后从列表消失，设置恢复后重现', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'archive-topic', '归档测试主题')
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    const card = window.locator(SELECTORS.home.topicCard).filter({ hasText: 'archive-topic' })
    await expect(card).toBeVisible({ timeout: 10000 })

    // 归档后从正文列表消失
    await library.archiveTopic('archive-topic')
    await expect(card).toHaveCount(0)

    // 设置里出现并恢复
    await home.goToSettings()
    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await expect(window.locator(SELECTORS.settings.archivedTopics)).toContainText('archive-topic')
    await settings.restoreArchivedTopic('archive-topic')

    // 回到主页，主题重现
    await settings.goBack()
    await home.waitForLoaded()
    await expect(window.locator(SELECTORS.home.topicCard).filter({ hasText: 'archive-topic' })).toBeVisible({ timeout: 10000 })
  })

  test('归档主题不出现在卫星图（重力场）', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'drag-topic', '拖拽主题')
    seedNewTopic(testLibraryPath, 'keep-topic', '保留主题')
    seedNewTopic(testLibraryPath, 'hidden-topic', '归档主题')
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await library.archiveTopic('hidden-topic')
    await expect(window.locator(SELECTORS.home.topicCard).filter({ hasText: 'hidden-topic' })).toHaveCount(0)

    // 卫星图直接消费 store.library（已过滤），断言归档主题不在数据源中
    const visibleDirNames = await window.evaluate(() =>
      (window as any).useStore.getState().library.map((t: any) => t.dirName))
    expect(visibleDirNames).not.toContain('hidden-topic')
    expect(visibleDirNames).toContain('keep-topic')

    // 真实拖拽打开重力场，断言归档主题节点不渲染、未归档主题节点渲染
    const dragCard = window.locator(SELECTORS.home.topicCard).filter({ hasText: 'drag-topic' })
    const box = await dragCard.boundingBox()
    if (!box) throw new Error('drag-topic card not visible')
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + 140, box.y + 140, { steps: 8 })

    const field = window.locator(SELECTORS.library.gravityField)
    await expect(field).toBeVisible({ timeout: 5000 })
    await expect(field.getByText('keep-topic')).toBeVisible()
    await expect(field.getByText('hidden-topic')).toHaveCount(0)
    await window.mouse.up()
  })

  test('重命名主题同步目录与报告 frontmatter title', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'rename-topic', '重命名测试主题')
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await expect(window.locator(SELECTORS.home.topicCard).filter({ hasText: 'rename-topic' })).toBeVisible({ timeout: 10000 })

    await library.renameTopic('rename-topic', '新名字')

    // 卡片显示新名
    await expect(window.locator(SELECTORS.home.topicCard).filter({ hasText: '新名字' })).toBeVisible({ timeout: 10000 })

    // 目录已改名
    const socraticRoot = path.join(testLibraryPath, '苏格拉底对话')
    expect(fs.existsSync(path.join(socraticRoot, '新名字'))).toBe(true)
    expect(fs.existsSync(path.join(socraticRoot, 'rename-topic'))).toBe(false)

    // 报告 frontmatter title 已同步为新名
    const reportPath = path.join(socraticRoot, '新名字', 's1', '学习报告.md')
    const raw = fs.readFileSync(reportPath, 'utf8')
    expect(raw).toContain('title: 新名字')
  })
})
