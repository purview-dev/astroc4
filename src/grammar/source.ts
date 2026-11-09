// Runs from `astro:config:setup`, so a bad ref fails dev, build, check and sync
// rather than shipping unhighlighted code. A bad ref always fails; a network
// failure falls back to the cache, then the bundled snapshot, only when
// `onError` allows it.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLangium } from './langium.ts';
import { buildTmLanguage, type TmGrammar } from './textmate.ts';

export const DEFAULT_REPO = 'likec4/likec4';
export const DEFAULT_REF = 'main';
export const LANGIUM_PATH = 'packages/language-server/src/like-c4.langium';
export const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com';

/** Shape of a cache file. Bump when the fields change. */
const CACHE_VERSION = 1;

const BUNDLED_GRAMMAR = new URL('./likec4.tmLanguage.json', import.meta.url);
const BUNDLED_LANGIUM = new URL('./like-c4.langium', import.meta.url);

/** The refs a repository actually has: branches, tags, `a1b2c3d`. */
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export type OnError = 'fail' | 'warn' | 'silent';

export interface GrammarSourceOptions {
	/** Repository to read from. Defaults to likec4/likec4. */
	repo?: string;
	/** Branch, tag or commit SHA. Defaults to `main`. */
	ref?: string;
	/** Use the bundled snapshot, never the network. */
	offline?: boolean;
	/** What to do when the grammar cannot be fetched. */
	onError?: OnError;
	/** Seconds a cached fetch stays fresh. */
	cacheTtl?: number;
	/** Ignore the cache and refetch. */
	refresh?: boolean;
	/** Raw file host, for mirrors and proxies. */
	baseUrl?: string;
	/** Request timeout in milliseconds. */
	timeout?: number;
	/** Site root, for the default cache directory. */
	root?: string;
	cacheDir?: string;
	/** Environment, for `ASTROC4_*` overrides. */
	env?: NodeJS.ProcessEnv;
	logger?: { info?: (message: string) => void; warn?: (message: string) => void };
	/** Injected in tests. */
	fetchImpl?: typeof fetch;
	/** Bundled Langium text, for tests. */
	bundledLangiumPath?: string;
}

export interface GrammarMeta {
	repo: string;
	ref: string;
	source: 'network' | 'cache' | 'bundled';
	fetchedAt: number;
	etag?: string | undefined;
	/** Content hash of the Langium source. */
	sha: string;
	/** Why the bundled snapshot was used. */
	reason?: string;
}

export interface GrammarSource {
	grammar: TmGrammar;
	langium: string;
	meta: GrammarMeta;
}

interface GrammarIdentity {
	repo: string;
	ref: string;
}

/** Raised for a ref this repository cannot have — always a user error. */
export class GrammarRefError extends Error {
	override name = 'GrammarRefError';
}

/** Raised when the grammar could not be fetched, or came back unusable. */
export class GrammarFetchError extends Error {
	override name = 'GrammarFetchError';
}

export async function resolveLikeC4Grammar(options: GrammarSourceOptions = {}): Promise<GrammarSource> {
	const env = options.env ?? process.env;
	const repo = options.repo ?? DEFAULT_REPO;
	const ref = env.ASTROC4_REF || options.ref || DEFAULT_REF;
	const offline = options.offline ?? isTruthy(env.ASTROC4_OFFLINE);
	const onError = options.onError ?? 'fail';
	const logger = options.logger;

	validateRef(ref);

	if (offline) {
		return bundled('offline: true', options);
	}

	const cache = await readCache(options, { repo, ref });

	if (cache?.fresh && !options.refresh) {
		return derive(cache.langium, { repo, ref, source: 'cache', fetchedAt: cache.fetchedAt, etag: cache.etag });
	}

	let fetched;

	try {
		fetched = await fetchLangiumSource({ ...options, repo, ref, etag: cache?.etag });
	} catch (error) {
		if (!(error instanceof Error)) throw error;

		// A bad ref will fail the same way forever: never paper over it.
		if (error instanceof GrammarRefError) throw error;

		if (onError === 'fail') throw error;

		if (onError === 'warn') logger?.warn?.(`[astroc4] ${error.message}`);

		if (cache) {
			if (onError === 'warn') {
				logger?.warn?.(`[astroc4] using the grammar cached at ${new Date(cache.fetchedAt).toISOString()}`);
			}

			return derive(cache.langium, {
				repo,
				ref,
				source: 'cache',
				fetchedAt: cache.fetchedAt,
				etag: cache.etag,
			});
		}

		return bundled(error.message, options);
	}

	if ('notModified' in fetched) {
		if (!cache) {
			throw new GrammarFetchError(
				'the grammar host answered 304 for a grammar that is not cached — retry with `refresh: true`',
			);
		}

		await writeCache(options, { repo, ref }, cache);

		return derive(cache.langium, { repo, ref, source: 'cache', fetchedAt: cache.fetchedAt, etag: cache.etag });
	}

	const result = derive(fetched.text, { repo, ref, source: 'network', etag: fetched.etag });
	await writeCache(options, { repo, ref }, { langium: fetched.text, etag: fetched.etag });

	return result;
}

interface DeriveInfo {
	repo: string;
	ref: string;
	source: 'network' | 'cache' | 'bundled';
	fetchedAt?: number;
	etag?: string | undefined;
}

function derive(langium: string, info: DeriveInfo): GrammarSource {
	let vocabulary;

	try {
		vocabulary = parseLangium(langium);
	} catch (cause) {
		throw new GrammarFetchError(
			`${info.repo}@${info.ref}: the grammar could not be read — ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
	}

	const sha = grammarSha(langium);

	return {
		grammar: buildTmLanguage(vocabulary, { repo: info.repo, ref: info.ref, sha }),
		langium,
		meta: {
			repo: info.repo,
			ref: info.ref,
			source: info.source,
			fetchedAt: info.fetchedAt ?? Date.now(),
			etag: info.etag,
			sha,
		},
	};
}

/**
 * Derived from the committed `like-c4.langium`; its provenance is the
 * snapshot's own, not the ref that was asked for.
 * @param reason Why it is being used, surfaced in logs.
 */
async function bundled(reason: string, options: GrammarSourceOptions): Promise<GrammarSource> {
	const path = options.bundledLangiumPath ?? fileURLToPath(BUNDLED_LANGIUM);
	const snapshot = await bundledProvenance();

	const source = derive(await readFile(path, 'utf8'), {
		repo: snapshot.repo ?? DEFAULT_REPO,
		ref: snapshot.ref ?? DEFAULT_REF,
		source: 'bundled',
	});

	source.meta.reason = reason;

	return source;
}

/** `$generated` from the shipped grammar, so logs name the real snapshot. */
async function bundledProvenance(): Promise<{ repo?: string; ref?: string }> {
	try {
		const { $generated } = JSON.parse(await readFile(fileURLToPath(BUNDLED_GRAMMAR), 'utf8'));

		return { repo: $generated?.repo, ref: $generated?.ref };
	} catch {
		return {};
	}
}

/** Short content hash — the identity that actually changes highlighting. */
export function grammarSha(source: string): string {
	return createHash('sha256').update(source).digest('hex').slice(0, 12);
}

// region refs

export function validateRef(ref: string): string {
	if (typeof ref !== 'string' || ref.length === 0) {
		throw new GrammarRefError('the LikeC4 grammar `ref` must be a branch, tag or commit SHA');
	}

	if (!REF_PATTERN.test(ref) || ref.includes('..') || ref.endsWith('/') || ref.includes('//')) {
		throw new GrammarRefError(
			`"${ref}" is not a usable LikeC4 grammar ref — expected a branch, tag or commit SHA such as "main" or "v1.59.4"`,
		);
	}

	return ref;
}


// endregion

// region fetch

/** What a fetch returns: the text, or the news that the ETag still matches. */
export type FetchResult = { text: string; etag?: string | undefined } | { notModified: true };

export async function fetchLangiumSource(
	options: GrammarSourceOptions & { repo: string; ref: string; etag?: string | undefined },
): Promise<FetchResult> {
	const repo = options.repo;
	const ref = options.ref;
	const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
	const url = `${baseUrl}/${repo}/${ref}/${LANGIUM_PATH}`;
	const timeout = options.timeout ?? 15_000;
	const request = options.fetchImpl ?? fetch;

	const headers: Record<string, string> = { 'user-agent': 'astroc4', accept: 'text/plain' };
	if (options.etag) headers['if-none-match'] = options.etag;

	let response;

	try {
		response = await request(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
	} catch (cause) {
		throw new GrammarFetchError(
			`could not fetch the LikeC4 grammar from ${url} — ${cause instanceof Error ? cause.message : String(cause)}. ` +
				'Builds are strict by default: pass `highlighting: { offline: true }` to use the bundled grammar instead.',
			{ cause },
		);
	}

	if (response.status === 304) return { notModified: true };

	if (response.status === 404) {
		throw new GrammarRefError(
			`${repo} has no "${ref}", or it no longer has ${LANGIUM_PATH} (${url}). ` +
				'Use a tag such as "v1.59.4", a commit SHA, or "main".',
		);
	}

	if (!response.ok) {
		throw new GrammarFetchError(
			`${url} responded ${response.status} ${response.statusText} — set ` +
				'`highlighting: { onError: "warn" }` to fall back to the bundled grammar.',
		);
	}

	const text = await response.text();

	if (text.trim().length === 0) {
		throw new GrammarFetchError(`${url} returned an empty file — the grammar is not usable`);
	}

	return { text, etag: response.headers.get('etag') ?? undefined };
}

// endregion

// region cache

/**
 * Cache location: `node_modules/.cache/astroc4`, which every Astro project
 * already ignores. One file per repo@ref, so switching `ref` never thrashes.
 */
function cachePath(options: GrammarSourceOptions, identity: GrammarIdentity): string {
	const dir =
		options.cacheDir ?? join(options.root ?? process.cwd(), 'node_modules', '.cache', 'astroc4');
	const key = createHash('sha256').update(`${identity.repo}@${identity.ref}`).digest('hex').slice(0, 16);

	return join(dir, `grammar-${key}.json`);
}

type CacheWriteEntry = { langium: string; etag?: string | undefined };
interface CacheEntry extends CacheWriteEntry {
	fetchedAt: number;
}
interface FreshCacheEntry extends CacheEntry {
	fresh: boolean;
}

async function readCache(
	options: GrammarSourceOptions,
	identity: GrammarIdentity,
): Promise<FreshCacheEntry | undefined> {
	let raw;

	try {
		raw = await readFile(cachePath(options, identity), 'utf8');
	} catch {
		return undefined;
	}

	try {
		const entry = JSON.parse(raw);

		if (
			entry?.version !== CACHE_VERSION ||
			entry.repo !== identity.repo ||
			entry.ref !== identity.ref ||
			typeof entry.langium !== 'string' ||
			typeof entry.fetchedAt !== 'number'
		) {
			// Another package version's cache, or a truncated file: refetch.
			return undefined;
		}

		const ttl = options.cacheTtl ?? 3600;

		return { ...entry, fresh: Date.now() - entry.fetchedAt < ttl * 1000 };
	} catch {
		return undefined;
	}
}

/**
 * Best effort: a read-only `node_modules` must not fail a build, it only means
 * the next one has to fetch again.
 */
async function writeCache(
	options: GrammarSourceOptions,
	identity: GrammarIdentity,
	entry: CacheWriteEntry,
): Promise<void> {
	const path = cachePath(options, identity);
	const temporary = `${path}.${process.pid}.tmp`;

	try {
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(
			temporary,
			JSON.stringify({
				version: CACHE_VERSION,
				repo: identity.repo,
				ref: identity.ref,
				etag: entry.etag,
				fetchedAt: Date.now(),
				langium: entry.langium,
			}),
			'utf8',
		);
		// Rename rather than write in place: two Astro processes can resolve the
		// same cache entry at once during `astro check && astro build`.
		await rename(temporary, path);
	} catch (error) {
		options.logger?.warn?.(
			`[astroc4] could not cache the LikeC4 grammar in ${path} — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// endregion

function isTruthy(value: string | undefined): boolean {
	return typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim());
}

export default resolveLikeC4Grammar;

