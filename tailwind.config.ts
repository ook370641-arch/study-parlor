import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Disco Elysium 暗色仪式感
        ink:    '#2a1f1a',  // 深褐 主背景
        parchment: '#e8d5b7',  // 米色 主文字
        ember:  '#d97757',  // 暖橙 强调 / CTA
        slate:  '#3a5a6a',  // 蓝灰 次要 / 阴影偏移
        wine:   '#8a3a3a',  // 深红 警告 / 关键状态
        wildcard: '#8b7fb8'   // 紫罗兰 意外之径
      },
      fontFamily: {
        serif: ['"Source Han Serif SC"', 'Georgia', 'serif'],
        sans:  ['"Source Han Sans SC"', 'system-ui', 'sans-serif']
      },
      animation: {
        lightSweep: 'lightSweep 0.6s ease-out forwards',
      },
      keyframes: {
        lightSweep: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    }
  },
  plugins: []
} satisfies Config
