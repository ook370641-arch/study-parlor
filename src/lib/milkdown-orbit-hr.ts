// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分隔线 = 行星轨道(设计 spec §D):固定椭圆+中心行星(ember)+卫星(currentColor)沿椭圆公转。
// reduced-motion 下不渲染 animateMotion,卫星静止在起点。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const SAT_PATH = 'M160 20 A 60 12 0 1 1 40 20 A 60 12 0 1 1 160 20'

export const orbitHrPlugins: MilkdownPlugin[] = [
  $prose(() =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_ORBIT_HR'),
      props: {
        nodeViews: {
          hr: () => ({
            dom: (() => {
              const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              const wrap = document.createElement('div')
              wrap.className = 'writing-orbit-hr'
              wrap.innerHTML = `<svg viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" stroke-width="1" opacity="0.4"/>
                <ellipse cx="100" cy="20" rx="60" ry="12" stroke="currentColor" stroke-width="1" opacity="0.5" fill="none"/>
                <circle cx="100" cy="20" r="6" fill="#d97757"/>
                <circle ${reduced ? 'cx="160" cy="20"' : ''} r="3.5" fill="currentColor" opacity="0.75">
                  ${reduced ? '' : `<animateMotion dur="14s" repeatCount="indefinite" path="${SAT_PATH}"/>`}
                </circle>
              </svg>`
              return wrap
            })(),
          }),
        },
      },
    }),
  ),
]
