/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:      '#07070f',
        surface: '#0e0e1e',
        card:    '#13132a',
        border:  '#1e1e3c',
        primary: '#00c8ff',
        green:   '#00e676',
        red:     '#ff3366',
        amber:   '#ffaa00',
      },
    },
  },
  plugins: [],
}

