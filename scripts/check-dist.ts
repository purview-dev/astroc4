// `dist/` is built, not committed, so a publish that skipped `build:lib` would
// burn a version number on a package that cannot be imported.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
