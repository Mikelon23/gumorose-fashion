/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gum: {
          // Legado (ERP/Admin): no romper contratos visuales existentes.
          ink: '#211D19',
          soot: '#38322C',
          ember: '#B23A1D',
          emberdark: '#8C2B14',
          gold: '#C9A227',
          bone: '#F4F1EC',
          clay: '#E7DFD3',
          // Paleta Editorial D2C Contemporánea (sitio comercial).
          alabaster: '#FAF7F2',
          linen: '#F3EFE6',
          line: '#E6E0D6',
          espresso: '#141413',
          terracotta: '#C86D51',
          terracottadark: '#A85438',
          oro: '#C59B27',
          salvia: '#2F4842',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
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
        editorial: '0 1px 2px rgb(20 20 19 / 0.05), 0 8px 24px rgb(20 20 19 / 0.07)',
        editorialLg: '0 2px 4px rgb(20 20 19 / 0.06), 0 16px 40px rgb(20 20 19 / 0.12)',
      },
    },
  },
  plugins: [],
};
