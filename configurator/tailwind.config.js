/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ["./index.html", "./**/*.{ts,tsx}", "../src/components/**/*.{ts,tsx}"],
  },
  theme: { extend: {} },
  plugins: [],
};
