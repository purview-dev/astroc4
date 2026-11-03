// index.mjs
// path: src/index.mjs
// Starlight plugin that renders LikeC4 architecture diagrams:
//
//   import astroc4 from 'astroc4';
//   starlight({ plugins: [astroc4()] })
//
// It wires up everything a site previously had to configure by hand:
//   - LikeC4VitePlugin, which compiles every .c4 project under the site root
//     into the `likec4:model` / `likec4:icons` / `likec4:projects` modules;
//   - the ```likec4 fence transform (./fences.mjs), appended to the site's
//     Sätteri processor;
//   - the build-time preload that avoids a Windows-only crash (see
//     `preloadLikeC4` in ./fences.mjs);
//   - the component UI strings, through Starlight's i18n system.
//
// Syntax highlighting is separate — Expressive Code options have to live in
// the site's ec.config.mjs, so it is exported from ./expressive-code.mjs.

import { LikeC4VitePlugin } from 'likec4/vite-plugin';

import { likec4Fences, preloadLikeC4 } from './fences.mjs';
import { translations } from './translations.mjs';

const PACKAGE_NAME = 'astroc4';

/** @typedef {import('./index.d.mts').StarlightLikeC4Options} StarlightLikeC4Options */

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
			'config:setup'({ addIntegration }) {
				addIntegration(likec4Integration(options));
			},
		},
	};
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
