import { build } from 'esbuild';

const prod = process.argv.includes('--production');

build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  platform: 'browser',
  target: 'esnext',
  format: 'cjs',
  outfile: 'main.js',
  sourcemap: !prod,
  minify: prod,
}).catch(() => process.exit(1));
