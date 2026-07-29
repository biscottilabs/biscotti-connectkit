import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';

import packageJson from './package.json';

export default [
  {
    input: ['./src/index.ts'],
    external: [
      '@wagmi/connectors',
      '@wagmi/core',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'framer-motion',
      'wagmi',
    ],
    output: {
      file: packageJson.exports.import,
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      peerDepsExternal(),
      typescript({
        useTsconfigDeclarationDir: true,
        clean: true,
        include: ['**/*.ts', '**/*.tsx'],
        exclude: 'node_modules/**',
      }),
    ],
  },
];
