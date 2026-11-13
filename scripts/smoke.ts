// Checks in a browser what the static build can't prove.
//
//   bun run dev                                  # or: bun run build && bun run preview
//   bun scripts/smoke.ts http://localhost:4321

import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

import { chromium } from 'playwright';

import { IGNORED_CONSOLE, NODE } from './hydration.ts';

const baseUrl = process.argv[2] ?? 'http://localhost:4321';
const failures = [];


const browser = await chromium.launch();
const page = await browser.newPage();

page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
	if (message.type() !== 'error') return;

	const text = message.text();
	if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;

	failures.push(`console.error: ${text}`);
});

let packIconCount = 0;
const imageIconSrcs = new Set<string>();

/** Collapsed diagrams never mount, so every `<details>` is opened first. */
async function checkDiagrams(pathname: string, { expected }: { expected: number }): Promise<void> {
	await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' });

	const frames = page.locator('.likec4-frame');
	const frameCount = await frames.count();

	if (frameCount !== expected) {
		failures.push(`${pathname}: ${frameCount} diagrams, expected ${expected}`);
	}

	for (let i = 0; i < frameCount; i++) {
		const frame = frames.nth(i);
		const details = frame.locator('xpath=ancestor::details[1]');

		if (
			(await details.count()) > 0 &&
			!(await details.first().evaluate((el) => (el as HTMLDetailsElement).open))
		) {
			await details.first().evaluate((el) => el.setAttribute('open', ''));
		}

		const label = await frame.evaluate(
			(el) => el.closest('section')?.querySelector('h3')?.textContent?.trim() ?? 'unnamed',
		);

		try {
			await frame.locator(NODE).first().waitFor({ state: 'attached', timeout: 15_000 });
			console.log(`✓ ${pathname} — "${label}" rendered ${await frame.locator(NODE).count()} nodes`);
		} catch {
			failures.push(`${pathname} — "${label}" rendered no nodes`);
			continue;
		}

		const placeholder = frame.locator('.likec4-loading');
		if ((await placeholder.count()) > 0 && (await placeholder.first().isVisible())) {
			failures.push(`${pathname} — "${label}" still shows the loading placeholder`);
			continue;
		}

		// LikeC4 renders into a shadow root; locators pierce it, querySelectorAll does not.
		packIconCount += await frame.locator('svg').count();

		const imgs = frame.locator('img');
		for (let j = 0; j < (await imgs.count()); j++) {
			const src = await imgs.nth(j).getAttribute('src');
			if (src) imageIconSrcs.add(src);
		}
	}
}

async function alertsOn(pathname: string): Promise<string[]> {
	await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' });
	const alerts = page.locator('.likec4-frame [role="alert"]');
	await alerts.first().waitFor({ state: 'attached', timeout: 15_000 });

	return alerts.allTextContents();
}

function expectText(where: string, actual: string[], expected: string): void {
	if (actual.some((text) => text.includes(expected))) {
		console.log(`✓ ${where}: "${expected}"`);
	} else {
		failures.push(`${where}: expected "${expected}", got ${JSON.stringify(actual)}`);
	}
}

// ── Diagrams ────────────────────────────────────────────────────────────────
await checkDiagrams('/', { expected: 5 });
await checkDiagrams('/named-projects/', { expected: 4 });
await checkDiagrams('/fences/', { expected: 3 });
// Plain .md: placeholders mounted by the injected page script, not islands.
await checkDiagrams('/markdown-fences/', { expected: 2 });

const strayFences = await page.locator('[data-language="likec4"]').count();
if (strayFences > 0) {
	failures.push(`Fences: ${strayFences} \`\`\`likec4 block(s) rendered as code, not diagrams`);
} else {
	console.log('✓ No ```likec4 fence left as a code block');
}

// ── Icons ───────────────────────────────────────────────────────────────────
if (packIconCount === 0) {
	failures.push('Icons: no bundled pack icons rendered');
} else {
	console.log(`✓ Bundled pack icons rendered (${packIconCount} inline svg)`);
}

const leaked = [...imageIconSrcs].filter((src) => src.startsWith('file://'));
if (leaked.length > 0) failures.push(`Icons: build-machine path reached an <img src> — ${leaked[0]}`);

/**
 * LikeC4 inlines some local SVGs as `data:` URIs, so either form counts. The
 * encoder collapses whitespace and swaps quotes, so compare with both stripped.
 */
function rendered(url: string, file: URL): boolean {
	const normalise = (svg: string) => svg.replace(/\s+|["']/g, '');
	const svg = normalise(readFileSync(file, 'utf8')).slice(0, 120);

	return [...imageIconSrcs].some(
		(src) => src === url || (src.startsWith('data:image/svg+xml') && normalise(decodeURIComponent(src)).includes(svg)),
	);
}

const seen = () => [...imageIconSrcs].map((src) => src.slice(0, 60)).join(', ') || 'none';

if (!rendered('/icons/demo.svg', new URL('../playground/public/icons/demo.svg', import.meta.url))) {
	failures.push(`Icons: self-hosted public/icons/demo.svg never rendered (saw ${seen()})`);
} else {
	console.log('✓ Self-hosted public/ icon rendered');
}

const ALIAS_ICON = '/_astroc4/external/brand/logo.svg';

if (!rendered(ALIAS_ICON, new URL('../playground-external/images/brand/logo.svg', import.meta.url))) {
	failures.push(`Icons: aliased @/brand/logo.svg never rendered (saw ${seen()})`);
} else {
	console.log('✓ Aliased @/brand/logo.svg rendered from a project outside the site');
}

const aliasResponse = await page.request.get(`${baseUrl}${ALIAS_ICON}`);

if (aliasResponse.status() !== 200 || !(aliasResponse.headers()['content-type'] ?? '').includes('image/svg+xml')) {
	failures.push(`Icons: ${ALIAS_ICON} answered ${aliasResponse.status()} ${aliasResponse.headers()['content-type']}`);
} else {
	console.log(`✓ Aliased icon served from ${ALIAS_ICON}`);
}

const dist = new URL('../playground/dist/', import.meta.url);

if (existsSync(dist)) {
	const leaks = (await readdir(dist, { recursive: true }))
		.filter((file) => /\.(html|js|mjs|json)$/.test(file))
		.filter((file) => readFileSync(new URL(file.replaceAll('\\', '/'), dist), 'utf8').includes('file://'));

	if (leaks.length > 0) failures.push(`Build output: file:// in ${leaks.slice(0, 3).join(', ')}`);
	else console.log('✓ No file:// in playground/dist');
}

// ── Shell styling ───────────────────────────────────────────────────────────
// Plain CSS over Starlight tokens: a misnamed variable computes to transparent.
await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
const styles = await page.locator('.likec4-frame').first().evaluate((frame) => {
	const shell = frame.closest('section');
	const summary = shell?.querySelector('summary');

	return {
		frameHeight: getComputedStyle(frame).minHeight,
		summaryBorder: summary ? getComputedStyle(summary).borderBottomColor : null,
		shellRadius: shell ? getComputedStyle(shell).borderTopLeftRadius : null,
	};
});

if (styles.frameHeight !== '560px') failures.push(`Styling: frame min-height ${styles.frameHeight}, expected 560px`);
if (!styles.summaryBorder || /transparent|rgba\(0, 0, 0, 0\)/.test(styles.summaryBorder)) {
	failures.push(`Styling: shell border did not resolve (${styles.summaryBorder})`);
}
if (styles.shellRadius !== '12px') failures.push(`Styling: shell radius ${styles.shellRadius}, expected 12px`);
if (!failures.some((f) => f.startsWith('Styling'))) {
	console.log(`✓ Shell styled (radius ${styles.shellRadius}, border ${styles.summaryBorder})`);
}

// ── Highlighting ────────────────────────────────────────────────────────────
// Unhighlighted code is one colour; the grammar should produce several.
await page.goto(`${baseUrl}/highlighting/`, { waitUntil: 'networkidle' });
const colours = await page.evaluate(() =>
	[...document.querySelectorAll('.expressive-code pre')].map(
		(pre) => new Set([...pre.querySelectorAll('span')].map((span) => getComputedStyle(span).color)).size,
	),
);

if (colours.length < 2 || colours.some((count) => count < 4)) {
	failures.push(`Highlighting: distinct colours per block ${JSON.stringify(colours)}, expected ≥ 4 each`);
} else {
	console.log(`✓ LikeC4 source highlighted (${colours.join(', ')} colours per block)`);
}

// ── i18n ────────────────────────────────────────────────────────────────────
// Error templates are interpolated in the browser, so they prove the
// translation made it through the island props, not just the Astro shell.
const enAlerts = await alertsOn('/errors/');
expectText('en island', enAlerts, 'A LikeC4 viewId is required');

const frAlerts = await alertsOn('/fr/errors/');
expectText('fr island', frAlerts, 'Un viewId LikeC4 est requis');

await page.goto(`${baseUrl}/fr/`, { waitUntil: 'networkidle' });
const frShell = await page.locator('.likec4-shell').first().allInnerTexts();
expectText('fr shell', frShell, 'Diagramme d’architecture');
expectText('fr shell', frShell, 'Cliquez sur un nœud pour ouvrir la fenêtre');

await browser.close();

if (failures.length > 0) {
	console.error(`\n✗ ${failures.length} failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\n✓ Playground smoke test passed.');
