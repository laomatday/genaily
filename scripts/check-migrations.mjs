import PgQueryModule from 'pg-query-emscripten';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const migrationsDirectory = resolve(import.meta.dirname, '../supabase/migrations');
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const failures = [];

for (const file of migrationFiles) {
  const parser = await new PgQueryModule();
  const sql = await readFile(join(migrationsDirectory, file), 'utf8');
  const result = parser.parse(sql);
  if (result.error) {
    failures.push(`${file}:${result.error.cursorpos ?? '?'} ${result.error.message}`);
  }
}

if (failures.length > 0) {
  throw new Error(`PostgreSQL migration syntax check failed:\n${failures.join('\n')}`);
}
console.log(`Parsed ${migrationFiles.length} PostgreSQL migration files successfully.`);
