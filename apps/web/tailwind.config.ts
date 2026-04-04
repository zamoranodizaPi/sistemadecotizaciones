import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#eef4ff',
        sky: '#d8e8ff',
        steel: '#64748b',
        accent: '#0f766e',
      },
    },
  },
  plugins: [],
};

export default config;

