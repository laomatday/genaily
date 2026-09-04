import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputDirectory = join(projectRoot, 'dist');
const budget = JSON.parse(await readFile(join(projectRoot, 'bundle-budget.json'), 'utf8'));

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

const assets = await Promise.all((await collectFiles(outputDirectory)).map(async (path) => {
  const content = await readFile(path);
  return { path, bytes: content.byteLength, gzipBytes: gzipSync(content).byteLength };
}));
const scripts = assets.filter((asset) => extname(asset.path) === '.js');
const styles = assets.filter((asset) => extname(asset.path) === '.css');
const failures = [];
const totalJavaScriptGzipBytes = scripts.reduce((sum, asset) => sum + asset.gzipBytes, 0);

if (totalJavaScriptGzipBytes > budget.maxTotalJavaScriptGzipBytes) {
  failures.push(`JavaScript gzip total ${totalJavaScriptGzipBytes} > ${budget.maxTotalJavaScriptGzipBytes}`);
}
for (const asset of scripts) {
  if (asset.gzipBytes > budget.maxSingleJavaScriptGzipBytes) {
    failures.push(`${asset.path} gzip ${asset.gzipBytes} > ${budget.maxSingleJavaScriptGzipBytes}`);
  }
}
for (const asset of styles) {
  if (asset.gzipBytes > budget.maxStylesheetGzipBytes) {
    failures.push(`${asset.path} gzip ${asset.gzipBytes} > ${budget.maxStylesheetGzipBytes}`);
  }
}
for (const asset of assets) {
  if (asset.bytes > budget.maxSingleAssetBytes) {
    failures.push(`${asset.path} raw ${asset.bytes} > ${budget.maxSingleAssetBytes}`);
  }
}

console.log(JSON.stringify({ totalJavaScriptGzipBytes, assets }, null, 2));
if (failures.length > 0) {
  throw new Error(`Bundle budget exceeded:\n${failures.join('\n')}`);
}
