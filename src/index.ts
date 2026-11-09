// index.ts
// path: src/index.ts
// Starlight plugin that renders LikeC4 architecture diagrams:
//
//   import astroc4 from '@purview-dev/astroc4';
//   starlight({ plugins: [astroc4()] })
//
// It is the Astro integration in `./integration.ts` plus the three things only
// Starlight has:
//   - LikeC4 syntax highlighting, resolved from the live Langium grammar and
//     injected into the site's Expressive Code options (see below);
//   - the component UI strings, through Starlight's i18n system;
//   - Starlight's `config:setup` context, which is where `astroConfig` (the site
//     root) and `addIntegration` live.
//
// Everything a plain Astro site needs is in `./integration.ts`, and
// `@purview-dev/astroc4/integration` exports it.
//
// The highlighting injection is why this is a Starlight plugin and not just an
// integration: Starlight runs plugin `config:setup` hooks *before* it builds
// its Expressive Code integration, and a plugin can `updateConfig` the
// `expressiveCode` option — so the grammar reaches Shiki without the site
// having to create an `ec.config.mjs`. Expressive Code concatenates
// `shiki.langs` when it merges integration options with an `ec.config.mjs`, so
// a site that has one keeps its own languages too. Outside Starlight there is no
// `expressiveCode` option to fill in, which is why a plain Astro site configures
// EC itself with `likec4Language` from `./expressive-code.ts`.

import { fileURLToPath } from 'node:url';

import type { StarlightPlugin, StarlightUserConfig } from '@astrojs/starlight/types';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';

import { likec4Integration, missingOptimizedDependencies, PACKAGE_NAME } from './integration.js';
import type { LikeC4IntegrationOptions } from './integration.js';
import { resolveLikeC4Grammar } from './grammar/source.js';
import { LANGUAGE_ALIASES, LANGUAGE_NAME } from './grammar/textmate.js';
import { translations } from './translations.js';

/**
 * Re-exported for the Starlight entry point's callers and tests: the merge that
 * keeps `react/compiler-runtime` in the site's optimized dependencies is part of
 * both entry points' behaviour, and both are asserted against this function.
 */
export { missingOptimizedDependencies };

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

/**
 * The Starlight plugin's options: the integration's, plus the Starlight-only
 * highlighting injection.
 */
export interface StarlightLikeC4Options extends LikeC4IntegrationOptions {
	/**
	 * Highlight ```c4 / ```likec4 source. Defaults to `true`; `false` leaves
	 * Expressive Code entirely to the site.
	 */
	highlighting?: boolean | LikeC4HighlightingOptions;
}

/** The context Astro hands `astro:config:setup`. */
type ConfigSetupArguments = Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0];

/**
 * The Starlight plugin **and** the Astro integration: one object, two hook sets.
 *
 * Starlight calls `config:setup` and `i18n:setup` on a plugin; Astro calls only
 * `astro:*` hooks on something in `integrations`. Since the sets are disjoint,
 * carrying both is safe — and it is what makes `astro add`'s automatic wiring
 * (`integrations: [astroc4()]`, from the `astro-integration` keyword and the
 * default export) produce a working site.
 */
export type LikeC4StarlightPlugin = StarlightPlugin & Pick<AstroIntegration, 'hooks'>;

export default function starlightLikeC4(options: StarlightLikeC4Options = {}): LikeC4StarlightPlugin {
	// Only the integration's own options: `highlighting` is Starlight's, and is
	// handled below.
	const integration = likec4Integration({
		vitePlugin: options.vitePlugin,
		projects: options.projects,
		fences: options.fences,
	});

	return {
		name: PACKAGE_NAME,
		hooks: {
			// The Astro half. Starlight never calls `astro:*` hooks on a plugin, and
			// Astro only calls the hooks it names — so one object can carry both, and
			// `astro add` (which writes `integrations: [astroc4()]` from the
			// `astro-integration` keyword and the default export) gets a working
			// site instead of a silently inert plugin. See `warnIfMiswired`.
			...integration.hooks,
			'astro:config:setup': async (arguments_: ConfigSetupArguments) => {
				warnIfMiswired(arguments_);

				await integration.hooks['astro:config:setup']?.(arguments_);
			},
			'i18n:setup'({ injectTranslations }) {
				injectTranslations(translations);
			},
			async 'config:setup'({ config, astroConfig, updateConfig, addIntegration, logger }) {
				addIntegration(integration);

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
		// `LikeC4StarlightPlugin` intersects the two protocols; the `astro:*` hooks
		// above are the AstroIntegration half of the same object.
	} as LikeC4StarlightPlugin;
}

/**
 * Warn when this plugin was put in `integrations` on a Starlight site — which is
 * exactly what `astro add @purview-dev/astroc4` writes, because it cannot know
 * the site is Starlight's.
 *
 * The diagrams still work there: `astro:config:setup` installs the Vite plugin
 * and the fence transform. What cannot run is the Starlight half — the
 * translations and the Expressive Code injection — because those are plugin
 * hooks. Saying so beats a diagram that renders in English with no
 * highlighting and no explanation.
 */
function warnIfMiswired({ config, logger }: ConfigSetupArguments): void {
	const starlight = config.integrations.some((integration) => integration.name === '@astrojs/starlight');

	if (!starlight) return;

	logger.warn(
		`${PACKAGE_NAME} is in \`integrations\`, so this Starlight site gets diagrams only. ` +
			'Move astroc4() into `starlight({ plugins: [astroc4()] })` to get the translated UI and LikeC4 syntax highlighting.',
	);
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

