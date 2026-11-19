import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { brand: { 50:"#fff7ed",100:"#ffedd5",500:"#f97316",600:"#ea580c",700:"#c2410c" } }, boxShadow: { soft:"0 8px 30px rgba(25,20,50,.06)" } } },
  plugins: []
};
export default config;
