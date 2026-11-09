import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { fencePlaceholder, likec4Fences, parseFenceMeta } from '../fences.js';

/** Undo the HTML attribute escaping a browser would undo when reading `dataset`. */
const decodeAttribute = (value: string) =>
	value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

describe('parseFenceMeta', () => {
	it('returns nothing for an absent or empty meta string', () => {
		expect(parseFenceMeta(undefined)).toEqual({});
		expect(parseFenceMeta('')).toEqual({});
	});

	it('parses double-quoted, single-quoted and bare values', () => {
		expect(parseFenceMeta('view="requestPath" title=\'Request path\' height=380')).toEqual({
			view: 'requestPath',
			title: 'Request path',
			height: '380',
		});
	});

	it('keeps spaces inside quoted values', () => {
		expect(parseFenceMeta('title="Build and release"')).toEqual({
			title: 'Build and release',
		});
	});

	it('allows an empty quoted value', () => {
		expect(parseFenceMeta('description=""')).toEqual({ description: '' });
	});

	it('ignores tokens that are not key=value', () => {
		expect(parseFenceMeta('someFlag view="index"')).toEqual({ view: 'index' });
	});
});

/** A page and the mdast context the plugin sees. */
function page(source: string, sourceFormat: 'mdx' | 'md' = 'mdx') {
	const replaced: { node: unknown; next: unknown }[] = [];
	const inserted: { nodes: unknown[] }[] = [];

	const ctx = {
		fileURL: new URL('file:///site/src/content/docs/page.mdx'),
		replaceNode(node: unknown, next: unknown) {
			replaced.push({ node, next });
		},
		insertChildAt(_root: unknown, _index: number, nodes: unknown[]) {
			inserted.push({ nodes });
		},
	};

	return { ctx, inserted, replaced, factory: { source, sourceFormat } };
}

/** The mdast plugin the fence transform returns, narrowed for the tests. */
type FencePlugin = {
	name?: string;
	code?: (node: { lang?: string; meta?: string; value?: string }, ctx: unknown) => Promise<void> | void;
	after?: (root: unknown, ctx: unknown) => void;
};

/** `likec4Fences()` is typed by Sätteri as a union; the tests only need a call. */
const fencePlugin = likec4Fences() as unknown as (factory: {
	source: string;
	sourceFormat: string;
}) => FencePlugin;

const pluginFor = (
	source: string,
	sourceFormat: 'mdx' | 'md' = 'mdx',
	build: (factory: { source: string; sourceFormat: string }) => FencePlugin = fencePlugin,
) => {
	const page_ = page(source, sourceFormat);

	return { ...page_, plugin: build(page_.factory) };
};

const fence = (meta: string, value = '') => ({ type: 'code', lang: 'likec4', meta, value });

describe('the ```likec4 fence transform', () => {
	it('stays out of the way when the page has no fence', () => {
		expect(fencePlugin(page('just prose').factory)).toBeNull();
		expect(fencePlugin(page('```ts\nconst a = 1\n```').factory)).toBeNull();
	});

	it('renders a .md fence as a placeholder the page script mounts, with its laid-out model', async () => {
		const snippet = "specification { element box }\nmodel { a = box 'A' }\nviews { view flow { include * } }";
		const { ctx, plugin, replaced } = pluginFor('```likec4 view="flow" height=360\n' + snippet + '\n```', 'md');

		await plugin.code?.(fence('view="flow" height=360', snippet), ctx);

		const html = (replaced[0]?.next as { raw: string; mdxExpressions: boolean }).raw;
		expect((replaced[0]?.next as { mdxExpressions: boolean }).mdxExpressions).toBe(false);
		expect(html).toContain('data-astroc4-fence');
		expect(html).toContain('data-view-id="flow"');
		expect(html).toContain('class="likec4-frame"');
		expect(html).toContain('height: 360px');
		const model = JSON.parse(decodeAttribute(/data-model="([^"]*)"/.exec(html)![1]!));
		expect(Object.keys(model.views)).toContain('flow');
	});

	it('renders an empty .md fence as a project-view placeholder', async () => {
		const { ctx, plugin, replaced } = pluginFor('```likec4 view="index" project="architecture"\n```', 'md');

		await plugin.code?.(fence('view="index" project="architecture"'), ctx);

		const html = (replaced[0]?.next as { raw: string }).raw;
		expect(html).toContain('data-view-id="index"');
		expect(html).toContain('data-project="architecture"');
		expect(html).not.toContain('data-model');
	});

	it('fails an invalid .md fence the same way as an .mdx one', async () => {
		const { ctx, plugin } = pluginFor('```likec4\nmodel { a = }\n```', 'md');

		await expect(Promise.resolve(plugin.code?.(fence('', 'model { a = }'), ctx))).rejects.toThrow(/not valid LikeC4/);
	});

	it('escapes everything it writes into the placeholder', () => {
		const html = fencePlaceholder({
			viewId: 'v"1',
			title: '<script>alert(1)</script>',
			model: { label: `it's "quoted" & <tagged>` },
			height: 420,
		});

		expect(html).not.toContain('<script>');
		expect(html).toContain('data-view-id="v&quot;1"');
		expect(JSON.parse(decodeAttribute(/data-model="([^"]*)"/.exec(html)![1]!))).toEqual({
			label: `it's "quoted" & <tagged>`,
		});
	});

	it('ignores fences in other languages', async () => {
		const { ctx, plugin, replaced } = pluginFor('```likec4\nmodel { }\n```');

		await plugin.code?.({ lang: 'ts', meta: '', value: 'const a = 1' }, ctx);

		expect(replaced).toHaveLength(0);
	});

	it('asks for a view when the fence is empty', async () => {
		const { ctx, plugin } = pluginFor('```likec4\n```');

		await expect(Promise.resolve(plugin.code?.(fence(''), ctx))).rejects.toThrow(/needs `view="<id>"`/);
	});

	it('rewrites an empty fence into the project view component', async () => {
		const { ctx, plugin, inserted, replaced } = pluginFor('```likec4 view="pageLoad" height=360\n```');

		await plugin.code?.(fence('view="pageLoad" height=360'), ctx);

		expect(replaced).toHaveLength(1);
		expect(replaced[0]?.next).toMatchObject({
			type: 'mdxJsxFlowElement',
			name: '__LikeC4View',
			attributes: [
				{ name: 'height', value: '360' },
				{ name: 'viewId', value: 'pageLoad' },
			],
		});

		plugin.after?.({ type: 'root', children: [] }, ctx);

		expect(inserted).toHaveLength(1);
		expect(inserted[0]?.nodes).toHaveLength(1);
		expect(JSON.stringify(inserted[0]?.nodes)).toContain('@purview-dev/astroc4/components/LikeC4View.astro');
	});

	it('passes project= through to the project view component', async () => {
		const { ctx, plugin, replaced } = pluginFor('```likec4 view="index" project="architecture"\n```');

		await plugin.code?.(fence('view="index" project="architecture"'), ctx);

		expect(replaced[0]?.next).toMatchObject({
			name: '__LikeC4View',
			attributes: expect.arrayContaining([{ type: 'mdxJsxAttribute', name: 'project', value: 'architecture' }]),
		});
	});

	it('renders a file= fence from the file relative to the page', async () => {
		const site = await mkdtemp(join(tmpdir(), 'astroc4-fence-'));
		const pageFile = join(site, 'src', 'content', 'docs', 'page.mdx');
		await mkdir(join(dirname(pageFile), 'flows'), { recursive: true });
		await writeFile(
			join(dirname(pageFile), 'flows', 'request.c4'),
			"specification { element box }\nmodel { a = box 'A' }\nviews { view requestPath { include * } }\n",
		);
		const replaced: { next: any }[] = [];
		const plugin = (likec4Fences({ root: site }) as any)({
			source: '```likec4 file="./flows/request.c4" view="requestPath"\n```',
			sourceFormat: 'mdx',
		});

		await plugin.code(fence('file="./flows/request.c4" view="requestPath"'), {
			fileURL: pathToFileURL(pageFile),
			replaceNode: (_: unknown, next: any) => replaced.push({ next }),
		});

		expect(replaced[0]?.next.name).toBe('__LikeC4Fence');
		expect(replaced[0]?.next.attributes).toEqual(
			expect.arrayContaining([{ type: 'mdxJsxAttribute', name: 'viewId', value: 'requestPath' }]),
		);
	});

	it('fails a file= fence that escapes the site root', async () => {
		const site = await mkdtemp(join(tmpdir(), 'astroc4-fence-'));
		const pageFile = join(site, 'src', 'content', 'docs', 'page.mdx');
		const plugin = (likec4Fences({ root: site }) as any)({ source: '```likec4 file="../../../../x.c4"\n```', sourceFormat: 'mdx' });

		await expect(
			plugin.code(fence('file="../../../../x.c4"'), { fileURL: pathToFileURL(pageFile), replaceNode: () => {} }),
		).rejects.toThrow(/outside the site/);
	});

	it('inserts nothing when no fence was rewritten', async () => {
		const { ctx, plugin, inserted } = pluginFor('```likec4\n```');

		plugin.after?.({ type: 'root', children: [] }, ctx);

		expect(inserted).toHaveLength(0);
	});
});
