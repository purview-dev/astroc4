// check-dist.ts
// path: scripts/check-dist.ts
// Refuses to publish a package whose `exports` point at files that are not in
// it. `dist/` is gitignored and built, so a publish from a fresh checkout — or
// from a shell that never ran `build:lib` — ships a version that cannot be
// imported, and a version number that cannot be reused. `npm publish` runs this
// through `prepublishOnly`, whoever invokes it.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file an `exports` entry resolves to, as relative paths. */
function exportedFiles(): string[] {
	const { exports = {} } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
	const files: string[] = [];

	const walk = (value: unknown): void => {
		if (typeof value === 'string') files.push(value);
		else if (value && typeof value === 'object') Object.values(value).forEach(walk);
	};

	walk(exports);

	return files;
}

const missing = exportedFiles().filter((file) => {
	if (!file.startsWith('./')) return false;

	try {
		readFileSync(join(ROOT, file));
		return false;
	} catch {
		return true;
	}
});

if (missing.length > 0) {
	console.error('refusing to publish: package.json exports point at missing files');
	for (const file of missing) console.error(`  - ${file}`);
	console.error('run `bun run build:lib` first');
	process.exit(1);
}

console.log('every exported file exists');
