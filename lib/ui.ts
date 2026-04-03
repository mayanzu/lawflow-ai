/** Apple-style 高分屏适配工具
 * 1. 用 rem 替代 px —— 用户调大字体时自动适应
 * 2. 用 clamp() 实现流体字体 —— 手机→平板→4K 自动缩放
 * 3. 高分屏 media query —— 2x 密度下增大间距
 */

export function rem(px: number): string {
  return `${px / 16}rem`
}

export function clamp(minPx: number, preferredVw: number, maxPx: number): string {
  return `clamp(${minPx}px, ${preferredVw}vw, ${maxPx}px)`
}

/** 字体层级（Apple Design） */
export const font = {
  // 页面主标题
  h1: rem(32),       // 默认
  h2: rem(24),
  h3: rem(17),
  h4: rem(15),
  // 正文
  body: rem(16),
  bodySm: rem(14),
  caption: rem(12),
  tiny: rem(11),
  // 按钮
  btn: rem(17),
  btnSm: rem(15),
} as const

/** CSS 变量注入 */
export const CSS_VARIABLES = `
@media (min-resolution: 2dppx), (min-resolution: 192dpi) {
  :root {
    --font-scale: 1.1;
  }
}
@media (min-width: 768px) {
  :root {
    --font-scale: 1;
  }
  body { font-size: 17px; }
}
@media (min-width: 1440px) {
  body { font-size: 18px; }
}
`

export function pxScale(px: number): string {
  return `${Math.round(px * 1.0)}px`
}
