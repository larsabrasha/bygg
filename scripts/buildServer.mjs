// Bundles the server (server/index.ts and the code it shares with the app) into one JavaScript file,
// dist-server/index.mjs, with its dependencies included. The Docker image runs it with plain node:
// no TypeScript at startup and no node_modules in the image.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Some dependencies are CommonJS and call require() for Node's built-in modules; an ES module has no require.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
})
