// index.mjs
// path: src/index.mjs
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

import { LikeC4VitePlugin } from 'likec4/vite-plugin';

import { likec4Fences, preloadLikeC4 } from './fences.mjs';
import { resolveLikeC4Grammar } from './grammar/source.mjs';
import { LANGUAGE_ALIASES, LANGUAGE_NAME } from './grammar/textmate.mjs';
import { translations } from './translations.mjs';

/**
 * The published package name. Scoped because npm refuses the unscoped
 * `astroc4` — "too similar to existing package astro" — and because the scope
 * makes the specifiers this plugin writes into a site's pages unambiguous.
 */
const PACKAGE_NAME = '@purview-dev/astroc4';

/** @typedef {import('./index.d.mts').StarlightLikeC4Options} StarlightLikeC4Options */
/** @typedef {import('./index.d.mts').LikeC4HighlightingOptions} LikeC4HighlightingOptions */

/**
 * @param {StarlightLikeC4Options} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function starlightLikeC4(options = {}) {
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
					options: options.highlighting ?? {},
				});
			},
		},
	};
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
 *
 * @param {{
 *   root: string,
 *   expressiveCode: unknown,
 *   updateConfig: (config: { expressiveCode?: unknown }) => void,
 *   logger: import('astro').AstroIntegrationLogger,
 *   options: LikeC4HighlightingOptions,
 * }} context
 */
async function injectHighlighting({ root, expressiveCode, updateConfig, logger, options }) {
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

	updateConfig({ expressiveCode: withLikeC4Language(expressiveCode, registration) });

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
 * @param {unknown} expressiveCode The site's `expressiveCode` option.
 * @param {Record<string, unknown>} registration Shiki language registration.
 * @returns {Record<string, unknown> & { shiki: { langs: unknown[] } }}
 */
export function withLikeC4Language(expressiveCode, registration) {
	const current = isObject(expressiveCode) ? expressiveCode : {};
	const shiki = isObject(current.shiki) ? current.shiki : {};
	const langs = Array.isArray(shiki.langs) ? [...shiki.langs] : [];
	const existing = langs.findIndex(isLikeC4Language);

	if (existing === -1) langs.push(registration);
	else langs[existing] = registration;

	return /** @type {Record<string, unknown> & { shiki: { langs: unknown[] } }} */ ({
		...current,
		shiki: { ...shiki, langs },
	});
}

/** A Shiki `langs` entry that already covers LikeC4, as an id or a registration. */
function isLikeC4Language(entry) {
	if (typeof entry === 'string') return entry === LANGUAGE_NAME || LANGUAGE_ALIASES.includes(entry);
	if (!isObject(entry)) return false;

	if (entry.name === LANGUAGE_NAME || entry.scopeName === 'source.likec4') return true;

	return Array.isArray(entry.aliases) && entry.aliases.some((alias) => LANGUAGE_ALIASES.includes(alias));
}

function isObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}


/**
 * @param {StarlightLikeC4Options} options
 * @returns {import('astro').AstroIntegration}
 */
function likec4Integration({ vitePlugin = {}, fences = true }) {
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
async function registerFences(config, updateConfig, logger) {
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
