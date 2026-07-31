/*
 * Builds every example, one at a time.
 *
 * `bun run --filter './examples/*' build` runs them concurrently, which is
 * faster but not reliable here: with several `next build` processes running at
 * once, module resolution intermittently fails with
 * `Module not found: Can't resolve 'connectkit'` even though the workspace
 * symlink and build output are both present. The failing example varies from
 * run to run. Sequential builds are deterministic, so CI trades wall-clock for
 * a gate that means something.
 *
 * Examples are discovered from the directory listing rather than hardcoded, so
 * a newly added example is covered automatically.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `examples/${entry.name}`)
  .filter((dir) => existsSync(`${dir}/package.json`));

for (const dir of examples) {
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  if (!pkg.scripts?.build) {
    console.log(`- skipping ${pkg.name} (no build script)`);
    continue;
  }

  console.log(`\n> building ${pkg.name}`);
  // Throws on a non-zero exit, which fails this script and therefore the build.
  execFileSync('bun', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
}
