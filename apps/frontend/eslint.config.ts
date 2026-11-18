import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Loaded through Node's native type stripping: `eslint --flag unstable_native_nodejs_ts_config`.
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      // React Compiler advisory rules are tracked separately; existing effects are reviewed manually.
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.wrangler/**',
    '.qa/**',
    'dist/**',
    'coverage/**',
    'next-env.d.ts',
    'cloudflare-env.d.ts',
  ]),
]);
