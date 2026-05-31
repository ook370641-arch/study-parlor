import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(<App />)

// React 挂载完成后，移除 index.html 中的 loading splash
// 避免与 React LoadingScreen 组件重叠
const splash = document.getElementById('loading-splash')
if (splash) {
  splash.style.opacity = '0'
  splash.style.transition = 'opacity 400ms ease-out'
  setTimeout(() => splash.remove(), 400)
}
