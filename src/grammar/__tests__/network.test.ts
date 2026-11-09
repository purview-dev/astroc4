// Opt-in, so the unit suite stays hermetic:
//
//   bun run test:network          (or: ASTROC4_NETWORK=1 bun run test)

import { describe, expect, it } from 'vitest';

import { parseLangium } from '../langium.ts';
import { fetchLangiumSource } from '../source.ts';

const enabled = process.env.ASTROC4_NETWORK === '1';

const read = async (ref: string) => {
	const source = await fetchLangiumSource({ repo: 'likec4/likec4', ref });

	if ('notModified' in source) throw new Error(`unexpected 304 for ${ref}`);

	return parseLangium(source.text);
};

describe.skipIf(!enabled)('the live Langium grammar', () => {
	it('is where source.ts looks for it, on main', async () => {
		const vocabulary = await read('main');

		expect(vocabulary.ruleCount).toBeGreaterThan(100);
		expect(vocabulary.blocks).toEqual(expect.arrayContaining(['specification', 'model', 'views']));
		expect(vocabulary.properties).toEqual(expect.arrayContaining(['title', 'technology', 'link']));
	});

	it('changes with the ref that was asked for', async () => {
		const [main, tag] = await Promise.all([read('main'), read('v1.59.4')]);

		expect(main.enums.ElementShape).toContain('agent');
		expect(tag.enums.ElementShape).not.toContain('agent');
	});
});
