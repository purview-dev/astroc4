import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FILE_LAYOUT_QUERY, fileLayoutPlugin } from '../file-layout';

describe('fileLayoutPlugin', () => {
	it('compiles a .c4 file imported with ?astroc4-layout into its layouted model', async () => {
		const folder = await mkdtemp(join(tmpdir(), 'astroc4-file-'));
		const file = join(folder, 'flow.c4');
		await writeFile(file, "specification { element box }\nmodel { a = box 'A' }\nviews { view flow { include * } }\n");
		const plugin: any = fileLayoutPlugin();
		const context = { addWatchFile: vi.fn() };

		const code: string = await plugin.load.call(context, `${file}${FILE_LAYOUT_QUERY}`);

		expect(code.startsWith('export default ')).toBe(true);
		// LikeC4 adds its own `index` view next to the declared one.
		expect(JSON.parse(code.slice('export default '.length).replace(/;$/, '')).viewIds).toContain('flow');
		expect(context.addWatchFile).toHaveBeenCalledWith(file);
	});

	it('ignores other modules', async () => {
		expect(await (fileLayoutPlugin() as any).load.call({}, '/src/flow.c4')).toBeNull();
	});

	it('fails with the file path when the file is not valid LikeC4', async () => {
		const folder = await mkdtemp(join(tmpdir(), 'astroc4-file-'));
		const file = join(folder, 'broken.c4');
		await writeFile(file, 'model { a = }');

		await expect((fileLayoutPlugin() as any).load.call({ addWatchFile: vi.fn() }, `${file}${FILE_LAYOUT_QUERY}`)).rejects.toThrow(
			/broken\.c4/,
		);
	});
});
