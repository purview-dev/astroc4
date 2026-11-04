// index.ts
// path: src/index.ts
// Starlight plugin that renders LikeC4 architecture diagrams:
//
//   import astroc4 from '@purview-dev/astroc4';
//   starlight({ plugins: [astroc4()] })
//
// It wires up everything a site previously had to configure by hand:
//   - LikeC4VitePlugin, which compiles every .c4 project under the site root
//     into the `likec4:model` / `likec4:icons` / `likec4:projects` modules;
//   - the ```likec4 fence transform (./fences.mjs), appended to the site's
//     Sätteri processor;
//   - the build-time preload that avoids a Windows-only crash (see
//     `preloadLikeC4` in ./fences.mjs);
//   - LikeC4 syntax highlighting, resolved from the live Langium grammar and
//     injected into the site's Expressive Code options (see below);
//   - the component UI strings, through Starlight's i18n system.
//
// The highlighting injection is why this is a Starlight plugin and not just an
// integration: Starlight runs plugin `config:setup` hooks *before* it builds
// its Expressive Code integration, and a plugin can `updateConfig` the
// `expressiveCode` option — so the grammar reaches Shiki without the site
// having to create an `ec.config.mjs`. Expressive Code concatenates
// `shiki.langs` when it merges integration options with an `ec.config.mjs`, so
// a site that has one keeps its own languages too.

import { fileURLToPath } from 'node:url';

import type { StarlightPlugin, StarlightUserConfig } from '@astrojs/starlight/types';
import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from 'astro';
import { LikeC4VitePlugin } from 'likec4/vite-plugin';

import { likec4Fences, preloadLikeC4 } from './fences.js';
import { resolveLikeC4Grammar } from './grammar/source.js';
import { LANGUAGE_ALIASES, LANGUAGE_NAME } from './grammar/textmate.js';
import { translations } from './translations.js';

/**
 * The published package name. Scoped because npm refuses the unscoped
 * `astroc4` — "too similar to existing package astro" — and because the scope
 * makes the specifiers this plugin writes into a site's pages unambiguous.
 */
const PACKAGE_NAME = '@purview-dev/astroc4';

/**
 * LikeC4 syntax highlighting, derived from the Langium grammar in
 * `likec4/likec4` and registered with the site's Expressive Code.
 */
export interface LikeC4HighlightingOptions {
	/**
	 * Branch, tag or commit SHA to read `like-c4.langium` from.
	 * Defaults to `main`; pin a tag (`v1.59.4`) or a SHA for reproducible CI.
	 * Also read from `ASTROC4_REF`.
	 */
	ref?: string;
	/** Repository to read from. Defaults to `likec4/likec4`. */
	repo?: string;
	/** Use the bundled snapshot and never touch the network. Also `ASTROC4_OFFLINE=1`. */
	offline?: boolean;
	/**
	 * What to do when the grammar cannot be fetched. Defaults to `fail`, so
	 * `astro build` and `astro check` fail like any other build error.
	 * A `ref` that does not exist always fails.
	 */
	onError?: 'fail' | 'warn' | 'silent';
	/** Seconds a cached fetch stays fresh. Defaults to an hour. */
	cacheTtl?: number;
	/** Ignore the cache and refetch. */
	refresh?: boolean;
	/** Where to cache. Defaults to `node_modules/.cache/astroc4`. */
	cacheDir?: string;
	/** Raw host to read from, for mirrors. Defaults to raw.githubusercontent.com. */
	baseUrl?: string;
	/** Request timeout in milliseconds. Defaults to 15000. */
	timeout?: number;
}

export interface StarlightLikeC4Options {
	/**
	 * Passed through to `LikeC4VitePlugin` — e.g. `{ workspace: 'diagrams' }` to
	 * look for .c4 files somewhere other than the site root.
	 */
	vitePlugin?: Parameters<typeof LikeC4VitePlugin>[0];
	/** Render ```likec4 fences in .mdx pages as diagrams. Defaults to `true`. */
	fences?: boolean;
	/**
	 * Highlight ```c4 / ```likec4 source. Defaults to `true`; `false` leaves
	 * Expressive Code entirely to the site.
	 */
	highlighting?: boolean | LikeC4HighlightingOptions;
}

export default function starlightLikeC4(options: StarlightLikeC4Options = {}): StarlightPlugin {
	return {
		name: PACKAGE_NAME,
		hooks: {
			'i18n:setup'({ injectTranslations }) {
				injectTranslations(translations);
			},
			async 'config:setup'({ config, astroConfig, updateConfig, addIntegration, logger }) {
				addIntegration(likec4Integration(options));

				if (options.highlighting === false) return;

				await injectHighlighting({
					// `config` is the Starlight config, `astroConfig` the Astro one:
					// the site root and the cache directory live on the latter.
					root: fileURLToPath(astroConfig.root),
					expressiveCode: config.expressiveCode,
					updateConfig,
					logger,
					// `true` means "on with defaults"; only an object carries options.
					options: typeof options.highlighting === 'object' ? options.highlighting : {},
				});
			},
		},
	};
}

/** What Starlight's `config:setup` hook offers, narrowed to what is used here. */
type StarlightConfigUpdate = Partial<Omit<StarlightUserConfig, 'routeMiddleware'>>;

/** Everything `injectHighlighting` needs, assembled by the hook below. */
interface HighlightingContext {
	root: string;
	expressiveCode: unknown;
	updateConfig: (config: StarlightConfigUpdate) => void;
	logger: AstroIntegrationLogger;
	options: LikeC4HighlightingOptions;
}

/**
 * Register the LikeC4 grammar with whatever Expressive Code the site ends up
 * with.
 *
 * This is deliberately not wrapped in a try/catch: a ref that does not exist,
 * or a grammar that cannot be read, fails `astro dev`, `astro build`,
 * `astro check` and `astro sync` exactly like any other build error. Sites that
 * cannot reach github.com on every build opt out with `offline: true` or
 * `onError: 'warn'`.
 */
async function injectHighlighting({
	root,
	expressiveCode,
	updateConfig,
	logger,
	options,
}: HighlightingContext) {
	if (expressiveCode === false) {
		logger.warn(
			'LikeC4 syntax highlighting is skipped: `expressiveCode: false` disables the code blocks it ' +
				'would highlight. Diagrams are unaffected.',
		);
		return;
	}

	const source = await resolveLikeC4Grammar({ root, ...options, logger });

	const registration = {
		...source.grammar,
		name: LANGUAGE_NAME,
		aliases: [...LANGUAGE_ALIASES],
	};

	updateConfig({
		// `withLikeC4Language` keeps the option's shape generic so it stays usable
		// outside Starlight; every field it returns is one Expressive Code accepts.
		expressiveCode: withLikeC4Language(expressiveCode, registration) as StarlightConfigUpdate['expressiveCode'],
	});

	const { repo, ref, sha, source: from } = source.meta;
	logger.info(
		`LikeC4 grammar ${repo}@${ref} (${sha})${from === 'network' ? '' : ` from ${from}`} — ` +
			'highlighting ```c4 and ```likec4 fences',
	);
}

/**
 * Add the LikeC4 language to a site's Expressive Code options without
 * disturbing anything already set.
 *
 * Replacing an existing entry rather than appending matters: a site that
 * pinned `likec4Language` from `@purview-dev/astroc4/expressive-code` should get the
 * grammar for the ref it configured here, not two grammars for the same scope.
 * Expressive Code concatenates `shiki.langs` when it merges these options with
 * an `ec.config.mjs`, so a site's own languages survive either way.
 *
 * @param expressiveCode The site's `expressiveCode` option.
 * @param registration Shiki language registration.
 */
export function withLikeC4Language(
	expressiveCode: unknown,
	registration: Record<string, unknown>,
): Record<string, unknown> & { shiki: { langs: unknown[] } } {
	const current = isObject(expressiveCode) ? expressiveCode : {};
	const shiki = isObject(current.shiki) ? current.shiki : {};
	const langs: unknown[] = Array.isArray(shiki.langs) ? [...shiki.langs] : [];
	const existing = langs.findIndex(isLikeC4Language);

	if (existing === -1) langs.push(registration);
	else langs[existing] = registration;

	return { ...current, shiki: { ...shiki, langs } };
}

/** A Shiki `langs` entry that already covers LikeC4, as an id or a registration. */
function isLikeC4Language(entry: unknown): boolean {
	if (typeof entry === 'string') return entry === LANGUAGE_NAME || LANGUAGE_ALIASES.includes(entry);
	if (!isObject(entry)) return false;

	if (entry.name === LANGUAGE_NAME || entry.scopeName === 'source.likec4') return true;

	return Array.isArray(entry.aliases) && entry.aliases.some((alias) => LANGUAGE_ALIASES.includes(alias));
}

function isObject(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function likec4Integration({ vitePlugin = {}, fences = true }: StarlightLikeC4Options): AstroIntegration {
	return {
		name: `${PACKAGE_NAME}/integration`,
		hooks: {
			'astro:config:setup': async ({ command, config, updateConfig, logger }) => {
				updateConfig({
					vite: {
						plugins: [LikeC4VitePlugin(vitePlugin)],
						// The components ship as .astro/.tsx source, so Vite has to
						// transform them rather than hand them to Node as-is.
						ssr: { noExternal: [PACKAGE_NAME] },
					},
				});

				if (fences) {
					await registerFences(config, updateConfig, logger);
				}

				// `command` is only available here, not in `astro:config:done` — and
				// this must stay build-only; see `loadLikeC4` in ./fences.mjs.
				if (command === 'build') {
					await preloadLikeC4();
				}
			},
		},
	};
}

/**
 * Append the fence transform to the site's existing Sätteri processor, keeping
 * whatever Starlight and other integrations already registered on it.
 */
async function registerFences(
	config: AstroConfig,
	updateConfig: (config: Record<string, unknown>) => void,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const { satteri, isSatteriProcessor } = await import('@astrojs/markdown-satteri');
	const existing = config.markdown?.processor;

	// No processor configured means Astro's default, which is Sätteri.
	if (existing === undefined) {
		updateConfig({ markdown: { processor: satteri({ mdastPlugins: [likec4Fences()] }) } });
		return;
	}

	if (!isSatteriProcessor(existing)) {
		logger.warn(
			'```likec4 fences are disabled: the site is not using the Sätteri Markdown processor. ' +
				'<LikeC4View /> still works.',
		);
		return;
	}

	const existingOptions = existing.options ?? {};

	updateConfig({
		markdown: {
			processor: satteri({
				...existingOptions,
				mdastPlugins: [...(existingOptions.mdastPlugins ?? []), likec4Fences()],
			}),
		},
	});
}
