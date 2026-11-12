module.exports = {
  content: {
    relative: true,
    files: ['./public/index.html', './public/script.js'],
  },
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        sunken: 'var(--bg-sunken)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        fg: 'var(--text)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: {
          DEFAULT: 'var(--accent)',
          fill: 'var(--accent-fill)',
          text: 'var(--accent-text)',
        },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"SFMono-Regular"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
