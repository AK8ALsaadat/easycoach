import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

// Production client-reference chunks, excluding deferred dynamic imports.
// This measures emitted JS bytes, not runtime Core Web Vitals.
const results = {};
for (const [route, component] of [['coach/[[...path]]', 'workspace.tsx'], ['me', 'trainee.tsx']]) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(`.next/server/app/${route}/page_client-reference-manifest.js`, 'utf8'), context);
  const manifest = Object.values(context.__RSC_MANIFEST)[0];
  const entry = Object.entries(manifest.clientModules).find(([name]) => name.replaceAll('\\', '/').endsWith(`/components/${component}`));
  if (!entry) throw Error(`Missing ${component}`);
  const files = [...new Set(entry[1].chunks.filter(file => typeof file === 'string' && file.endsWith('.js')))];
  const sizes = files.map(file => { const buffer = fs.readFileSync(`.next/${decodeURIComponent(file)}`); return { file, bytes: buffer.length, gzip: gzipSync(buffer).length }; });
  results[route] = { bytes: sizes.reduce((sum, file) => sum + file.bytes, 0), gzip: sizes.reduce((sum, file) => sum + file.gzip, 0), files: sizes };
}
fs.mkdirSync('artifacts/performance', { recursive: true });
fs.writeFileSync(`artifacts/performance/bundles-${process.argv[2] ?? 'sample'}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (process.argv.includes('--check')) {
  assert(results['coach/[[...path]]'].gzip < 165000, 'Coach entry JS exceeds its gzip budget');
  assert(results.me.gzip < 190000, 'Trainee entry JS exceeds its gzip budget');
}
