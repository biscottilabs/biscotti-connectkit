import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';

import packageJson from './package.json';

// Everything declared as a runtime or peer dependency stays external — a library
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

export default [
  {
    input: ['./src/index.ts'],
    external,
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
