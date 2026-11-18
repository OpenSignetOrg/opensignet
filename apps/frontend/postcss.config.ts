// Turbopack loads TypeScript PostCSS configs (`postcss.config.ts`) in its Node.js worker pool.
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
} satisfies { plugins: Record<string, Record<string, never>> };

export default config;
