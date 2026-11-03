import { describe, expect, it, vi } from 'vitest';

import { likec4Fences, parseFenceMeta } from '../fences.mjs';

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

const pluginFor = (source: string, sourceFormat: 'mdx' | 'md' = 'mdx') => {
	const page_ = page(source, sourceFormat);

	return { ...page_, plugin: fencePlugin(page_.factory) };
};

const fence = (meta: string, value = '') => ({ type: 'code', lang: 'likec4', meta, value });

describe('the ```likec4 fence transform', () => {
	it('stays out of the way when the page has no fence', () => {
		expect(fencePlugin(page('just prose').factory)).toBeNull();
		expect(fencePlugin(page('```ts\nconst a = 1\n```').factory)).toBeNull();
	});

	it('warns rather than rendering a diagram in a .md page', async () => {
		const { ctx, plugin } = pluginFor('```likec4\nmodel { }\n```', 'md');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(plugin.name).toBe('likec4-fences:warn');
		await plugin.code?.(fence(''), ctx);

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('page.mdx has a ```likec4 fence'));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('only render as diagrams in .mdx'));
		warn.mockRestore();
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

	it('inserts nothing when no fence was rewritten', async () => {
		const { ctx, plugin, inserted } = pluginFor('```likec4\n```');

		plugin.after?.({ type: 'root', children: [] }, ctx);

		expect(inserted).toHaveLength(0);
	});
});
