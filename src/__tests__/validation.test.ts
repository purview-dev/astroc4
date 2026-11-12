import { describe, expect, it } from 'vitest';

import { globToRegExp, validationModeFor, type ValidationScope } from '../validation.ts';

describe('globToRegExp', () => {
	it('matches at any depth, so a bare section name finds a nested page', () => {
		expect(globToRegExp('tutorials/**').test('src/content/docs/tutorials/wip.mdx')).toBe(true);
		expect(globToRegExp('wip.mdx').test('src/content/docs/tutorials/wip.mdx')).toBe(true);
	});

	it('does not let * cross a path segment', () => {
		expect(globToRegExp('tutorials/*.mdx').test('tutorials/wip.mdx')).toBe(true);
		expect(globToRegExp('tutorials/*.mdx').test('tutorials/a/wip.mdx')).toBe(false);
	});

	it('lets ** cross path segments', () => {
		expect(globToRegExp('docs/**/wip.mdx').test('docs/a/b/wip.mdx')).toBe(true);
	});

	it('treats a dot and a plus literally', () => {
		expect(globToRegExp('a+b.mdx').test('a+b.mdx')).toBe(true);
		expect(globToRegExp('a+b.mdx').test('axb.mdx')).toBe(false);
	});

	it('anchors the end, so a folder glob does not match a page inside it', () => {
		expect(globToRegExp('docs').test('docs')).toBe(true);
		expect(globToRegExp('docs').test('docs/wip.mdx')).toBe(false);
	});
});

describe('validationModeFor', () => {
	const page = 'src/content/docs/tutorials/wip.mdx';

	it('is strict by default', () => {
		expect(validationModeFor(undefined, page)).toBe('strict');
		expect(validationModeFor({}, page)).toBe('strict');
	});

	it('takes a single mode for the whole site', () => {
		expect(validationModeFor('relaxed', page)).toBe('relaxed');
		expect(validationModeFor('strict', page)).toBe('strict');
	});

	it('relaxes the pages a glob matches, and leaves the rest at default', () => {
		const options: ValidationScope = { default: 'strict', relaxed: ['tutorials/**'] };

		expect(validationModeFor(options, page)).toBe('relaxed');
		expect(validationModeFor(options, 'src/content/docs/reference/api.mdx')).toBe('strict');
	});

	it('accepts a single pattern as well as a list', () => {
		const options: ValidationScope = { relaxed: 'tutorials/**' };

		expect(validationModeFor(options, page)).toBe('relaxed');
	});

	it('relaxes a whole site set to `default: relaxed`', () => {
		const options: ValidationScope = { default: 'relaxed' };

		expect(validationModeFor(options, page)).toBe('relaxed');
	});

	it('falls back to default when the page path is unknown', () => {
		const options: ValidationScope = { default: 'relaxed', relaxed: ['tutorials/**'] };

		expect(validationModeFor(options, undefined)).toBe('relaxed');
	});

	it('relaxes every page of a listed content collection', () => {
		const options: ValidationScope = { collections: ['tutorials'] };

		expect(validationModeFor(options, 'src/content/tutorials/wip.mdx', 'tutorials')).toBe('relaxed');
		expect(validationModeFor(options, 'src/content/docs/api.mdx', 'docs')).toBe('strict');
	});

	it('takes a single collection name, and matches it without a page path', () => {
		const options: ValidationScope = { collections: 'tutorials' };

		expect(validationModeFor(options, undefined, 'tutorials')).toBe('relaxed');
		expect(validationModeFor(options, undefined, 'docs')).toBe('strict');
	});

	it('relaxes a matching collection even when default stays strict', () => {
		const options: ValidationScope = { default: 'strict', collections: ['tutorials'] };

		expect(validationModeFor(options, 'src/content/tutorials/wip.mdx', 'tutorials')).toBe('relaxed');
	});
});
