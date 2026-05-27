export const warmDarkTheme = {
  name: 'study-parlor',
  type: 'dark' as const,
  colors: {
    'editor.background': '#15100d',
    'editor.foreground': '#e8d5b7',
  },
  tokenColors: [
    { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: '#d97757' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7fb069' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#c9a86c' } },
    { scope: ['constant.numeric'], settings: { foreground: '#deb887' } },
    { scope: ['comment'], settings: { foreground: '#6b6b5e', fontStyle: 'italic' } },
    { scope: ['variable', 'identifier'], settings: { foreground: '#e8d5b7' } },
    { scope: ['entity.name.type', 'support.type'], settings: { foreground: '#d4a574' } },
    { scope: ['entity.name.class'], settings: { foreground: '#d4a574' } },
    { scope: ['operator'], settings: { foreground: '#d97757' } },
  ],
}
