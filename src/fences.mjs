// fences.mjs
// path: src/fences.mjs
// Turns a ```likec4 code fence into a rendered diagram instead of a code block.
//
// Two forms:
//
//   ```likec4 view="requestPath" title="Request path"
//   ```
//     -> renders a view from the site's LikeC4 project (any likec4.config.json).
//
//   ```likec4 title="Example"
//   specification { element system }
//   model { a = system 'A'  b = system 'B'  a -> b }
//   views { view index { include * } }
//   ```
//     -> compiles and lays out this snippet at build time, then renders it.
//
// Layout needs LikeC4's WASM graph engine, so it has to happen during the
// build; the browser only rehydrates the resulting JSON.
//
// This is a Sätteri mdast plugin, not a remark one. Astro 7 made Sätteri the
// default Markdown processor, and `remarkPlugins` is a legacy option that is
// silently ignored unless @astrojs/markdown-remark is installed. The plugin's
// integration (src/index.mjs) registers it; sites do not add it themselves.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// `likec4`'s Node API is deliberately NOT imported at module scope. It pulls in
// Langium, chevrotain, an LSP and the WASM layout engine, and this module is
// loaded as part of the site's astro.config.mjs — on a cold start that was
// enough to make Astro report "Configuration file updated. Restarting...", and the restart
// killed the content-layer transport, leaving every page a 500. Load it lazily
// so the cost is paid only when a page actually contains an inline fence.
let likec4ApiPromise;

function loadLikeC4() {
	// A plain `require('likec4')` rather than `import('likec4')`: Vite's SSR
	// module runner intercepts dynamic `import()` from any module it loaded
	// (this one included) to route it through the runner's own module graph —
	// and on Windows that runner can already be mid-teardown by the time a
	// page's ```likec4 fence triggers this, crashing the whole `astro build`
	// (see `preloadLikeC4` below). `require()` goes through Node's own
	// resolver instead, which Node 22+ supports for ESM-only packages like
	// this one, sidestepping the runner entirely.
	likec4ApiPromise ??= Promise.resolve(require('likec4').LikeC4);

	return likec4ApiPromise;
}

/**
 * Kick off (and await) the same lazy load `loadLikeC4()` uses, so a later
 * call inside Satteri's processing reuses the already-resolved promise
 * instead of issuing a fresh `import('likec4')`.
 *
 * `astro build` on Windows crashes mid-build ("Vite module runner has been
 * closed", followed by a native libuv assertion that kills the process) if
 * that first `import('likec4')` happens while Vite is tearing down the SSR
 * module runner used for the content layer — which is exactly when the first
 * page containing a ```likec4 fence is rendered. Finishing the import before
 * that point removes the race. src/index.mjs calls this from
 * `astro:config:setup` for builds only — the module-scope comment above
 * `loadLikeC4` explains why eager-loading it in dev is unsafe.
 */
export function preloadLikeC4() {
	return loadLikeC4();
}

const FENCE_LANG = 'likec4';

/** Component the fence is rewritten into, per form. */
const INLINE_COMPONENT = '__LikeC4Fence';
const PROJECT_COMPONENT = '__LikeC4View';

// Package specifiers, not relative paths: the import is written into the page
// being compiled, so it has to resolve from the site, not from this file.
/** The published package name; see the comment on `PACKAGE_NAME` in index.mjs. */
const PACKAGE_NAME = '@purview-dev/astroc4';

const IMPORTS = {
	[INLINE_COMPONENT]: `${PACKAGE_NAME}/components/LikeC4Fence.astro`,
	[PROJECT_COMPONENT]: `${PACKAGE_NAME}/components/LikeC4View.astro`,
};

/**
 * Compiling a snippet costs ~250ms (a Langium workspace per call) and the same
 * page is re-rendered on every dev edit, so key on the source: a build pays
 * that once per distinct snippet, not once per render.
 */
const layoutCache = new Map();

/** Parse `key="value"` / `key=value` pairs from the fence's meta string. */
export function parseFenceMeta(meta) {
	const options = {};

	if (!meta) return options;

	const pattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
	let match;

	while ((match = pattern.exec(meta)) !== null) {
		options[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
	}

	return options;
}

async function layoutSnippet(source) {
	const key = createHash('sha256').update(source).digest('hex');
	const cached = layoutCache.get(key);

	if (cached) return cached;

	const LikeC4 = await loadLikeC4();
	const likec4 = await LikeC4.fromSource(source);

	if (likec4.hasErrors()) {
		// Only the first line of each error — LikeC4's parser errors enumerate
		// every token it expected, which runs to hundreds of lines.
		const detail = likec4
			.getErrors()
			.map((error) => String(error.message).split('\n')[0].trim())
			.slice(0, 3)
			.join('; ');

		throw new Error(detail || 'the snippet could not be parsed');
	}

	const model = await likec4.layoutedModel();
	// `$data` is the plain serialisable model; `$model` is its deprecated alias.
	const dump = JSON.parse(JSON.stringify(model.$data));

	const result = { dump, viewIds: Object.keys(dump.views ?? {}) };
	layoutCache.set(key, result);

	return result;
}

/** ESTree for `import <local> from '<source>';`, as the MDX compiler expects. */
function importNode(local, source) {
	return {
		type: 'mdxjsEsm',
		value: `import ${local} from ${JSON.stringify(source)};`,
		data: {
			estree: {
				type: 'Program',
				sourceType: 'module',
				body: [
					{
						type: 'ImportDeclaration',
						specifiers: [
							{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: local } },
						],
						source: { type: 'Literal', value: source, raw: JSON.stringify(source) },
						attributes: [],
					},
				],
			},
		},
	};
}

function attributes(pairs) {
	return Object.entries(pairs)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value: String(value) }));
}

function describe(fileURL) {
	if (!fileURL) return 'a content file';

	try {
		return fileURLToPath(fileURL);
	} catch {
		return String(fileURL);
	}
}

// region plugin
/**
 * @returns {import('satteri').MdastPluginEntry}
 */
export function likec4Fences() {
	// A factory runs once per document, so `used` is safely per-file.
	return (factory) => {
		// Astro only supports components in .mdx. Leaving the fence as a code
		// block is the graceful outcome, but say so — a silent code block where
		// a diagram was intended is easy to miss in review.
		if (factory.sourceFormat !== 'mdx') {
			if (!factory.source.includes('```' + FENCE_LANG)) return null;

			return {
				name: 'likec4-fences:warn',
				code(node, ctx) {
					if (node.lang !== FENCE_LANG) return;

					console.warn(
						`[likec4-fences] ${describe(ctx.fileURL)} has a \`\`\`${FENCE_LANG} fence, but fences only ` +
							'render as diagrams in .mdx files. Rename the page to .mdx, or use <LikeC4View /> directly.',
					);
				},
			};
		}

		if (!factory.source.includes('```' + FENCE_LANG)) return null;

		const used = new Set();

		return {
			name: 'likec4-fences',

			async code(node, ctx) {
				if (node.lang !== FENCE_LANG) return;

				const where = `${describe(ctx.fileURL)}: \`\`\`${FENCE_LANG} fence`;
				const options = parseFenceMeta(node.meta);
				const source = (node.value ?? '').trim();

				const common = {
					title: options.title,
					description: options.description,
					height: options.height,
					collapsible: options.collapsible,
					defaultOpen: options.defaultOpen,
				};

				if (source.length === 0) {
					if (!options.view) {
						throw new Error(`${where} is empty, so it needs \`view="<id>"\` to name a view in the project model.`);
					}

					used.add(PROJECT_COMPONENT);

					ctx.replaceNode(node, {
						type: 'mdxJsxFlowElement',
						name: PROJECT_COMPONENT,
						attributes: attributes({ ...common, viewId: options.view }),
						children: [],
					});

					return;
				}

				let layout;

				try {
					layout = await layoutSnippet(source);
				} catch (error) {
					throw new Error(`${where} is not valid LikeC4 — ${error.message}`);
				}

				const viewId = options.view ?? layout.viewIds[0];

				if (!viewId || !layout.viewIds.includes(viewId)) {
					throw new Error(
						`${where} has no view "${viewId ?? '(none)'}". Declared: ${layout.viewIds.join(', ') || '(none)'}.`,
					);
				}

				used.add(INLINE_COMPONENT);

				ctx.replaceNode(node, {
					type: 'mdxJsxFlowElement',
					name: INLINE_COMPONENT,
					attributes: attributes({ ...common, viewId, model: JSON.stringify(layout.dump) }),
					children: [],
				});
			},

			// Imports go in once, after every fence on the page is known.
			after(root, ctx) {
				if (used.size === 0) return;

				ctx.insertChildAt(
					root,
					0,
					[...used].map((local) => importNode(local, IMPORTS[local])),
				);
			},
		};
	};
}
// endregion

export default likec4Fences;
