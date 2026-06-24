export const SELECTORS = {
  home: {
    greeting: '[data-testid="home-greeting"]',
    newTopicButton: '[data-testid="new-topic-button"]',
    librarySection: '[data-testid="library-section"]',
    continueUnsavedButton: '[data-testid="continue-unsaved-button"]',
  },
  preStudy: {
    modal: '[data-testid="prestudy-modal"]',
    topicInput: '[data-testid="topic-input"]',
    topicSourceNew: '[data-testid="topic-source-new"]',
    topicSourceExisting: '[data-testid="topic-source-existing"]',
    startButton: '[data-testid="start-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  },
  study: {
    page: '[data-testid="study-page"]',
    messageList: '[data-testid="message-list"]',
    chatInput: '[data-testid="study-page"] textarea',
    sendButton: 'text=递出',
    archivePendingBanner: '[data-testid="archive-pending-banner"]',
    archiveButton: '[data-testid="archive-button"]',
  },
} as const
