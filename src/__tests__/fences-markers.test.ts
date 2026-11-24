import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { markdownToHtml } from 'satteri';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { layoutSource, likec4Fences, type FenceOptions } from '../fences.ts';

const MODEL = "specification { element box }\nmodel { a = box 'A' }\nviews { view index { include * } }\n";

interface Node {
	type: string;
	value?: string;
	lang?: string;
	position?: { start: { line: number } };
}

type MarkerPlugin = {
	html?: (node: Node, ctx: unknown) => Promise<void> | void;
	options?: { position?: boolean };
};

let repo: string;
let pageURL: URL;

beforeAll(async () => {
	repo = await mkdtemp(join(tmpdir(), 'astroc4-markers-'));
	await mkdir(join(repo, 'docs'), { recursive: true });
	await mkdir(join(repo, 'architecture'), { recursive: true });
	await writeFile(join(repo, 'architecture', 'model.c4'), MODEL);
	pageURL = pathToFileURL(join(repo, 'docs', 'page.md'));

	// The first compile loads LikeC4 and its layout engine, which can take longer than a test's timeout.
	await layoutSource(MODEL);
}, 60_000);

const open = (attributes: string, line = 3): Node => ({
	type: 'html',
	value: `<!-- purview:likec4 ${attributes} -->`,
	position: { start: { line } },
});
const close = (): Node => ({ type: 'html', value: '<!-- /purview:likec4 -->' });
const mermaid = (): Node => ({ type: 'code', lang: 'mermaid', value: 'graph TD\n  a --> b' });
const para = (): Node => ({ type: 'paragraph' });

/** A parent holding `children`, and a context that edits it the way Sätteri would. */
function tree(children: Node[]) {
	const parent = { type: 'root', children: [...children] };
	const ctx = {
		fileURL: pageURL,
		parent: () => parent,
		indexOf: (node: Node) => parent.children.indexOf(node),
		removeNode(node: Node) {
			const index = parent.children.indexOf(node);
			if (index >= 0) parent.children.splice(index, 1);
		},
		replaceNode(node: Node, next: Node) {
			const index = parent.children.indexOf(node);
			if (index >= 0) parent.children.splice(index, 1, next);
		},
		insertChildAt() {},
	};

	return { parent, ctx };
}

function build(options: FenceOptions, source: string, sourceFormat: 'md' | 'mdx' = 'md') {
	const factory = likec4Fences(options) as unknown as (factory: { source: string; sourceFormat: string }) => MarkerPlugin | null;

	return factory({ source, sourceFormat });
}

const SOURCE = '<!-- purview:likec4 file="../architecture/model.c4" -->\n\n```mermaid\ngraph TD\n```\n\n<!-- /purview:likec4 -->\n';

/** Run the html visitor over every html node, as the walk would. */
async function visit(plugin: MarkerPlugin | null, parent: { children: Node[] }, ctx: unknown) {
	for (const node of [...parent.children]) {
		if (node.type === 'html' && parent.children.includes(node)) await plugin?.html?.(node, ctx);
	}
}

describe('purview:likec4 markers', () => {
	it('valid marker becomes one placeholder', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const { parent, ctx } = tree([para(), open('file="../architecture/model.c4"'), mermaid(), para(), close(), para()]);

		await visit(plugin, parent, ctx);

		const html = parent.children.filter((node) => node.type === 'html');
		expect(html).toHaveLength(1);
		expect(html[0]?.value).toContain('data-astroc4-fence');
		expect(html[0]?.value).toContain('data-view-id="index"');
		expect(parent.children.some((node) => node.type === 'code' && node.lang === 'mermaid')).toBe(false);
		expect(parent.children).toHaveLength(3);
		expect(onMarkerFallback).not.toHaveBeenCalled();
	});

	it('passes the marker attributes to the placeholder, and resolves a /-rooted file', async () => {
		const plugin = build({ markers: { root: repo } }, SOURCE);
		const { parent, ctx } = tree([
			open('file="/architecture/model.c4" view="index" title="System" height=360 collapsible=false'),
			mermaid(),
			close(),
		]);

		await visit(plugin, parent, ctx);

		expect(parent.children).toHaveLength(1);
		expect(parent.children[0]?.value).toContain('>System<');
		expect(parent.children[0]?.value).toContain('height: 360px');
		expect(parent.children[0]?.value).not.toContain('<details');
	});

	it('undeclared view keeps mermaid', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const { parent, ctx } = tree([open('file="../architecture/model.c4" view="missing"', 7), mermaid(), close()]);

		await visit(plugin, parent, ctx);

		expect(parent.children).toHaveLength(1);
		expect(parent.children[0]).toMatchObject({ type: 'code', lang: 'mermaid' });
		expect(onMarkerFallback).toHaveBeenCalledTimes(1);
		expect(onMarkerFallback.mock.calls[0]?.[0]).toMatch(/undeclared|not declared/);
		expect(onMarkerFallback.mock.calls[0]?.[0]).toMatch(/page\.md:7: purview:likec4 marker kept its fallback — /);
	});

	it.each([
		['a missing file', 'file="../architecture/nope.c4"'],
		['a file outside the repository', 'file="../../outside.c4"'],
		['no file attribute', 'view="index"'],
	])('keeps the fallback for %s', async (_name, attributes) => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const { parent, ctx } = tree([open(attributes), mermaid(), close()]);

		await visit(plugin, parent, ctx);

		expect(parent.children.map((node) => node.type)).toEqual(['code']);
		expect(onMarkerFallback).toHaveBeenCalledTimes(1);
	});

	it('keeps the fallback for a model that is not valid LikeC4', async () => {
		await writeFile(join(repo, 'architecture', 'broken.c4'), 'model { a = }');
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const { parent, ctx } = tree([open('file="../architecture/broken.c4"'), mermaid(), close()]);

		await visit(plugin, parent, ctx);

		expect(parent.children.map((node) => node.type)).toEqual(['code']);
		expect(onMarkerFallback).toHaveBeenCalledWith(expect.stringContaining('not valid LikeC4'));
	});

	it('omits the line when the marker has no position', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const marker = { type: 'html', value: '<!-- purview:likec4 view="index" -->' };
		const { parent, ctx } = tree([marker, mermaid(), close()]);

		await visit(plugin, parent, ctx);

		expect(onMarkerFallback.mock.calls[0]?.[0]).toMatch(/page\.md: purview:likec4 marker kept its fallback — /);
	});

	it('unclosed marker is left as is', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const children = [open('file="../architecture/model.c4"'), mermaid(), para()];
		const { parent, ctx } = tree(children);

		await visit(plugin, parent, ctx);

		expect(parent.children).toEqual(children);
		expect(onMarkerFallback).toHaveBeenCalledTimes(1);
	});

	it('treats an opening marker before the close as unclosed, and renders the inner one', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, onMarkerFallback }, SOURCE);
		const outer = open('file="../architecture/model.c4"');
		const { parent, ctx } = tree([outer, open('file="../architecture/model.c4"', 5), mermaid(), close()]);

		await visit(plugin, parent, ctx);

		expect(parent.children[0]).toBe(outer);
		expect(parent.children).toHaveLength(2);
		expect(parent.children[1]?.value).toContain('data-astroc4-fence');
		expect(onMarkerFallback).toHaveBeenCalledTimes(1);
	});

	it('marker text in a code fence is untouched', async () => {
		const fenced = '```md\n<!-- purview:likec4 file="../architecture/model.c4" -->\n\n<!-- /purview:likec4 -->\n```\n';
		const result = await markdownToHtml(fenced, {
			fileURL: pageURL,
			mdastPlugins: [likec4Fences({ markers: { root: repo } })],
		});

		expect(result.html).toContain('&lt;!-- purview:likec4');
		expect(result.html).toContain('&lt;!-- /purview:likec4 --&gt;');
		expect(result.html).not.toContain('data-astroc4-fence');
	});

	it('replaces the whole block in a real Sätteri compile', async () => {
		const onMarkerFallback = vi.fn();
		const result = await markdownToHtml(`# Page\n\n${SOURCE}\nafter\n`, {
			fileURL: pageURL,
			mdastPlugins: [likec4Fences({ markers: { root: repo }, onMarkerFallback })],
		});

		expect(result.html).toContain('data-astroc4-fence');
		expect(result.html).not.toContain('mermaid');
		expect(result.html).not.toContain('purview:likec4');
		expect(result.html).toContain('<p>after</p>');
		expect(onMarkerFallback).not.toHaveBeenCalled();
	});

	it('reports the line of a failing marker in a real Sätteri compile', async () => {
		const onMarkerFallback = vi.fn();
		const result = await markdownToHtml(`# Page\n\n${SOURCE.replace('model.c4"', 'model.c4" view="missing"')}`, {
			fileURL: pageURL,
			mdastPlugins: [likec4Fences({ markers: { root: repo }, onMarkerFallback })],
		});

		expect(result.html).toContain('mermaid');
		expect(result.html).not.toContain('purview:likec4');
		expect(onMarkerFallback).toHaveBeenCalledWith(expect.stringMatching(/page\.md:3: /));
	});

	it('page with only markers is not skipped', () => {
		expect(build({ markers: { root: repo } }, SOURCE)).not.toBeNull();
		expect(build({ markers: { root: repo } }, 'just prose')).toBeNull();
	});

	it('two markers, one model, two placeholders', async () => {
		const plugin = build({ markers: { root: repo } }, SOURCE);
		const { parent, ctx } = tree([
			open('file="../architecture/model.c4"'),
			mermaid(),
			close(),
			para(),
			open('file="/architecture/model.c4" title="Again"', 9),
			mermaid(),
			close(),
		]);

		await visit(plugin, parent, ctx);

		expect(parent.children.map((node) => node.type)).toEqual(['html', 'paragraph', 'html']);
		expect(parent.children[0]?.value).toContain('data-view-id="index"');
		expect(parent.children[2]?.value).toContain('data-view-id="index"');
		expect(parent.children[2]?.value).toContain('>Again<');
	});

	it('strict validation does not throw on a bad marker', async () => {
		const onMarkerFallback = vi.fn();
		const plugin = build({ markers: { root: repo }, validation: 'strict', onMarkerFallback }, SOURCE);
		const { parent, ctx } = tree([open('file="../architecture/nope.c4"'), mermaid(), close()]);

		await expect(visit(plugin, parent, ctx)).resolves.toBeUndefined();
		expect(onMarkerFallback).toHaveBeenCalledTimes(1);
	});

	it('markers: false leaves comments', async () => {
		expect(build({ markers: false }, SOURCE)).toBeNull();

		const plugin = build({ markers: false }, SOURCE + '\n```likec4\n```\n');
		const children = [open('file="../architecture/model.c4"'), mermaid(), close()];
		const { parent, ctx } = tree(children);

		await visit(plugin, parent, ctx);

		expect(parent.children).toEqual(children);
	});

	it('mdx page ignores markers', async () => {
		const plugin = build({ markers: { root: repo } }, SOURCE, 'mdx');
		const children = [open('file="../architecture/model.c4"'), mermaid(), close()];
		const { parent, ctx } = tree(children);

		await visit(plugin, parent, ctx);

		expect(parent.children).toEqual(children);
	});
});
