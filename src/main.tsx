// Performance timing: all performance.now() values are relative to
// navigationStart — the moment the browser began loading the page.
// This gives us the renderer-side breakdown of the ~21s
// did-start-loading → did-finish-load gap, reported via logTiming IPC.
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'
import { reportStartupResources } from '@/lib/startup-diag'

const t1 = performance.now()
window.api?.logTiming('main.tsx imports resolved', t1)

// Capture browser resource waterfall for startup diagnostics.
// Sends structured summary via logTiming IPC → terminal output.
// Dead-code eliminated in production builds (import.meta.env.DEV is
// a compile-time constant — Vite strips the branch and tree-shakes
// the import).
if (import.meta.env.DEV) {
  reportStartupResources()
}

createRoot(document.getElementById('root')!).render(<App />)

const t2 = performance.now()
window.api?.logTiming('main.tsx React.render() done', t2)

// React 挂载完成后，移除 index.html 中的 loading splash
// 避免与 React LoadingScreen 组件重叠
const splash = document.getElementById('loading-splash')
if (splash) {
  splash.style.opacity = '0'
  splash.style.transition = 'opacity 400ms ease-out'
  setTimeout(() => splash.remove(), 400)
}
