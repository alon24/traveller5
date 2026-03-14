/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        egged: '#E8521A',
        dan: '#0050A0',
        'israel-rail': '#6B2D8B',
        metropoline: '#007A3D',
        kavim: '#E91E8C',
        gray: {
          750: '#2d3748',
          850: '#1a202c',
          950: '#030712',
        },
      },
    },
  },
  plugins: [],
}

