/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx,html}'
  ],
  theme: {
    extend: {
      scrollbar: ['rounded']
    },
  },
  plugins: [
    require('tailwind-scrollbar')({ nocompatible: true })
  ]
}
