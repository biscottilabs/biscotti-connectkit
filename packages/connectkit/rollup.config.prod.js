import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';

import packageJson from './package.json';

// Everything declared as a runtime or peer dependency stays external: a library
// must not bundle its own dependencies, or consumers end up with duplicate copies
// (two styled-components instances, two wagmi connector identities, and so on).
// Derived from package.json so a newly added dependency cannot be silently
// bundled. The subpath check keeps imports like `react/jsx-runtime` external too.
const externalDeps = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
];
const external = (id) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));

const plugins = (clean) => [
  peerDepsExternal(),
  typescript({
    useTsconfigDeclarationDir: true,
    clean,
    include: ['**/*.ts', '**/*.tsx'],
    exclude: 'node_modules/**',
  }),
];

export default [
  {
    input: ['./src/index.ts'],
    external,
    output: {
      file: packageJson.exports['.'].import,
      format: 'esm',
      sourcemap: true,
    },
    plugins: plugins(true),
  },
  // Server-only entry. Built separately so it never pulls in React, wagmi or
  // any browser code, and can run in Node, edge runtimes and route handlers.
  {
    input: ['./src/server/index.ts'],
    external,
    output: {
      file: packageJson.exports['./server'].import,
      format: 'esm',
      sourcemap: true,
    },
    plugins: plugins(false),
  },
];
