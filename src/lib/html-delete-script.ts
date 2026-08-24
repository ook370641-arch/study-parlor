/**
 * 注入到 HTML 预览 iframe 的删除模式脚本与 hover 样式（srcdoc 装配期注入，常驻休眠，
 * 父进程 postMessage {type:'sp-html-edit',on} 激活）。
 * 约束：脚本体不得包含字面量 "</script"（提前闭合标签）、不得包含反引号/${；
 * postMessage 目标 origin 用 '*'（沙箱 opaque origin）。
 */

export const HTML_DELETE_HOVER_STYLE =
  '.sp-del-hover{outline:2px solid #d97757 !important;outline-offset:-2px !important;cursor:pointer !important}'

export const HTML_DELETE_SCRIPT = [
  '(function(){',
  'var HOVER="sp-del-hover";',
  'var SEL="p,li,blockquote,pre,tr,table,h1,h2,h3,h4,h5,h6,figure,section,article";',
  'var active=false,dirty=false,hovered=null,undoStack=[];',
  'function blockOf(e){var t=e.target;if(!t||!t.closest)return null;',
  'var b=t.closest(SEL);',
  'if(!b||b===document.documentElement||b===document.body)return null;return b;}',
  'function setHover(el){if(hovered===el)return;',
  'if(hovered)hovered.classList.remove(HOVER);',
  'hovered=el;if(hovered)hovered.classList.add(HOVER);}',
  'document.addEventListener("mouseover",function(e){if(active)setHover(blockOf(e));},true);',
  // 删除模式下拦下一切点击（含链接）并删块；capture 阶段先于页面脚本
  'document.addEventListener("click",function(e){',
  'if(!active)return;',
  'e.preventDefault();e.stopPropagation();',
  'var b=blockOf(e);if(!b)return;',
  'undoStack.push({el:b,parent:b.parentNode,next:b.nextSibling});',
  'setHover(null);b.remove();',
  'if(!dirty){dirty=true;window.parent.postMessage({type:"sp-html-dirty"},"*");}',
  '},true);',
  // Ctrl+Z 撤销：活 DOM 引用插回；祖先被删（parent 已不在文档）则丢弃该条
  'document.addEventListener("keydown",function(e){',
  'if(!active)return;',
  'if((e.ctrlKey||e.metaKey)&&(e.key==="z"||e.key==="Z")){',
  'e.preventDefault();',
  'var top=undoStack.pop();if(!top)return;',
  'if(top.parent&&top.parent.isConnected){',
  'top.parent.insertBefore(top.el,(top.next&&top.next.isConnected)?top.next:null);',
  '}',
  '}',
  '},true);',
  'window.addEventListener("message",function(e){',
  'var d=e.data;if(!d||typeof d!=="object")return;',
  'if(d.type==="sp-html-edit"){',
  'active=!!d.on;',
  'if(!active){setHover(null);undoStack.length=0;}',
  '}else if(d.type==="sp-html-collect"){',
  // 序列化纯净性：克隆后剔除全部注入物与 hover class，再 outerHTML
  'setHover(null);',
  'var clone=document.documentElement.cloneNode(true);',
  'var inj=clone.querySelectorAll("[data-sp-inject]");',
  'for(var i=0;i<inj.length;i++)inj[i].remove();',
  'var hov=clone.querySelectorAll("."+HOVER);',
  'for(var j=0;j<hov.length;j++)hov[j].classList.remove(HOVER);',
  'window.parent.postMessage({type:"sp-html-save",html:clone.outerHTML},"*");',
  '}',
  '});',
  '})();',
].join('\n')
