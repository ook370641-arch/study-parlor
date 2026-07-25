import '@testing-library/jest-dom/vitest'

// jsdom polyfill: window.matchMedia is required by CandlelightLayer
// and other components that check prefers-reduced-motion.
// Guarded because some tests (e.g., job-briefing-real) run in Node environment.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
