// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分隔线 = 行星轨道(设计 spec §D):固定椭圆+中心行星(ember)+卫星(currentColor)沿椭圆公转。
// reduced-motion 下不渲染 animateMotion,卫星静止在起点。
// insertHrCleanCommand:自建插入(设计 2026-08-12 §4)——只 replaceSelectionWith(hr),
// 不像 preset-commonmark 的 insertHrCommand 会 .insert(from, 空段) 多塞一个空段落。
import { $command, $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const SAT_PATH = 'M160 20 A 60 12 0 1 1 40 20 A 60 12 0 1 1 160 20'

export const insertHrCleanCommand = $command('InsertHrClean', () => () => (state, dispatch) => {
  if (!dispatch) return true
  const hr = state.schema.nodes.hr.create()
  dispatch(state.tr.replaceSelectionWith(hr))
  return true
})

export const orbitHrPlugins: MilkdownPlugin[] = [
  insertHrCleanCommand,
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
