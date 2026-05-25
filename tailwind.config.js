/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx,less}'],
  theme: {
    extend: {
      // 🌟 核心增补：将全局 Less/CSS 变量映射为 Tailwind 的语义原子类
      textColor: {
        title: 'var(--text-title)',
        subtitle: 'var(--text-subtitle)',
        body: 'var(--text-body)',
        primary: 'var(--brand-primary)',
        secondary: 'var(--brand-secondary)',
      },
      backgroundColor: {
        main: 'var(--bg-main)',
        panel: 'var(--bg-panel)',
        primary: 'var(--brand-primary)',
        secondary: 'var(--brand-secondary)',
      },
      borderColor: {
        primary: 'var(--brand-primary)',
        secondary: 'var(--brand-secondary)',
      },
    },
  },
  plugins: [],
};
