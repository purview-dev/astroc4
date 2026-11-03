import { describe, expect, it } from 'vitest';

import { parseFenceMeta } from '../fences.mjs';

describe('parseFenceMeta', () => {
	it('returns nothing for an absent or empty meta string', () => {
		expect(parseFenceMeta(undefined)).toEqual({});
		expect(parseFenceMeta('')).toEqual({});
	});

	it('parses double-quoted, single-quoted and bare values', () => {
		expect(parseFenceMeta('view="requestPath" title=\'Request path\' height=380')).toEqual({
			view: 'requestPath',
			title: 'Request path',
			height: '380',
		});
	});

	it('keeps spaces inside quoted values', () => {
		expect(parseFenceMeta('title="Build and release"')).toEqual({
			title: 'Build and release',
		});
	});

	it('allows an empty quoted value', () => {
		expect(parseFenceMeta('description=""')).toEqual({ description: '' });
	});

	it('ignores tokens that are not key=value', () => {
		expect(parseFenceMeta('someFlag view="index"')).toEqual({ view: 'index' });
	});
});
