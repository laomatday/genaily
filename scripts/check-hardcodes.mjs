import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i;
const sourceRoot = path.resolve('src');
const violations = [];

function walkSource(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkSource(absolutePath);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
    if (absolutePath === path.join(sourceRoot, 'config', 'brand.ts')) continue;
    const lines = fs.readFileSync(absolutePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (COLOR_LITERAL.test(line)) {
        violations.push(`${path.relative(process.cwd(), absolutePath)}:${index + 1}`);
      }
    });
  }
}

walkSource(sourceRoot);

const stylesheetPath = path.join(sourceRoot, 'style.css');
const stylesheet = postcss.parse(fs.readFileSync(stylesheetPath, 'utf8'), { from: stylesheetPath });
stylesheet.walkDecls((declaration) => {
  if (!COLOR_LITERAL.test(declaration.value)) return;
  const selector = declaration.parent?.type === 'rule' ? declaration.parent.selector : '';
  const isThemeToken = declaration.prop.startsWith('--app-')
    && (selector === ':root' || selector === ':root[data-theme="dark"]');
  if (!isThemeToken) {
    violations.push(`${path.relative(process.cwd(), stylesheetPath)}:${declaration.source?.start?.line ?? 0}`);
  }
});

if (violations.length > 0) {
  console.error('Color literals must be declared as semantic theme tokens only:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log('Hardcode audit passed: component colors resolve through semantic tokens.');
