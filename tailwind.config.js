/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Archivo",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Neutro frio (hue 205), derivado do design handoff Viabilize — substitui o slate padrão
        // do Tailwind em todo o app (mesmas classes, cores novas).
        slate: {
          50: "oklch(0.985 0.004 205)", // fundo da página
          100: "oklch(0.93 0.008 205)", // divisor (linhas de tabela)
          200: "oklch(0.90 0.012 205)", // borda (cards, inputs)
          300: "oklch(0.80 0.015 205)",
          400: "oklch(0.58 0.02 205)", // texto secundário (legendas, subtítulos)
          500: "oklch(0.48 0.02 205)", // texto secundário (rótulos de campo)
          600: "oklch(0.40 0.02 205)",
          700: "oklch(0.32 0.02 205)", // texto de corpo/tabela
          800: "oklch(0.20 0.02 205)", // texto primário (títulos, valores)
          900: "oklch(0.15 0.02 205)",
        },
        // Accent (teal, hue 160) — substitui o blue padrão do Tailwind.
        blue: {
          50: "oklch(0.95 0.035 160)", // fundo suave do accent
          100: "oklch(0.90 0.05 160)",
          200: "oklch(0.85 0.06 160)", // borda do accent
          300: "oklch(0.78 0.09 160)",
          400: "oklch(0.68 0.11 160)",
          500: "oklch(0.56 0.135 160)",
          600: "oklch(0.50 0.13 160)", // accent principal
          700: "oklch(0.42 0.13 160)", // accent hover/ênfase
          800: "oklch(0.34 0.12 160)",
        },
      },
    },
  },
  plugins: [],
};
