// 重量/归位语法：全应用统一的双弹簧物理（ui-styling §11 登记：引力/轨道语言的触觉层）。
// 所有弹性过渡引用本文件常量；globals.css 关键帧是这些值的 CSS 落点，改值必须两边同步。

/** 落定：过冲回稳（换画落入、卫星归井、日期选中、抽屉开合的「停」） */
export const SPRING_SETTLE = 'cubic-bezier(0.34, 1.4, 0.5, 1)'
/** 滑动：快出慢停（抵达阶梯、面板进场的「迎」） */
export const SPRING_SLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** 换画：旧画坠出时长 */
export const SWAP_FALL_MS = 500
/** 换画：新画落入时长 */
export const SWAP_DROP_MS = 550
/** 换画：新画落入的延迟（让坠落先发生） */
export const SWAP_DROP_DELAY_MS = 240
/** 换画全程 = max(500, 240+550) + 余量 = 连点锁时长 */
export const SWAP_TOTAL_MS = 850
