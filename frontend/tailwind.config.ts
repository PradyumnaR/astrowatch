import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // page backgrounds
        'aw-bg':      '#0d0d1a',
        'aw-surface':  '#1e1e3a',
        // brand accents
        'aw-purple':   '#7c6ff7',
        'aw-teal':     '#2dd4a0',
        'aw-amber':    '#f5a623',
        // border
        'aw-border':   'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config