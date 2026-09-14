import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';
import createStyledComponentsTransformer from 'typescript-plugin-styled-components';
import packageJson from './package.json';

const styledComponentsTransformer = createStyledComponentsTransformer({
  displayName: true,
});

// Kept in sync with rollup.config.prod.js; see the comment there.
const externalDeps = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
];
const external = (id) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));

const plugins = () => [
  peerDepsExternal(),
  typescript({
    useTsconfigDeclarationDir: true,
    include: ['**/*.ts', '**/*.tsx'],
    exclude: 'node_modules/**',
    transformers: [
      () => ({
        before: [styledComponentsTransformer],
      }),
    ],
  }),
];

export default [
  {
    input: ['./src/index.ts'],
    external,
    output: [
      {
        file: packageJson.exports['.'].import,
        format: 'esm',
        sourcemap: false,
      },
    ],
    plugins: plugins(),
  },
  // Server-only entry; see rollup.config.prod.js.
  {
    input: ['./src/server/index.ts'],
    external,
    output: [
      {
        file: packageJson.exports['./server'].import,
        format: 'esm',
        sourcemap: false,
      },
    ],
    plugins: plugins(),
  },
];
