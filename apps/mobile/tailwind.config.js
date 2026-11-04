/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gum: {
          // Legado compartido con el resto de la plataforma.
          ink: '#211D19',
          soot: '#38322C',
          ember: '#B23A1D',
          emberdark: '#8C2B14',
          gold: '#C9A227',
          bone: '#F4F1EC',
          clay: '#E7DFD3',
          // Paleta Editorial sincronizada con el sitio web comercial.
          alabaster: '#FAF7F2',
          linen: '#F3EFE6',
          line: '#EBE5DC',
          espresso: '#141413',
          terracotta: '#C86D51',
          terracottadark: '#A85438',
          oro: '#C59B27',
          salvia: '#2F4842',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 4px 20px rgba(20,20,19,0.05)',
        cardLg: '0 8px 28px rgba(20,20,19,0.10)',
      },
    },
  },
  plugins: [],
};
