import { describe, expect, it } from 'vitest';

import { classifyIcon } from '../icon-source';

describe('classifyIcon', () => {
	it('leaves bundled pack ids to the LikeC4 renderer', () => {
		expect(classifyIcon('aws:simple-storage-service')).toEqual({ kind: 'pack' });
		expect(classifyIcon('tech:nginx')).toEqual({ kind: 'pack' });
		expect(classifyIcon(undefined)).toEqual({ kind: 'pack' });
		expect(classifyIcon('  ')).toEqual({ kind: 'pack' });
	});

	it('passes absolute URLs through as images', () => {
		expect(classifyIcon('https://cdn.example.com/logo.svg')).toEqual({
			kind: 'url',
			src: 'https://cdn.example.com/logo.svg',
		});
		expect(classifyIcon('//cdn.example.com/logo.svg')).toEqual({
			kind: 'url',
			src: '//cdn.example.com/logo.svg',
		});
	});

	it('rewrites a compiled public/ path to the URL Astro serves it from', () => {
		expect(classifyIcon('file:///home/me/my-site/public/likec4-icons/logo.svg')).toEqual({
			kind: 'url',
			src: '/likec4-icons/logo.svg',
		});
	});

	it('rewrites a compiled Windows path, percent-encoded drive and all', () => {
		// What the compiler actually emits on Windows.
		const compiled = 'file:///c%3A/Users/me/my-site/public/likec4-icons/logo.svg';

		expect(classifyIcon(compiled)).toEqual({
			kind: 'url',
			src: '/likec4-icons/logo.svg',
		});
	});

	it('rewrites nested public/ paths, keeping the subdirectory', () => {
		expect(classifyIcon('file:///home/ci/repo/public/img/deep/a.png')).toEqual({
			kind: 'url',
			src: '/img/deep/a.png',
		});
	});

	it('flags a local path with no web equivalent rather than guessing', () => {
		const result = classifyIcon('file:///home/ci/repo/src/likec4/images/a.svg');

		expect(result.kind).toBe('unresolvable');
		expect(result).toMatchObject({ path: expect.stringContaining('src/likec4/images/a.svg') });
	});

	it('treats the virtual workspace scheme as local too', () => {
		expect(classifyIcon('virtual:/workspace/images/a.svg').kind).toBe('unresolvable');
	});
});
