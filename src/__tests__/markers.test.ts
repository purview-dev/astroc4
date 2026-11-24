import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { MARKER_CLOSE, MARKER_OPEN, findRepositoryRoot, parseMarkerOptions, resolveMarkerFile } from '../markers.ts';

describe('MARKER_OPEN and MARKER_CLOSE', () => {
	it('matches an opening marker alone on its line, capturing the attributes', () => {
		const match = MARKER_OPEN.exec('<!-- purview:likec4 file="a.c4" view="theLoop" -->');
		expect(match?.[1]).toBe(' file="a.c4" view="theLoop" ');
	});

	it('matches a closing marker alone on its line', () => {
		expect(MARKER_CLOSE.test('<!-- /purview:likec4 -->')).toBe(true);
	});

	it('does not match marker text inside a sentence', () => {
		expect(MARKER_OPEN.test('text <!-- purview:likec4 file="a.c4" --> more')).toBe(false);
		expect(MARKER_CLOSE.test('see <!-- /purview:likec4 --> above')).toBe(false);
	});
});

describe('parseMarkerOptions', () => {
	it('parses double-quoted, single-quoted and bare values', () => {
		expect(parseMarkerOptions('view="theLoop" title=\'The loop\' height=380')).toEqual({
			view: 'theLoop',
			title: 'The loop',
			height: '380',
		});
	});

	it('keeps spaces inside quoted values', () => {
		expect(parseMarkerOptions('title="Build and release"')).toEqual({
			title: 'Build and release',
		});
	});

	it('parses every option the marker spec names', () => {
		expect(
			parseMarkerOptions(
				' file="./docs/diagrams/the-loop.c4" view="theLoop" title="The loop" description="How it flows" height="320" collapsible="false" defaultOpen="false"',
			),
		).toEqual({
			file: './docs/diagrams/the-loop.c4',
			view: 'theLoop',
			title: 'The loop',
			description: 'How it flows',
			height: '320',
			collapsible: 'false',
			defaultOpen: 'false',
		});
	});

	it('ignores tokens that are not key=value', () => {
		expect(parseMarkerOptions('someFlag view="index"')).toEqual({ view: 'index' });
	});
});

describe('resolveMarkerFile', () => {
	const root = resolve('C:\\repo');

	it('resolves a relative path against the page, climbing out of its folder', () => {
		expect(
			resolveMarkerFile('../diagrams/a.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toBe(join(root, 'docs', 'diagrams', 'a.c4'));
	});

	it('resolves a `/`-rooted path against root, not the drive root', () => {
		expect(
			resolveMarkerFile('/docs/a.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toBe(join(root, 'docs', 'a.c4'));
	});

	it('refuses a path that climbs out of the repository', () => {
		expect(() =>
			resolveMarkerFile('../../../etc/x.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toThrow(/outside the repository/);
	});

	it('resolves backslash-separated relative paths the same as forward slashes', () => {
		expect(
			resolveMarkerFile('..\\diagrams\\a.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toBe(join(root, 'docs', 'diagrams', 'a.c4'));
	});

	it('refuses an absolute path on another drive', () => {
		expect(() =>
			resolveMarkerFile('D:\\secrets\\x.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toThrow(/outside the repository/);
	});

	it('refuses a `/`-rooted path that climbs out of root', () => {
		expect(() =>
			resolveMarkerFile('/../outside.c4', pathToFileURL(join(root, 'docs', 'guide', 'x.md')), root),
		).toThrow(/outside the repository/);
	});
});

describe('findRepositoryRoot', () => {
	let tmpRoot: string | undefined;

	afterEach(async () => {
		if (tmpRoot) {
			await rm(tmpRoot, { recursive: true, force: true });
			tmpRoot = undefined;
		}
	});

	it('finds the nearest ancestor holding .git, two levels up', async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), 'astroc4-markers-'));
		await mkdir(join(tmpRoot, '.git'));
		const deep = join(tmpRoot, 'docs', 'guide');
		await mkdir(deep, { recursive: true });

		expect(findRepositoryRoot(deep)).toBe(tmpRoot);
	});

	it('returns the starting folder when no ancestor holds .git', async () => {
		tmpRoot = await mkdtemp(join(tmpdir(), 'astroc4-markers-'));
		const deep = join(tmpRoot, 'docs', 'guide');
		await mkdir(deep, { recursive: true });

		expect(findRepositoryRoot(deep)).toBe(deep);
	});
});
