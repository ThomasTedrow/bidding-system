/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        slideIn: {
          'from': {
            opacity: '0',
            transform: 'translateY(-10px)',
          },
          'to': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        spin: {
          'to': {
            transform: 'rotate(360deg)',
          },
        },
      },
      animation: {
        slideIn: 'slideIn 0.3s ease-out',
        spin: 'spin 0.8s linear infinite',
      },
      backgroundImage: {
        'gradient-purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-purple-light': 'linear-gradient(135deg, #8896ef 0%, #9268b9 100%)',
      },
    },
  },
  plugins: [],
}

