import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildIconManifest, ICON_ROUTE, iconAssetFor } from '../icon-assets';
import { Astroc4ConfigError, type ResolvedProject } from '../projects';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

async function file(path: string): Promise<string> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, SVG);
	return path;
}

/** A project folder `architecture` with an `@` alias to `images/` and `@brand` to `../brand`. */
async function fixture(folderName = 'architecture') {
	const root = await mkdtemp(join(tmpdir(), 'astroc4-icons-'));
	const site = join(root, 'site');
	const folder = join(root, 'repo', folderName);
	await mkdir(join(site, 'public'), { recursive: true });
	await mkdir(folder, { recursive: true });

	const project: ResolvedProject = {
		name: 'architecture',
		folder,
		likec4Id: 'minder-architecture',
		source: 'configured',
		imageAliases: { '@': join(folder, 'images'), '@brand': join(root, 'repo', 'brand') },
	};

	return { root, site, folder, project };
}

const url = (path: string) => pathToFileURL(path).href;

describe('iconAssetFor', () => {
	it('maps an @ alias icon to /_astroc4/<project>/<path under the alias>', async () => {
		const { site, folder, project } = await fixture();
		const icon = await file(join(folder, 'images', 'azure', 'entra', 'x.svg'));

		expect(iconAssetFor(project, url(icon), '/', site)).toMatchObject({
			url: '/_astroc4/architecture/azure/entra/x.svg',
			projectName: 'architecture',
		});
	});

	it('maps a named alias with its name as the first segment', async () => {
		const { root, site, project } = await fixture();
		const icon = await file(join(root, 'repo', 'brand', 'logo.svg'));

		expect(iconAssetFor(project, url(icon), '/', site)?.url).toBe('/_astroc4/architecture/brand/logo.svg');
	});

	it('maps a relative-path icon to its path under the project folder, with .. made safe', async () => {
		const { root, site, folder, project } = await fixture();
		const inside = await file(join(folder, 'icons', 'a.svg'));
		const outside = await file(join(root, 'repo', 'shared', 'b.svg'));

		expect(iconAssetFor(project, url(inside), '/', site)?.url).toBe('/_astroc4/architecture/icons/a.svg');
		expect(iconAssetFor(project, url(outside), '/', site)?.url).toBe('/_astroc4/architecture/__up/shared/b.svg');
	});

	it('prefixes Astro base', async () => {
		const { site, folder, project } = await fixture();
		const icon = await file(join(folder, 'images', 'x.svg'));

		expect(iconAssetFor(project, url(icon), '/docs/', site)?.url).toBe('/docs/_astroc4/architecture/x.svg');
		expect(iconAssetFor(project, url(icon), '/docs', site)?.url).toBe('/docs/_astroc4/architecture/x.svg');
	});

	it('treats an upper-case, lower-case or %3A-encoded drive and a folder with a space the same', async () => {
		const { site, project } = await fixture('arch itecture');
		const icon = await file(join(project.folder, 'images', 'with space', 'x.svg'));
		const href = url(icon);
		const variants = [href, href.replace(/^file:\/\/\/([A-Za-z]):/, (_, d: string) => `file:///${d.toLowerCase()}%3A`)];

		for (const variant of variants) {
			expect(iconAssetFor(project, variant, '/', site)?.url).toBe('/_astroc4/architecture/with%20space/x.svg');
		}
	});

	it('maps a URL through the staging junction like the original file', async () => {
		const { root, site, folder, project } = await fixture();
		const icon = await file(join(folder, 'images', 'x.svg'));
		const link = join(root, 'site', '.astro', 'astroc4', 'workspace', 'architecture');
		await mkdir(dirname(link), { recursive: true });
		await symlink(folder, link, 'junction');

		expect(iconAssetFor(project, url(join(link, 'images', 'x.svg')), '/', site)?.url).toBe(
			iconAssetFor(project, url(icon), '/', site)?.url,
		);
	});

	it('leaves a public/ icon to classifyIcon', async () => {
		const { site, project } = await fixture();
		const icon = await file(join(site, 'public', 'icons', 'p.svg'));

		expect(iconAssetFor(project, url(icon), '/', site)).toBeNull();
	});

	it('fails for a missing file, naming the icon', async () => {
		const { site, folder, project } = await fixture();
		const missing = url(join(folder, 'images', 'gone.svg'));

		expect(() => iconAssetFor(project, missing, '/', site)).toThrow(Astroc4ConfigError);
		expect(() => iconAssetFor(project, missing, '/', site)).toThrow(/gone\.svg/);
	});
});

describe('buildIconManifest', () => {
	it('keys every asset by its compiled URL', async () => {
		const { site, folder, project } = await fixture();
		const icon = await file(join(folder, 'images', 'x.svg'));

		const manifest = buildIconManifest([{ project, fileUrl: url(icon), source: 'model.c4' }], '/', site);

		expect(manifest.get(url(icon))?.url).toBe('/_astroc4/architecture/x.svg');
		expect(ICON_ROUTE).toBe('/_astroc4/');
	});

	it('names the .c4 file when an icon is missing', async () => {
		const { site, folder, project } = await fixture();

		expect(() =>
			buildIconManifest(
				[{ project, fileUrl: url(join(folder, 'images', 'gone.svg')), source: 'views/c1.c4' }],
				'/',
				site,
			),
		).toThrow(/views\/c1\.c4[\s\S]*gone\.svg|gone\.svg[\s\S]*views\/c1\.c4/);
	});

	it('fails when two files map to the same served path, naming both', async () => {
		const { root, site, folder, project } = await fixture();
		// `@` + brand/logo.svg and `@brand` + logo.svg both serve /_astroc4/architecture/brand/logo.svg.
		const viaRoot = await file(join(folder, 'images', 'brand', 'logo.svg'));
		const viaBrand = await file(join(root, 'repo', 'brand', 'logo.svg'));

		expect(() =>
			buildIconManifest(
				[
					{ project, fileUrl: url(viaRoot), source: 'a.c4' },
					{ project, fileUrl: url(viaBrand), source: 'b.c4' },
				],
				'/',
				site,
			),
		).toThrow(/brand\/logo\.svg[\s\S]*images[\s\S]*repo[\\/]brand|repo[\\/]brand[\s\S]*images/);
	});

	it('skips public/ icons', async () => {
		const { site, project } = await fixture();
		const icon = await file(join(site, 'public', 'p.svg'));

		expect(buildIconManifest([{ project, fileUrl: url(icon), source: 'a.c4' }], '/', site).size).toBe(0);
	});
});
