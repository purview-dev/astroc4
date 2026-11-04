import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	GrammarFetchError,
	GrammarRefError,
	grammarSha,
	resolveLikeC4Grammar,
	validateRef,
} from '../source.js';

const mini = readFileSync(new URL('../__fixtures__/mini.langium', import.meta.url), 'utf8');

let cacheDir: string;

beforeEach(async () => {
	cacheDir = await mkdtemp(join(tmpdir(), 'astroc4-grammar-'));
});

/** A `fetch` that answers with `body`, and counts its calls. */
function serving(body: string, init: ResponseInit = {}) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const fetchImpl = vi.fn(async (url: string, requestInit?: RequestInit) => {
		calls.push({ url, init: requestInit });

		return new Response(body, { status: 200, ...init });
	});

	return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const failing = (message = 'getaddrinfo ENOTFOUND raw.githubusercontent.com') =>
	vi.fn(async () => {
		throw new TypeError(message);
	}) as unknown as typeof fetch;

const cacheFiles = () => readdir(cacheDir);

/** A logger that records instead of printing. */
function quiet() {
	return { info: vi.fn(), warn: vi.fn() };
}

describe('resolveLikeC4Grammar', () => {
	it('fetches the Langium grammar, derives it and caches the source', async () => {
		const { fetchImpl, calls } = serving(mini, { headers: { etag: '"abc"' } });

		const source = await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl, logger: quiet() });

		expect(source.meta).toMatchObject({
			repo: 'likec4/likec4',
			ref: 'main',
			source: 'network',
			sha: grammarSha(mini),
		});
		expect(source.grammar).toMatchObject({ scopeName: 'source.likec4', name: 'likec4' });
		expect(calls[0]?.url).toBe(
			'https://raw.githubusercontent.com/likec4/likec4/main/packages/language-server/src/like-c4.langium',
		);

		const [file] = await cacheFiles();
		const cached = JSON.parse(await readFile(join(cacheDir, file!), 'utf8'));

		expect(cached).toMatchObject({ version: 1, ref: 'main', etag: '"abc"', langium: mini });
	});

	it('reuses a fresh cache without touching the network', async () => {
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: serving(mini).fetchImpl, logger: quiet() });

		const offlineFetch = vi.fn();
		const source = await resolveLikeC4Grammar({
			cacheDir,
			env: {},
			fetchImpl: offlineFetch as unknown as typeof fetch,
			logger: quiet(),
		});

		expect(source.meta.source).toBe('cache');
		expect(offlineFetch).not.toHaveBeenCalled();
	});

	it('revalidates with the cached ETag and reuses the body on 304', async () => {
		await resolveLikeC4Grammar({
			cacheDir,
			env: {},
			fetchImpl: serving(mini, { headers: { etag: '"abc"' } }).fetchImpl,
			logger: quiet(),
		});

		const second = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 304 }));
		const source = await resolveLikeC4Grammar({
			cacheDir,
			env: {},
			fetchImpl: second as unknown as typeof fetch,
			refresh: true,
			logger: quiet(),
		});

		expect((second.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ 'if-none-match': '"abc"' });
		expect(source.meta.source).toBe('cache');
	});

	it('reports a ref that does not exist, and never falls back for one', async () => {
		const fetchImpl = vi.fn(async () => new Response('404: Not Found', { status: 404 })) as unknown as typeof fetch;

		await expect(
			resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl, onError: 'warn', logger: quiet() }),
		).rejects.toThrow(GrammarRefError);

		await expect(resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl, logger: quiet() })).rejects.toThrow(
			/has no "main"/,
		);
	});

	it('fails the build when the grammar cannot be fetched', async () => {
		await expect(
			resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: failing(), logger: quiet() }),
		).rejects.toThrow(GrammarFetchError);

		await expect(resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: failing(), logger: quiet() })).rejects.toThrow(
			/offline: true/,
		);
	});

	it('reports an unexpected status', async () => {
		const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;

		await expect(resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl, logger: quiet() })).rejects.toThrow(/503/);
	});

	it('falls back to the cache when the network fails and onError allows it', async () => {
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: serving(mini).fetchImpl, logger: quiet() });

		const logger = quiet();
		const source = await resolveLikeC4Grammar({
			cacheDir,
			env: {},
			fetchImpl: failing(),
			cacheTtl: 0,
			onError: 'warn',
			logger,
		});

		expect(source.meta.source).toBe('cache');
		expect(logger.warn).toHaveBeenCalled();
	});

	it('falls back to the bundled snapshot when there is no cache', async () => {
		const logger = quiet();
		const source = await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: failing(), onError: 'warn', logger });

		expect(source.meta.source).toBe('bundled');
		expect(source.grammar).toMatchObject({ scopeName: 'source.likec4' });
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});

	it('stays quiet with onError: "silent"', async () => {
		const logger = quiet();
		const source = await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: failing(), onError: 'silent', logger });

		expect(source.meta.source).toBe('bundled');
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('rejects a ref that cannot exist before making a request', async () => {
		const fetchImpl = vi.fn() as unknown as typeof fetch;

		await expect(
			resolveLikeC4Grammar({ cacheDir, env: {}, ref: '../../etc', fetchImpl, logger: quiet() }),
		).rejects.toThrow(GrammarRefError);

		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('refetches once the cache is stale, or when told to refresh', async () => {
		const stale = serving(mini);
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: stale.fetchImpl, cacheTtl: 0, logger: quiet() });
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: stale.fetchImpl, cacheTtl: 0, logger: quiet() });

		expect(stale.calls).toHaveLength(2);

		const refreshed = serving(mini);
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: refreshed.fetchImpl, refresh: true, logger: quiet() });

		expect(refreshed.calls).toHaveLength(1);
	});

	it('ignores a cache file it cannot trust', async () => {
		await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: serving(mini).fetchImpl, logger: quiet() });

		const [file] = await cacheFiles();
		await writeFile(join(cacheDir, file!), '{"version":99}', 'utf8');

		const again = serving(mini);
		const source = await resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: again.fetchImpl, logger: quiet() });

		expect(again.calls).toHaveLength(1);
		expect(source.meta.source).toBe('network');
	});

	it('reads ASTROC4_REF and ASTROC4_OFFLINE', async () => {
		const pinned = serving(mini);
		await resolveLikeC4Grammar({
			cacheDir,
			env: { ASTROC4_REF: 'v1.59.4' },
			fetchImpl: pinned.fetchImpl,
			logger: quiet(),
		});

		expect(pinned.calls[0]?.url).toContain('/v1.59.4/');

		const never = vi.fn() as unknown as typeof fetch;
		const source = await resolveLikeC4Grammar({
			cacheDir,
			env: { ASTROC4_OFFLINE: '1' },
			fetchImpl: never,
			logger: quiet(),
		});

		expect(source.meta.source).toBe('bundled');
		expect(never).not.toHaveBeenCalled();
	});

	it('honours repo and baseUrl, for mirrors', async () => {
		const mirror = serving(mini);
		await resolveLikeC4Grammar({
			cacheDir,
			env: {},
			repo: 'acme/likec4',
			baseUrl: 'https://raw.example.test/',
			fetchImpl: mirror.fetchImpl,
			logger: quiet(),
		});

		expect(mirror.calls[0]?.url).toBe(
			'https://raw.example.test/acme/likec4/main/packages/language-server/src/like-c4.langium',
		);
	});

	it('rejects an empty body', async () => {
		await expect(
			resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: serving('   ').fetchImpl, logger: quiet() }),
		).rejects.toThrow(/empty file/);
	});

	it('rejects a body that is not a LikeC4 grammar, even with onError: "warn"', async () => {
		const html = serving('<!doctype html><html></html>');

		await expect(
			resolveLikeC4Grammar({ cacheDir, env: {}, fetchImpl: html.fetchImpl, onError: 'warn', logger: quiet() }),
		).rejects.toThrow(/could not be read/);
	});
});

describe('validateRef', () => {
	it('accepts branches, tags and commit SHAs', () => {
		for (const ref of ['main', 'v1.59.4', 'release/1.x', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0']) {
			expect(validateRef(ref)).toBe(ref);
		}
	});

	it('rejects anything that cannot be a ref', () => {
		for (const ref of ['', '..', '../main', 'main;rm -rf /', '-force', 'a b', 'ref?x=1', 'main/', 'a//b']) {
			expect(() => validateRef(ref), ref).toThrow(GrammarRefError);
		}
	});
});

