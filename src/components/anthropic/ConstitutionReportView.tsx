import type { BriefingTheme } from '@shared/index'

interface Props {
  theme?: BriefingTheme
}

/**
 * Claude's Constitution 可视化报告视图。
 * 报告是 422KB 自包含 HTML（内联 CSS/JS），由主进程 sp-report:// 协议提供，
 * 响应头携带独立的宽松 CSP（生产环境页面 CSP 不允许 inline script，srcDoc 不可行）。
 * 字号控制对 iframe 无效，刻意不渲染。
 */
export function ConstitutionReportView({ theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  return (
    <div
      data-testid="constitution-report-view"
      className={`relative flex-1 min-w-0 flex flex-col ${isAcademic ? 'bg-[#1a1410]' : 'bg-white'}`}
    >
      <iframe
        data-testid="constitution-report-frame"
        src="sp-report://constitution/index.html"
        sandbox="allow-scripts allow-popups"
        title="Claude's Constitution 可视化双语读本"
        className="flex-1 w-full border-0"
      />
    </div>
  )
}
