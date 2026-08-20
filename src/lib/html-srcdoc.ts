/**
 * HTML 预览 srcdoc 装配链：在原文基础上注入
 * 1. <base target="_blank"> —— 链接点击走 window.open → 系统浏览器
 * 2. <style>html{zoom:F !important}</style> —— 整页等比缩放，随 writingUIFontSize 档位
 */

function injectBaseTarget(html: string): string {
  const base = '<base target="_blank">'
  const headMatch = /<head[^>]*>/i.exec(html)
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length
    return html.slice(0, at) + base + html.slice(at)
  }
  return base + html
}

function injectZoom(html: string, zoom: number): string {
  const style = `<style>html{zoom:${zoom} !important}</style>`
  const closeMatch = /<\/head>/i.exec(html)
  if (closeMatch) {
    return html.slice(0, closeMatch.index) + style + html.slice(closeMatch.index)
  }
  return style + html
}

export function buildPreviewSrcdoc(html: string, zoom: number): string {
  // 先 zoom 后 base：无 <head> 时两者都前置，保证 <base> 仍在文档最前（与既有行为一致）
  return injectBaseTarget(injectZoom(html, zoom))
}
