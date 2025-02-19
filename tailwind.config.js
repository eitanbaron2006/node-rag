/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('tailwind-scrollbar')({ nocompatible: true })
  ],
}
