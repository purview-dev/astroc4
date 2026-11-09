// Turns ```likec4 fences into diagrams: an empty fence with `view=` shows a
// project view, a fence with DSL (or `file=`) is compiled and laid out here, at
// build time, because layout needs LikeC4's WASM graph engine.
//
// A Sätteri mdast plugin, not a remark one: Astro 7's default processor is
// Sätteri, and `remarkPlugins` is silently ignored without
// @astrojs/markdown-remark.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { MdastPluginEntry, PluginFactoryContext } from 'satteri';

import { translations } from './translations.ts';

const require = createRequire(import.meta.url);

// Not imported at module scope: `likec4` pulls in Langium, an LSP and the WASM
// layout engine, and loading that with astro.config made Astro restart on a
// cold start, which killed the content layer.
let likec4ApiPromise: Promise<LikeC4Api> | undefined;

type LikeC4Api = typeof import('likec4').LikeC4;

function loadLikeC4(): Promise<LikeC4Api> {
	// `require`, not `import()`: Vite's SSR module runner intercepts dynamic
	// imports from modules it loaded, and on Windows it can already be tearing
	// down when a page's fence gets here, which crashed `astro build`.
	likec4ApiPromise ??= Promise.resolve(require('likec4').LikeC4);

	return likec4ApiPromise;
}

/**
 * Finishes loading LikeC4 before the first page renders, so the load cannot race
 * the module runner's teardown. Called for builds only.
 */
export function preloadLikeC4(): Promise<LikeC4Api> {
	return loadLikeC4();
}

const FENCE_LANG = 'likec4';

const INLINE_COMPONENT = '__LikeC4Fence';
const PROJECT_COMPONENT = '__LikeC4View';

// Package specifiers: the import is written into the site's page.
const PACKAGE_NAME = '@purview-dev/astroc4';

const IMPORTS = {
	[INLINE_COMPONENT]: `${PACKAGE_NAME}/components/LikeC4Fence.astro`,
	[PROJECT_COMPONENT]: `${PACKAGE_NAME}/components/LikeC4View.astro`,
} as const;

type ComponentName = keyof typeof IMPORTS;

const STRINGS = translations.en;

interface Layout {
	dump: any;
	viewIds: string[];
}

/** Keyed by source: a compile costs ~250ms and dev re-renders a page on every edit. */
const layoutCache = new Map<string, Layout>();

export interface FenceMeta {
	title?: string;
	description?: string;
	height?: string;
	collapsible?: string;
	defaultOpen?: string;
	view?: string;
	project?: string;
	file?: string;
	[key: string]: string | undefined;
}

/** Parse `key="value"` / `key='value'` / `key=value` pairs from the fence's meta string. */
export function parseFenceMeta(meta: string | null | undefined): FenceMeta {
	const options: FenceMeta = {};

	if (!meta) return options;

	const pattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
	let match;

	while ((match = pattern.exec(meta)) !== null) {
		const key = match[1];
		if (!key) continue;

		options[key] = match[2] ?? match[3] ?? match[4] ?? '';
	}

	return options;
}

/** Compile and lay out LikeC4 source; shared by fences and `<LikeC4View file>`. */
export async function layoutSource(source: string): Promise<Layout> {
	const key = createHash('sha256').update(source).digest('hex');
	const cached = layoutCache.get(key);

	if (cached) return cached;

	const LikeC4 = await loadLikeC4();
	const likec4 = await LikeC4.fromSource(source);

	if (likec4.hasErrors()) {
		// First line only: parser errors list every expected token.
		const detail = likec4
			.getErrors()
			.map((error) => String(error.message).split('\n')[0]?.trim() ?? '')
			.slice(0, 3)
			.join('; ');

		throw new Error(detail || 'the snippet could not be parsed');
	}

	const model = await likec4.layoutedModel();
	const dump = JSON.parse(JSON.stringify(model.$data));

	const result: Layout = { dump, viewIds: Object.keys(dump.views ?? {}) };
	layoutCache.set(key, result);

	return result;
}

interface JsxAttribute {
	type: 'mdxJsxAttribute';
	name: string;
	value: string;
}

/** `import <local> from '<source>';` as the MDX compiler expects it. */
function importNode(local: string, source: string) {
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

function attributes(pairs: Record<string, string | undefined>): JsxAttribute[] {
	return Object.entries(pairs)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value: String(value) }));
}

function describe(fileURL: URL | undefined): string {
	if (!fileURL) return 'a content file';

	try {
		return fileURLToPath(fileURL);
	} catch {
		return String(fileURL);
	}
}

export interface FenceReporter {
	warn: (message: string) => void;
}

export interface FenceOptions {
	/** @deprecated Unused since 1.0.0-prerelease.6. */
	reporter?: FenceReporter;
	/** @deprecated Unused since 1.0.0-prerelease.6. */
	mdx?: boolean;
	/** The site root. A fence's `file="…"` must stay inside it; without one, `file=` is refused. */
	root?: string;
	/**
	 * The project names a page may pass as `project`. When given, an empty fence's
	 * `project` is checked at build time; without it, only the browser can.
	 */
	projects?: string[];
}

// region plugin
export function likec4Fences({ root, projects }: FenceOptions = {}): MdastPluginEntry {
	// A factory runs once per document, so `used` is per page.
	return (factory: PluginFactoryContext) => {
		if (!factory.source.includes('```' + FENCE_LANG)) return null;

		// A .md page cannot hold a component, so it gets a placeholder that the
		// injected page script mounts (src/components/md-fences.tsx).
		const markdown = factory.sourceFormat !== 'mdx';
		const used = new Set<ComponentName>();

		return {
			name: 'likec4-fences',

			async code(node, ctx) {
				if (node.lang !== FENCE_LANG) return;

				const where = `${describe(ctx.fileURL)}: \`\`\`${FENCE_LANG} fence`;
				const options = parseFenceMeta(node.meta);
				const source = options.file
					? await readFenceFile(options.file, ctx.fileURL, root, where)
					: (node.value ?? '').trim();

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

					checkProject(options.project, projects, where);

					if (markdown) {
						ctx.replaceNode(node, {
							raw: fencePlaceholder({ ...placeholderOptions(options), viewId: options.view, project: options.project }),
							mdxExpressions: false,
						});

						return;
					}

					used.add(PROJECT_COMPONENT);

					ctx.replaceNode(node, {
						type: 'mdxJsxFlowElement',
						name: PROJECT_COMPONENT,
						attributes: attributes({ ...common, viewId: options.view, project: options.project }),
						children: [],
					});

					return;
				}

				let layout;

				try {
					layout = await layoutSource(source);
				} catch (error) {
					throw new Error(
						`${where} is not valid LikeC4 — ${error instanceof Error ? error.message : String(error)}`,
					);
				}

				const viewId = options.view ?? defaultView(source, layout.viewIds);

				if (!viewId || !layout.viewIds.includes(viewId)) {
					throw new Error(
						`${where} has no view "${viewId ?? '(none)'}". Declared: ${layout.viewIds.join(', ') || '(none)'}.`,
					);
				}

				if (markdown) {
					ctx.replaceNode(node, {
						raw: fencePlaceholder({ ...placeholderOptions(options), viewId, model: layout.dump }),
						mdxExpressions: false,
					});

					return;
				}

				used.add(INLINE_COMPONENT);

				ctx.replaceNode(node, {
					type: 'mdxJsxFlowElement',
					name: INLINE_COMPONENT,
					attributes: attributes({ ...common, viewId, model: JSON.stringify(layout.dump) }),
					children: [],
				});
			},

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

/** The same rule `<LikeC4View>` applies: required with several projects, and must exist. */
function checkProject(project: string | undefined, projects: string[] | undefined, where: string): void {
	if (projects === undefined) return;

	const requested = project?.trim();
	const available = projects.join(', ');

	if (!requested) {
		if (projects.length > 1) {
			throw new Error(`${where}: ${STRINGS['likec4.error.projectRequired'].replace('{available}', available)}`);
		}

		return;
	}

	if (!projects.includes(requested)) {
		throw new Error(
			`${where}: ${STRINGS['likec4.error.unknownProject']
				.replace('{projectId}', requested)
				.replace('{available}', available || '(none)')}`,
		);
	}
}

/**
 * The first `view <id>` the source declares. LikeC4 adds an automatic `index`
 * view and lists it first, so the first laid-out view would be that overview.
 */
function defaultView(source: string, viewIds: string[]): string | undefined {
	// Skips matches that are not laid-out views, such as "a view of …" in a title.
	for (const match of source.matchAll(/(?<![\w-])view\s+([\w-]+)/g)) {
		if (viewIds.includes(match[1]!)) return match[1];
	}

	return viewIds[0];
}

export interface FencePlaceholder {
	viewId: string;
	/** The laid-out model of an inline or `file=` fence; absent for a project view. */
	model?: unknown;
	project?: string;
	title?: string;
	description?: string;
	height?: number;
	collapsible?: boolean;
	defaultOpen?: boolean;
}

/** A theme token with the same fallbacks the Astro components use. */
const token = {
	border: 'var(--likec4-border, var(--sl-color-gray-5, rgba(128, 128, 128, 0.35)))',
	surface: 'var(--likec4-surface, var(--sl-color-bg, transparent))',
	surfaceAlt: 'var(--likec4-surface-alt, var(--sl-color-bg-nav, rgba(128, 128, 128, 0.06)))',
	text: 'var(--likec4-text, var(--sl-color-white, inherit))',
	textMuted: 'var(--likec4-text-muted, var(--sl-color-gray-2, rgba(128, 128, 128, 0.95)))',
};

/**
 * The HTML a .md fence becomes: the shell, and a sized frame carrying the view
 * and model for `md-fences.tsx`. Everything is escaped — titles and model labels
 * are author text.
 */
export function fencePlaceholder({
	viewId,
	model,
	project,
	title = STRINGS['likec4.fence.title'],
	description,
	height = 420,
	collapsible = true,
	defaultOpen = true,
}: FencePlaceholder): string {
	const data = [
		`data-astroc4-fence`,
		`data-view-id="${escapeHtml(viewId)}"`,
		project ? `data-project="${escapeHtml(project)}"` : '',
		model === undefined ? '' : `data-model="${escapeHtml(JSON.stringify(model))}"`,
	]
		.filter(Boolean)
		.join(' ');

	const headerStyle = `display: block; padding: 1em 1.25rem; border-bottom: 1px solid ${token.border}; background: ${token.surface};`;
	const heading = [
		`<h3 style="display: inline; margin: 0; font-size: 1rem; font-weight: 600; color: ${token.text};">${escapeHtml(title)}</h3>`,
		description
			? `<p style="margin: 0.25rem 0 0; font-size: 0.875rem; color: ${token.textMuted};">${escapeHtml(description)}</p>`
			: '',
	].join('');

	const body = [
		`<div style="padding: 1em 1.25rem;">`,
		`<div class="likec4-frame" style="position: relative; width: 100%; height: ${height}px; min-height: ${height}px;">`,
		`<p class="likec4-loading" aria-live="polite" style="color: ${token.textMuted};">${escapeHtml(STRINGS['likec4.fence.loading'])}</p>`,
		`</div>`,
		`</div>`,
	].join('');

	const shell = collapsible
		? `<details${defaultOpen ? ' open' : ''}><summary style="cursor: pointer; ${headerStyle}">${heading}</summary>${body}</details>`
		: `<header style="${headerStyle}">${heading}</header>${body}`;

	return [
		`<section class="not-content likec4-md-fence" ${data} style="margin: 1.5rem 0; overflow: hidden; border: 1px solid ${token.border}; border-radius: 0.75rem; background: ${token.surfaceAlt};">`,
		shell,
		`</section>`,
	].join('');
}

function placeholderOptions(
	options: FenceMeta,
): Pick<FencePlaceholder, 'title' | 'description' | 'height' | 'collapsible' | 'defaultOpen'> {
	const height = Number.parseInt(options.height ?? '', 10);

	return {
		title: options.title || undefined,
		description: options.description || undefined,
		height: Number.isFinite(height) ? height : undefined,
		collapsible: options.collapsible !== 'false',
		defaultOpen: options.defaultOpen !== 'false',
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/**
 * A fence's `file="…"`, relative to its page. Refused outside the site, so a page
 * cannot pull arbitrary files from the build machine.
 */
async function readFenceFile(
	file: string,
	pageURL: URL | undefined,
	root: string | undefined,
	where: string,
): Promise<string> {
	if (!pageURL || !root) {
		throw new Error(`${where} uses file="${file}", which needs the page's location and the site root.`);
	}

	const path = resolve(dirname(fileURLToPath(pageURL)), file);
	const fromRoot = relative(resolve(root), path);

	if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
		throw new Error(`${where} uses file="${file}", which is outside the site (${path}).`);
	}

	try {
		return (await readFile(path, 'utf8')).trim();
	} catch {
		throw new Error(`${where} uses file="${file}", which does not exist (${path}).`);
	}
}

export default likec4Fences;
