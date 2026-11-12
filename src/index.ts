// The Starlight plugin: the integration in ./integration.ts plus what only
// Starlight has — the UI strings (`i18n:setup`) and the `expressiveCode`
// option. Starlight runs plugin `config:setup` hooks before it builds its
// Expressive Code integration, which is what lets the grammar reach Shiki
// without an `ec.config.mjs`.

import { fileURLToPath } from 'node:url';

import type { StarlightPlugin, StarlightUserConfig } from '@astrojs/starlight/types';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';

import { likec4Integration, missingOptimizedDependencies, PACKAGE_NAME } from './integration.ts';
import type { LikeC4IntegrationOptions } from './integration.ts';
import { resolveLikeC4Grammar } from './grammar/source.ts';
import { LANGUAGE_ALIASES, LANGUAGE_NAME } from './grammar/textmate.ts';
import { translations } from './translations.ts';

export { missingOptimizedDependencies };
export type { ValidationMode, ValidationOptions, ValidationScope } from './validation.ts';

export interface LikeC4HighlightingOptions {
	/** Branch, tag or commit SHA of `likec4/likec4`. Defaults to `main`; also `ASTROC4_REF`. */
	ref?: string;
	/** Defaults to `likec4/likec4`. */
	repo?: string;
	/** Use the bundled snapshot and never touch the network. Also `ASTROC4_OFFLINE=1`. */
	offline?: boolean;
	/** When the grammar cannot be fetched. Defaults to `fail`; a `ref` that does not exist always fails. */
	onError?: 'fail' | 'warn' | 'silent';
	/** Seconds a cached fetch stays fresh. Defaults to 3600. */
	cacheTtl?: number;
	/** Ignore the cache and refetch. */
	refresh?: boolean;
	/** Defaults to `node_modules/.cache/astroc4`. */
	cacheDir?: string;
	/** Raw host to read from. Defaults to `https://raw.githubusercontent.com`. */
	baseUrl?: string;
	/** Request timeout in milliseconds. Defaults to 15000. */
	timeout?: number;
}

export interface StarlightLikeC4Options extends LikeC4IntegrationOptions {
	/** Highlight ```c4 / ```likec4 source. Defaults to `true`; `false` leaves Expressive Code to the site. */
	highlighting?: boolean | LikeC4HighlightingOptions;
}

type ConfigSetupArguments = Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0];

/**
 * A Starlight plugin and an Astro integration in one object. The hook sets are
 * disjoint, so `astro add`'s `integrations: [astroc4()]` works too.
 */
export type LikeC4StarlightPlugin = StarlightPlugin & Pick<AstroIntegration, 'hooks'>;

export default function starlightLikeC4(options: StarlightLikeC4Options = {}): LikeC4StarlightPlugin {
	const integration = likec4Integration({
		vitePlugin: options.vitePlugin,
		projects: options.projects,
		fences: options.fences,
		validation: options.validation,
	});

	return {
		name: PACKAGE_NAME,
		hooks: {
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
					// `config` is Starlight's; the site root is on the Astro config.
					root: fileURLToPath(astroConfig.root),
					expressiveCode: config.expressiveCode,
					updateConfig,
					logger,
					options: typeof options.highlighting === 'object' ? options.highlighting : {},
				});
			},
		},
	} as LikeC4StarlightPlugin;
}

/**
 * `astro:config:setup` only runs when the plugin is in `integrations` — which on
 * a Starlight site means the translations and highlighting cannot run.
 */
function warnIfMiswired({ config, logger }: ConfigSetupArguments): void {
	const starlight = config.integrations.some((integration) => integration.name === '@astrojs/starlight');

	if (!starlight) return;

	logger.warn(
		`${PACKAGE_NAME} is in \`integrations\`, so this Starlight site gets diagrams only. ` +
			'Move astroc4() into `starlight({ plugins: [astroc4()] })` to get the translated UI and LikeC4 syntax highlighting.',
	);
}

type StarlightConfigUpdate = Partial<Omit<StarlightUserConfig, 'routeMiddleware'>>;

interface HighlightingContext {
	root: string;
	expressiveCode: unknown;
	updateConfig: (config: StarlightConfigUpdate) => void;
	logger: AstroIntegrationLogger;
	options: LikeC4HighlightingOptions;
}

/**
 * Not wrapped in a try/catch on purpose: a bad ref or an unreadable grammar
 * fails `dev`, `build`, `check` and `sync` like any build error. `offline` and
 * `onError` are the opt-outs.
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
		expressiveCode: withLikeC4Language(expressiveCode, registration) as StarlightConfigUpdate['expressiveCode'],
	});

	const { repo, ref, sha, source: from } = source.meta;
	logger.info(
		`LikeC4 grammar ${repo}@${ref} (${sha})${from === 'network' ? '' : ` from ${from}`} — ` +
			'highlighting ```c4 and ```likec4 fences',
	);
}

/**
 * The site's Expressive Code options plus the LikeC4 language. Starlight's
 * `updateConfig` merges shallowly, so existing options are carried over; an
 * existing LikeC4 entry is replaced so the configured ref wins.
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

function isLikeC4Language(entry: unknown): boolean {
	if (typeof entry === 'string') return entry === LANGUAGE_NAME || LANGUAGE_ALIASES.includes(entry);
	if (!isObject(entry)) return false;

	if (entry.name === LANGUAGE_NAME || entry.scopeName === 'source.likec4') return true;

	return Array.isArray(entry.aliases) && entry.aliases.some((alias) => LANGUAGE_ALIASES.includes(alias));
}

function isObject(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
