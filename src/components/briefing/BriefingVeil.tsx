// 分层渐变遮罩：报头区透出画作（0.30）→ 正文区压暗至 0.94。
// 全局 Chrome，仅 Academic 主题挂载（调用方控制），自身不读主题（ui-styling §8）。
export function BriefingVeil() {
  return (
    <div
      data-testid="briefing-veil"
      className="fixed inset-0 z-[1] pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, rgba(12,8,6,0.30) 0%, rgba(12,8,6,0.62) 26%, rgba(12,8,6,0.86) 55%, rgba(12,8,6,0.94) 100%)',
      }}
      aria-hidden="true"
    />
  )
}
