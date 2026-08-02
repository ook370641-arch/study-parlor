import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

// E2E coverage for Scout conversation CRUD: create, rename, delete.
// Uses the deterministic E2E mock branch in electron/ipc/scout.ts — no network required.

test.describe('拾贝对话 CRUD', () => {
  test('新建对话出现在列表中', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    // Pre-seeded 'scout' source should show ScoutPanel directly
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Click new conversation button
    await window.locator(SELECTORS.scout.newConversation).click()

    // Assert a conversation item appears in the list
    await expect(
      window.locator('[data-testid^="scout-conversation-"]').first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('双击对话改名', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create a conversation first
    await window.locator(SELECTORS.scout.newConversation).click()
    const convItem = window.locator('[data-testid^="scout-conversation-"]').first()
    await expect(convItem).toBeVisible({ timeout: 5000 })

    // Double-click to enter rename mode (dblclick triggers span's onDoubleClick)
    await convItem.dblclick()

    // Verify rename input appears
    const renameInput = window.locator(SELECTORS.scout.conversationRenameInput)
    await expect(renameInput).toBeVisible()

    // Fill with new name and press Enter
    await renameInput.fill('拾贝测试新名称')
    await renameInput.press('Enter')

    // Assert rename input disappears (setEditingId(null) is sync)
    await expect(renameInput).not.toBeVisible({ timeout: 3000 })
  })

  test('删除对话', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create two conversations
    await window.locator(SELECTORS.scout.newConversation).click()
    await window.locator(SELECTORS.scout.newConversation).click()

    const convItems = window.locator('[data-testid^="scout-conversation-"]')
    await expect(convItems).toHaveCount(2)

    // Hover second conversation to reveal delete button (opacity-0 → group-hover:opacity-100)
    const secondConv = convItems.nth(1)
    await secondConv.hover()

    // Click delete button scoped within the second conversation
    const deleteBtn = secondConv.locator('[data-testid^="scout-conversation-delete-"]')
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // Confirm dialog should appear
    await expect(window.locator(SELECTORS.confirmDialog.dialog)).toBeVisible()
    await window.locator(SELECTORS.confirmDialog.confirmButton).click()

    // Wait for dialog to close
    await expect(window.locator(SELECTORS.confirmDialog.dialog)).not.toBeVisible({ timeout: 5000 })

    // Assert only one conversation remains
    await expect(window.locator('[data-testid^="scout-conversation-"]')).toHaveCount(1)
  })
})
