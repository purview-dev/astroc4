import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { astroc4IconPlugin } from '../icon-plugin';
import type { ResolvedProject } from '../projects';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'astroc4-plugin-'));
	const site = join(root, 'site');
	const folder = join(root, 'repo', 'architecture');
	const icon = join(folder, 'images', 'azure', 'x.svg');
	const other = join(folder, 'images', 'tech', 'y.svg');

	for (const path of [icon, other]) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, SVG);
	}

	await mkdir(join(site, 'public'), { recursive: true });

	const project: ResolvedProject = {
		name: 'architecture',
		folder,
		likec4Id: 'minder-architecture',
		source: 'configured',
		imageAliases: { '@': join(folder, 'images') },
	};

	const plugin = astroc4IconPlugin({ projects: [project], base: '/', siteRoot: site });

	return { root, site, icon, other, plugin };
}

/** How LikeC4 writes a string into its generated module: every `/` as `/`. */
const escaped = (value: string) => value.replaceAll('/', '\\u002F');

const transform = (plugin: any, code: string, id: string) => plugin.transform(code, id)?.code ?? null;

describe('astroc4IconPlugin', () => {
	it('rewrites every file:// icon in a likec4 virtual module to its served URL', async () => {
		const { icon, other, plugin } = await fixture();
		const code = `export const model = {"a":{"icon":"${escaped(pathToFileURL(icon).href)}"},"b":{"icon":"${pathToFileURL(other).href}"}};`;

		const output = transform(plugin, code, 'likec4:plugin/minder-architecture/model.js');

		expect(output).toContain(escaped('/_astroc4/architecture/azure/x.svg'));
		expect(output).toContain('/_astroc4/architecture/tech/y.svg');
		expect(output).not.toContain('file:');
	});

	it('leaves non-likec4 modules untouched', async () => {
		const { icon, plugin } = await fixture();

		expect(transform(plugin, `const a = "${pathToFileURL(icon).href}";`, '/src/page.ts')).toBeNull();
	});

	it('serves a manifest file from the dev middleware with its content type', async () => {
		const { icon, plugin } = await fixture();
		transform(plugin, `"${pathToFileURL(icon).href}"`, 'likec4:plugin/minder-architecture/model.js');
		const middleware = devMiddleware(plugin);
		const res = response();

		await middleware({ url: '/_astroc4/architecture/azure/x.svg' }, res, vi.fn());

		expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/svg+xml');
		expect(res.end).toHaveBeenCalledWith(Buffer.from(SVG));
	});

	it('answers 404 for a path outside the manifest, including ../ traversal', async () => {
		const { icon, plugin } = await fixture();
		transform(plugin, `"${pathToFileURL(icon).href}"`, 'likec4:plugin/minder-architecture/model.js');
		const middleware = devMiddleware(plugin);

		for (const url of [
			'/_astroc4/architecture/azure/missing.svg',
			'/_astroc4/architecture/../../repo/architecture/images/azure/x.svg',
			'/_astroc4/architecture/%2e%2e/%2e%2e/secret',
		]) {
			const res = response();
			await middleware({ url }, res, vi.fn());
			expect(res.statusCode).toBe(404);
			expect(res.end).toHaveBeenCalledWith();
		}
	});

	it('passes other requests on', async () => {
		const { plugin } = await fixture();
		const next = vi.fn();

		await devMiddleware(plugin)({ url: '/index.html' }, response(), next);

		expect(next).toHaveBeenCalled();
	});

	it('copies every manifest file into the build output at its URL', async () => {
		const { root, icon, plugin } = await fixture();
		transform(plugin, `"${pathToFileURL(icon).href}"`, 'likec4:plugin/minder-architecture/model.js');
		const out = join(root, 'dist');

		await plugin.emit(out);

		expect(await readFile(join(out, '_astroc4', 'architecture', 'azure', 'x.svg'), 'utf8')).toBe(SVG);
	});
});

function devMiddleware(plugin: any) {
	let handler: any;
	plugin.configureServer({ middlewares: { use: (fn: any) => (handler = fn) } });
	return handler as (req: { url: string }, res: any, next: () => void) => Promise<void>;
}

function response() {
	return { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
}
