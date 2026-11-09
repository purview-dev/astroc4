//   bun scripts/hydration.ts http://localhost:4321 [/fences/]
//
// Run against a *dev* server: "does not provide an export named 'c'" (Vite
// serving React's CommonJS compiler-runtime raw) only happens in dev, and
// `astro build` stays green through it.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

/** LikeC4 renders into a shadow root, which locators pierce and `querySelectorAll` does not. */
export const NODE = '[data-likec4-node], .react-flow__node';

export const LOADING = '.likec4-loading';

/** Dev-server chatter that is not a defect. */
export const IGNORED_CONSOLE = [/Outdated Optimize Dep/i, /\[vite\] (connecting|connected)/i];

export interface HydrationOptions {
	/** Defaults to `/`. */
	path?: string;
	/** Exact number of diagram frames. Defaults to "at least one". */
	expected?: number;
	/** Element labels that must be readable after hydration. */
	labels?: string[];
	/** Assert the frame's shell has a non-transparent border (styles resolved). */
	styling?: boolean;
	/** The computed colour the shell's hint must have, proving a site's `--likec4-accent` reached it. */
	accent?: string;
	/** Milliseconds to wait for the first node; a cold dev compile is slow. */
	timeout?: number;
}

export interface HydrationResult {
	/** Nodes in the first frame; `0` means it never hydrated. */
	nodes: number;
	failures: string[];
}

/** Console errors fail the check: the compiler-runtime error is only reported there. */
export async function checkHydration(
	baseUrl: string,
	options: HydrationOptions = {},
): Promise<HydrationResult> {
	const { path = '/', expected, labels = [], styling = false, accent, timeout = 45_000 } = options;
	const failures: string[] = [];

	const browser = await chromium.launch();

	try {
		const page = await browser.newPage();

		page.on('pageerror', (error) => failures.push(`${path}: pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() !== 'error') return;

			const text = message.text();
			if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;

			failures.push(`${path}: console.error: ${text}`);
		});

		await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle' });

		const frames = page.locator('.likec4-frame');
		const frameCount = await frames.count();

		if (expected === undefined && frameCount === 0) {
			failures.push(`${path}: no diagram frame at all — the component never rendered`);
		} else if (expected !== undefined && frameCount !== expected) {
			failures.push(`${path}: ${frameCount} diagram frame(s), expected ${expected}`);
		}

		const frame = frames.first();
		let nodes = 0;

		try {
			await frame.locator(NODE).first().waitFor({ state: 'attached', timeout });
			nodes = await frame.locator(NODE).count();
		} catch {
			failures.push(
				`${path}: no LikeC4 element node rendered within ${timeout}ms — the island never hydrated`,
			);
		}

		const placeholder = frame.locator(LOADING);
		if ((await placeholder.count()) > 0 && (await placeholder.first().isVisible())) {
			failures.push(`${path}: the loading placeholder is still visible — the island never hydrated`);
		}

		for (const label of labels) {
			try {
				await frame.getByText(label).first().waitFor({ state: 'visible', timeout: 15_000 });
			} catch {
				failures.push(`${path}: the element label "${label}" never rendered`);
			}
		}

		if (styling) {
			const border = await frame.evaluate((element) => {
				const target = element.closest('section') ?? element;

				return getComputedStyle(target).borderTopColor;
			});

			if (/transparent|rgba\(0, 0, 0, 0\)/.test(border)) {
				failures.push(`${path}: the diagram frame is unstyled (border ${border})`);
			}
		}

		if (accent !== undefined) {
			const hint = await page.locator('.likec4-shell__hint').first().evaluate((element) => getComputedStyle(element).color);

			if (hint !== accent) {
				failures.push(`${path}: the site's --likec4-accent did not reach the hint (${hint}, expected ${accent})`);
			}
		}

		return { nodes, failures };
	} finally {
		await browser.close();
	}
}

async function main(): Promise<void> {
	const [baseUrl = 'http://localhost:4321', path = '/'] = process.argv.slice(2);

	let result: HydrationResult;

	try {
		result = await checkHydration(baseUrl, { path });
	} catch (error) {
		console.error(`\n✗ could not run a browser against ${baseUrl}: ${(error as Error).message}`);
		console.error('  Is Chromium installed? `bunx playwright install chromium`');
		process.exit(1);
	}

	if (result.failures.length > 0) {
		console.error(`\n✗ ${path} did not hydrate:`);
		for (const failure of result.failures) console.error(`  - ${failure}`);
		process.exit(1);
	}

	console.log(`✓ ${path} hydrated and drew ${result.nodes} element node(s)`);
}

const entry = process.argv[1];

if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
	await main();
}
