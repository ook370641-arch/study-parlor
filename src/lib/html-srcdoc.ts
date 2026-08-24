/**
 * HTML 预览 srcdoc 装配链：在原文基础上注入
 * 1. <base target="_blank"> —— 链接点击走 window.open → 系统浏览器
 * 2. <style>html{zoom:F !important}</style> —— 整页等比缩放，随 writingUIFontSize 档位
 * 3. 删除模式 hover 样式 + 脚本 —— 常驻休眠，postMessage 激活（2026-08-24 删除模式）
 * 所有注入节点带 data-sp-inject：保存写回前由删除脚本克隆剔除，保证存回文件无注入物。
 */

import { HTML_DELETE_HOVER_STYLE, HTML_DELETE_SCRIPT } from './html-delete-script'

function injectBaseTarget(html: string): string {
  const base = '<base target="_blank" data-sp-inject>'
  const headMatch = /<head[^>]*>/i.exec(html)
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length
    return html.slice(0, at) + base + html.slice(at)
  }
  return base + html
}

function injectZoom(html: string, zoom: number): string {
  const style = `<style data-sp-inject>html{zoom:${zoom} !important}</style>`
  const closeMatch = /<\/head>/i.exec(html)
  if (closeMatch) {
    return html.slice(0, closeMatch.index) + style + html.slice(closeMatch.index)
  }
  return style + html
}

function injectDeleteMode(html: string): string {
  const payload =
    `<style data-sp-inject>${HTML_DELETE_HOVER_STYLE}</style>` +
    `<script data-sp-inject>${HTML_DELETE_SCRIPT}</script>`
  const closeMatch = /<\/body>/i.exec(html)
  if (closeMatch) {
    return html.slice(0, closeMatch.index) + payload + html.slice(closeMatch.index)
  }
  return html + payload
}

export function buildPreviewSrcdoc(html: string, zoom: number): string {
  // 先 zoom 后 base：无 <head> 时两者都前置，保证 <base> 仍在文档最前（与既有行为一致）；
  // 删除脚本最后注入（</body> 前），不干扰 head 装配。
  return injectDeleteMode(injectBaseTarget(injectZoom(html, zoom)))
}
