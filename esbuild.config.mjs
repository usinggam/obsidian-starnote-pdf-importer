import { build } from 'esbuild';

const prod = process.argv.includes('--production');

build({
  entrypoint: 'src/main.ts',
  bundle: true,
  external: ['obsidian'],
  platform: 'browser',
  target: 'esnext',
  format: 'cjs',
  output: 'main.js',
  sourcemap: !prod,
  minify: prod,
}).catch(() => process.exit(1));
