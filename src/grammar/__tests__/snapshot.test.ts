import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseLangium } from '../langium.mjs';
import { grammarSha } from '../source.mjs';
import { buildTmLanguage } from '../textmate.mjs';

const langium = readFileSync(new URL('../like-c4.langium', import.meta.url), 'utf8');
const committed = JSON.parse(readFileSync(new URL('../likec4.tmLanguage.json', import.meta.url), 'utf8'));

describe('the committed grammar snapshot', () => {
	it('is exactly the derivation of the committed Langium snapshot', () => {
		const { repo, ref, sha } = committed.$generated ?? {};

		expect(buildTmLanguage(parseLangium(langium), { repo, ref, sha })).toEqual(committed);
	});

	it('records where it came from', () => {
		expect(committed.$generated).toEqual({
			repo: 'likec4/likec4',
			ref: expect.any(String),
			sha: grammarSha(langium),
			by: 'astroc4/scripts/sync-grammar.mjs',
		});
	});
});
