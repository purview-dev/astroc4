import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const COMPONENTS = join(import.meta.dirname, '..', 'components');

/** Per-instance values the components set themselves, not theme tokens. */
const INSTANCE_PROPERTIES = new Set(['--likec4-height']);

describe('the --likec4-* token contract', async () => {
	const files = (await readdir(COMPONENTS)).filter((file) => /\.(astro|tsx)$/.test(file));

	it.each(files)('%s reads the public tokens but never declares them', async (file) => {
		const source = await readFile(join(COMPONENTS, file), 'utf8');
		const declared = [...source.matchAll(/(--likec4-[a-z-]+)\s*:/g)]
			.map((match) => match[1]!)
			.filter((name) => !INSTANCE_PROPERTIES.has(name));

		// A declaration on the component's own element would shadow a site's
		// override from an ancestor, and its scoped selector would out-rank one
		// on the same element.
		expect(declared).toEqual([]);
	});
});
