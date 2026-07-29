import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';

import packageJson from './package.json';

export default [
  {
    input: './src/client.tsx',
    external: ['connectkit', 'react', 'react-dom', 'viem', 'viem/siwe'],
    output: {
      file: packageJson.exports['./client'].import,
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      peerDepsExternal(),
      typescript({
        useTsconfigDeclarationDir: true,
        include: ['**/*.ts', '**/*.tsx'],
        exclude: 'node_modules/**',
      }),
    ],
  },
  {
    input: './src/server.ts',
    external: [
      'iron-session',
      'next',
      'viem',
      'viem/chains',
      'viem/siwe',
    ],
    output: {
      file: packageJson.exports['./server'].import,
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      peerDepsExternal(),
      typescript({
        useTsconfigDeclarationDir: true,
        include: ['**/*.ts', '**/*.tsx'],
        exclude: 'node_modules/**',
      }),
    ],
  },
];
