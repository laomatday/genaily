import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
await Promise.all([
  rm(join(projectRoot, 'dist'), { recursive: true, force: true }),
  rm(join(projectRoot, 'server.js'), { force: true }),
]);
