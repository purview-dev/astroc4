// hydration.ts
// path: scripts/hydration.ts
// Browser check for the one thing a static build cannot prove: that a
// `<LikeC4View>` island hydrates and draws nodes.
//
//   bun scripts/hydration.ts http://localhost:4321
//   bun scripts/hydration.ts http://localhost:4321 /fences/
//
// `scripts/test-site.ts` points this at a throwaway Starlight site's *dev*
// server on purpose: the failure it guards against
//
//   The requested module '/node_modules/react/compiler-runtime.js' does not
//   provide an export named 'c'
//
// only happens in dev, where Vite serves an unoptimized CommonJS dependency
// raw. `astro build` bundles it correctly, so a green build is not proof that a
// diagram renders — only a browser is.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

/**
 * A LikeC4 element node. LikeC4 renders into a shadow root, which Playwright
 * locators pierce and `querySelectorAll` does not.
 */
export const NODE = '[data-likec4-node], .react-flow__node';

/** The server-rendered stand-in that hydration replaces. */
export const LOADING = '.likec4-loading';

/** Dev-server chatter that is not a defect. */
export const IGNORED_CONSOLE = [/Outdated Optimize Dep/i, /\[vite\] (connecting|connected)/i];

/** Everything {@link checkHydration} accepts. */
export interface HydrationOptions {
	/** Path to load, relative to the site root. Defaults to `/`. */
	path?: string;
	/** Exact number of diagram frames the page should contain. Defaults to "at least one". */
	expected?: number;
	/** Element labels that must be readable after hydration. */
	labels?: string[];
	/**
	 * Also assert the diagram's own chrome is styled — a non-transparent border on
	 * the frame's shell. That is what tells a plain Astro site (no Starlight
	 * tokens) apart from one whose styles silently resolved to nothing.
	 */
	styling?: boolean;
	/** Milliseconds to wait for the first node — a cold dev compile is slow. */
	timeout?: number;
}

/** What {@link checkHydration} found. */
export interface HydrationResult {
	/** Element nodes drawn into the first frame; `0` means it never hydrated. */
	nodes: number;
	/** Human-readable problems; empty means every frame hydrated cleanly. */
	failures: string[];
}

/**
 * Load a page, wait for its diagram to draw, and report what could not be
 * proven. Console errors fail the check: the React Compiler runtime error is
 * only ever reported there, never as a server error.
 */
export async function checkHydration(
	baseUrl: string,
	options: HydrationOptions = {},
): Promise<HydrationResult> {
	const { path = '/', expected, labels = [], styling = false, timeout = 45_000 } = options;
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

		// The placeholder is the island's `slot="fallback"`: if it is still
		// painted, the browser is looking at the server-rendered stand-in.
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
			// The shell is the frame's `section`; a Starlight site styles it from
			// `--sl-color-*`, a plain Astro site from the components' fallbacks —
			// either way a transparent border means the styles never applied.
			const border = await frame.evaluate((element) => {
				const target = element.closest('section') ?? element;

				return getComputedStyle(target).borderTopColor;
			});

			if (/transparent|rgba\(0, 0, 0, 0\)/.test(border)) {
				failures.push(`${path}: the diagram frame is unstyled (border ${border})`);
			}
		}

		return { nodes, failures };
	} finally {
		await browser.close();
	}
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// `bun scripts/hydration.ts <url> [path]`, for poking at a running site.
async function main(): Promise<void> {
	const [baseUrl = 'http://localhost:4321', path = '/'] = process.argv.slice(2);

	let result: HydrationResult;

	try {
		result = await checkHydration(baseUrl, { path });
	} catch (error) {
		// A missing browser is a setup problem, not a broken site; say which.
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
