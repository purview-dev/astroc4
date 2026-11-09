// Packs the package and installs the tarball into copies of `playground/`
// (Starlight: the full smoke suite on a preview server) and `examples/astro/`
// (plain Astro: hydration on a dev server, where the `react/compiler-runtime`
// failure shows, then a rebuild in the shape `astro add` writes).
//
//   bun run test:site              # pack, build and smoke both consumer sites
//   bun run test:site --keep       # keep the temp sites for debugging
//   bun run test:site --no-check   # skip the consumers' `astro check`
//   bun run test:site --no-hydrate # skip the browser checks (smoke + hydration)
//
// Network: the sites install packages and the plugin resolves the grammar from
// likec4/likec4, so this is not hermetic. Set ASTROC4_OFFLINE=1 to use the
// bundled grammar instead (CI does not, on purpose: the fetch is part of what
// is being tested). The browser checks need Chromium:
// `bunx playwright install chromium`.

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkHydration } from './hydration.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const runCheck = !args.includes('--no-check');
const hydrate = !args.includes('--no-hydrate');

const failures: string[] = [];
const step = (message: string): void => console.log(`\n» ${message}`);
const done = (message: string): void => console.log(`✓ ${message}`);

/** Options for {@link run}. */
interface RunOptions {
	cwd?: string;
	capture?: boolean;
	env?: Record<string, string>;
}

/** Run a command, echoing it, with the temp site as the working directory. */
function run(command: string, commandArgs: string[], options: RunOptions = {}): void {
	execFileSync(command, commandArgs, {
		cwd: options.cwd ?? root,
		stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
		encoding: 'utf8',
		env: { ...process.env, ...options.env },
		shell: process.platform === 'win32',
	});
}

/** The Astro CLI entry point the consumer site installed, from its manifest. */
function astroCli(where: string): string {
	const directory = join(where, 'node_modules', 'astro');
	const { bin } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));

	return join(directory, typeof bin === 'string' ? bin : bin.astro);
}

/** A running dev server, and the way to stop it again. */
interface DevServer {
	url: string;
	stop: () => Promise<void>;
}

/** An unused port, so this never fights the developer's own dev server. */
function freePort(): Promise<number> {
	return new Promise((done, fail) => {
		const probe = createServer();

		probe.on('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			const port = typeof address === 'object' && address ? address.port : 0;

			probe.close(() => (port > 0 ? done(port) : fail(new Error('could not find a free port'))));
		});
	});
}

/**
 * Start one of the consumer site's own servers and wait until it answers.
 *
 * `dev` is the only way to see the failure the hydration check guards against:
 * `astro build` bundles `react/compiler-runtime` correctly, so a green build
 * proves nothing about the browser. `preview` serves the built output, which is
 * what the smoke suite runs against — the artifact, not a dev transform.
 */
async function startServer(
	where: string,
	{ mode = 'dev', timeoutMs = 180_000 }: { mode?: 'dev' | 'preview'; timeoutMs?: number } = {},
): Promise<DevServer> {
	const port = await freePort();
	const child = spawn('node', [astroCli(where), mode, '--port', String(port), '--host', '127.0.0.1'], {
		cwd: where,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
		windowsHide: true,
	});

	// The server's own output is the only explanation for a timeout.
	const state = { exited: null as number | null };
	let log = '';
	const record = (chunk: Buffer): void => {
		log += chunk.toString();
	};

	child.stdout?.on('data', record);
	child.stderr?.on('data', record);
	child.on('exit', (code) => {
		state.exited = code ?? -1;
	});

	const stop = async (): Promise<void> => {
		if (state.exited !== null) return;

		child.kill();

		// Windows takes a moment to release the port and the temp directory.
		await new Promise<void>((done) => {
			const timer = setTimeout(done, 10_000);

			child.once('exit', () => {
				clearTimeout(timer);
				done();
			});
		});
	};

	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (state.exited !== null) {
			throw new Error(`the dev server exited (code ${state.exited}) before answering:\n${log}`);
		}

		try {
			// The first request is what makes Astro compile the page and LikeC4
			// compile the model, so this can take a while.
			const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(15_000) });
			if (response.ok) return { url, stop };
		} catch {
			// Not listening yet.
		}

		await new Promise((done) => setTimeout(done, 500));
	}

	await stop();
	throw new Error(`the dev server did not answer on ${url} within ${timeoutMs / 1000}s:\n${log}`);
}

// ── Pack ────────────────────────────────────────────────────────────────────
step(`Toolchain: node ${process.version}, bun ${execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim()}`);

// Windows' TEMP can be an 8.3 short path (C:\Users\ABCDEF~1\…); Vite realpaths
// modules to the long form, and the dev server then 404s its own virtual scripts.
const work = mkdtempSync(join(realpathSync.native(tmpdir()), 'astroc4-site-'));

// The tarball is only as good as `dist/`: fail here rather than packing a
// package whose `exports` point at files that do not exist.
if (!existsSync(join(root, 'dist', 'index.js'))) {
	throw new Error('dist/ is missing — run `bun run build:lib` (or `bun run test:site`) first');
}
const packed = join(work, 'packed');
mkdirSync(packed);

step(`Packing ${repo.name}@${repo.version}`);
const tarballName = execFileSync('npm', ['pack', '--silent', '--pack-destination', packed], {
	cwd: root,
	encoding: 'utf8',
	shell: process.platform === 'win32',
})
	.trim()
	.split(/\r?\n/)
	.pop();

if (!tarballName) throw new Error('npm pack produced no tarball name');

const tarball = join(packed, tarballName);
done(`packed ${tarballName} (${readFileSync(tarball).length} bytes)`);

// ── A packed Starlight consumer: the playground, installed from the tarball ──
// Copying `playground/` rather than hand-writing a page means the *full* smoke
// suite — diagrams, icons, highlighting, placeholder, i18n — runs against what a
// user installs, not against this repository's self-reference.
const site = join(work, 'site');

cpSync(join(root, 'playground'), site, {
	recursive: true,
	// Build output, generated types and the dev cache, if the playground ran here.
	filter: (source) => !/[\\/](node_modules|dist|\.astro)([\\/]|$)/.test(source),
});

// The playground names `playground-external` (`projects: { external: '../playground-external' }`),
// a LikeC4 project beside it with an `@` image alias outside any `public/`. Copy it to the same
// place relative to the site, so the packed consumer proves named projects and alias icons too.
cpSync(join(root, 'playground-external'), join(work, 'playground-external'), { recursive: true });

// The playground's tsconfig type-checks `../src`, which has no counterpart in a copy.
const siteTsconfig = join(site, 'tsconfig.json');
writeFileSync(siteTsconfig, readFileSync(siteTsconfig, 'utf8').replace(/,\s*"\.\.\/src\/\*\*\/\*"/, ''));

// The peer range the package publishes is what a user would install; take the
// versions this repository itself builds against, so the test cannot drift.
const peers = repo.peerDependencies;
const siteManifest = {
	name: 'astroc4-site-test',
	private: true,
	type: 'module',
	dependencies: {
		...Object.fromEntries(
			Object.keys(peers)
				.filter((name) => name !== repo.name)
				.map((name) => [name, repo.devDependencies[name] ?? peers[name]]),
		),
		[repo.name]: `file:${tarball}`,
	},
	devDependencies: runCheck
		? { '@astrojs/check': repo.devDependencies['@astrojs/check'], typescript: repo.devDependencies.typescript }
		: {},
};

writeFileSync(join(site, 'package.json'), `${JSON.stringify(siteManifest, null, 2)}\n`);


// ── Install and build ───────────────────────────────────────────────────────
step('Installing the consumer site (registry + packed tarball)');
run('bun', ['install'], { cwd: site });
done(`installed ${Object.keys(siteManifest.dependencies).length} dependencies`);

// What the tarball must carry, now that it is installed: the built entry points,
// their declarations, the two grammar data files (`offline: true` reads them
// from `dist/` at runtime — a missing copy would only fail for sites that
// cannot reach GitHub), and the components as source.
step('Checking the installed package');
for (const file of [
	'dist/index.js',
	'dist/index.d.ts',
	'dist/integration.js',
	'dist/integration.d.ts',
	'dist/expressive-code.js',
	'dist/expressive-code.d.ts',
	'dist/likec4.tmLanguage.json',
	'dist/like-c4.langium',
	'src/components/LikeC4View.astro',
	'src/components/LikeC4Fence.astro',
	'src/components/labels.ts',
	// `labels.ts` imports it, so it has to ship: the components are published as
	// source and compiled by the site.
	'src/translations.ts',
]) {
	if (!existsSync(join(site, 'node_modules', repo.name, file))) {
		failures.push(`the tarball is missing ${file}`);
	}
}

if (runCheck) {
	step('Type-checking the consumer site');
	// `node`, not `bun x`: Astro enforces its `engines` range against
	// `process.version`, and Bun reports an emulated Node version there (22.23.3
	// under Bun 1.4), which Astro refuses as soon as it raises its floor. A real
	// consumer site runs the CLI under Node, so the test does too.
	run('node', [astroCli(site), 'check'], { cwd: site });
	done('astro check passed against the installed package');
}

step('Building the consumer site');
run('node', [astroCli(site), 'build'], { cwd: site });

// ── Assertions on the built HTML ────────────────────────────────────────────
const html = readFileSync(join(site, 'dist', 'index.html'), 'utf8');

/** Distinct Shiki colour variables inside a `<pre data-language="…">` block. */
function coloursOf(source: string, language: string): number | undefined {
	const block = new RegExp(`<pre data-language="${language}"[^>]*>([\\s\\S]*?)</pre>`).exec(source);
	if (!block) return undefined;

	const body = block[1] ?? '';

	return new Set([...body.matchAll(/--0:(#[0-9A-Fa-f]{3,8})/g)].map((match) => match[1]?.toLowerCase())).size;
}

// Astro scopes component styles, so the class attribute carries a hash:
// match the class *list*, not `class="likec4-frame"`, and not the CSS, which
// also contains the name.
const framesIn = (source: string): number =>
	(source.match(/class="[^"]*\blikec4-frame\b[^"]*"/g) ?? []).length;

const frames = framesIn(html);
if (frames !== 5) failures.push(`expected the playground's 5 diagrams on /, found ${frames}`);
else done(`the packed site's home page has ${frames} diagrams`);

const fenceFrames = framesIn(readFileSync(join(site, 'dist', 'fences', 'index.html'), 'utf8'));
if (fenceFrames !== 3) failures.push(`expected 3 diagrams on /fences/, found ${fenceFrames}`);
else done(`/fences/ has ${fenceFrames} diagrams`);

// ── The smoke suite, against the packed site ────────────────────────────────
// Everything above is build output, and a green build is not proof that a
// diagram renders. This is the browser — hydration, node drawing, icons,
// highlighting colours, the loading placeholder, both locales — running against
// the *installed* package on a preview server, i.e. what a user gets.
if (hydrate) {
	step('Running the smoke suite against the packed site');

	let smokeServer: DevServer | undefined;

	try {
		smokeServer = await startServer(site, { mode: 'preview' });
		run('bun', ['scripts/smoke.ts', smokeServer.url], { cwd: root });
		done('the smoke suite passed against the packed tarball');
	} catch (error) {
		// `smoke.ts` has already printed which assertions failed.
		failures.push(`smoke suite against the packed site: ${(error as Error).message.split('\n')[0]}`);
	} finally {
		await smokeServer?.stop();
	}
} else {
	console.log('· skipped the smoke suite (--no-hydrate)');
}

// ── A plain-Astro consumer, with no Starlight at all ────────────────────────
// `examples/astro` is copied in, installed and built: the checked-in example is
// literally the thing under test, so it cannot rot. This is the fixture for the
// `@purview-dev/astroc4/integration` entry point — components whose
// `Astro.locals.t` falls back to English, and chrome styled from the components'
// own fallbacks rather than Starlight's `--sl-color-*` tokens.
const plain = join(work, 'astro-site');

step('Scaffolding the plain-Astro consumer (no Starlight)');

cpSync(join(root, 'examples', 'astro'), plain, {
	recursive: true,
	// Build output and generated types, if the example was run in the repo.
	filter: (source) => !/[\\/](dist|\.astro)([\\/]|$)/.test(source),
});

// The example's `tsconfig.json` also type-checks the package source (see the
// comment there). Those paths do not exist beside a copy, so drop them.
const plainTsconfig = join(plain, 'tsconfig.json');
writeFileSync(
	plainTsconfig,
	readFileSync(plainTsconfig, 'utf8').replace(
		/, "..\/..\/src\/components\/\*\*\/\*", "..\/..\/src\/types\.d\.ts"/,
		'',
	),
);

writeFileSync(
	join(plain, 'package.json'),
	`${JSON.stringify(
		{
			name: 'astroc4-astro-site-test',
			private: true,
			type: 'module',
			dependencies: {
				'@astrojs/markdown-satteri': repo.devDependencies['@astrojs/markdown-satteri'],
				'@astrojs/mdx': repo.devDependencies['@astrojs/mdx'],
				'@astrojs/react': repo.devDependencies['@astrojs/react'],
				'@likec4/core': repo.devDependencies['@likec4/core'],
				astro: repo.devDependencies.astro,
				'astro-expressive-code': repo.devDependencies['astro-expressive-code'],
				likec4: repo.devDependencies.likec4,
				react: repo.devDependencies.react,
				'react-dom': repo.devDependencies['react-dom'],
				[repo.name]: `file:${tarball}`,
			},
			devDependencies: runCheck
				? { '@astrojs/check': repo.devDependencies['@astrojs/check'], typescript: repo.devDependencies.typescript }
				: {},
		},
		null,
		2,
	)}\n`,
);

step('Installing the plain-Astro site (registry + packed tarball)');
run('bun', ['install'], { cwd: plain });
done('installed the Astro-only dependencies');

if (runCheck) {
	step('Type-checking the plain-Astro site');
	run('node', [astroCli(plain), 'check'], { cwd: plain });
	done('astro check passed without Starlight’s App.Locals');
}

step('Building the plain-Astro site');
run('node', [astroCli(plain), 'build'], { cwd: plain });

const plainHtml = readFileSync(join(plain, 'dist', 'index.html'), 'utf8');
const plainFrames = framesIn(plainHtml);

// The island, then the inline fence: no Starlight page structure to count.
if (plainFrames !== 2) failures.push(`plain Astro: expected 2 diagrams, found ${plainFrames}`);
else done(`plain Astro rendered the island and the fence (${plainFrames} diagrams)`);

if (/<pre data-language="likec4"/.test(plainHtml)) {
	failures.push('plain Astro: a ```likec4 fence survived as a code block');
} else {
	done('plain Astro: the ```likec4 fence became a diagram');
}

const plainC4Colours = coloursOf(plainHtml, 'c4');

// Highlighting there is the site's own `expressiveCode({ shiki })`, not the plugin's.
if (!plainC4Colours || plainC4Colours < 4) {
	failures.push(`plain Astro: \`\`\`c4 highlighted in ${plainC4Colours ?? 0} colours, expected ≥ 4`);
} else {
	done(`plain Astro: \`\`\`c4 highlighted by likec4Language (${plainC4Colours} colours)`);
}

if (!plainHtml.includes('Alpha')) failures.push('plain Astro: the fence’s model is missing the "Alpha" node');

if (hydrate) {
	step('Checking that the plain-Astro island hydrates on its dev server');

	let server: DevServer | undefined;

	try {
		server = await startServer(plain);

		const { nodes, failures: hydrationFailures } = await checkHydration(server.url, {
			expected: 2,
			// `Reader` is the project model's element: it only appears once the
			// island has loaded `likec4:model` in the browser.
			labels: ['Reader'],
			// Starlight's tokens are absent here, so this asserts the components'
			// fallbacks actually styled the frame.
			styling: true,
			// examples/astro/src/styles/site.css sets it on :root.
			accent: 'rgb(0, 70, 190)',
		});

		if (hydrationFailures.length > 0) {
			failures.push(...hydrationFailures.map((failure) => `plain Astro dev server: ${failure}`));
		} else {
			done(`plain Astro: <LikeC4View> hydrated and drew ${nodes} nodes`);
		}
	} catch (error) {
		const message = (error as Error).message;

		failures.push(
			/executable doesn't exist|playwright/i.test(message)
				? `plain Astro dev server: ${message} (run \`bunx playwright install chromium\`)`
				: `plain Astro dev server: ${message}`,
		);
	} finally {
		await server?.stop();
	}
} else {
	console.log('· skipped the plain-Astro hydration check (--no-hydrate)');
}

// ── The shape `astro add` writes ────────────────────────────────────────────
// `astro add` imports the default export into `integrations`, which has to
// render the same diagrams. Runs after the hydration check, which tests the
// documented `./integration` shape.
step('Rebuilding the plain-Astro site in the shape `astro add` writes');

writeFileSync(
	join(plain, 'astro.config.ts'),
	[
		"import { defineConfig } from 'astro/config';",
		"import mdx from '@astrojs/mdx';",
		"import react from '@astrojs/react';",
		"import expressiveCode from 'astro-expressive-code';",
		"import astroc4 from '@purview-dev/astroc4';",
		"import { likec4Language } from '@purview-dev/astroc4/expressive-code';",
		'',
		'export default defineConfig({',
		'\tintegrations: [astroc4(), expressiveCode({ shiki: { langs: [likec4Language] } }), mdx(), react()],',
		'});',
		'',
	].join('\n'),
);

run('node', [astroCli(plain), 'build'], { cwd: plain });

const addHtml = readFileSync(join(plain, 'dist', 'index.html'), 'utf8');
const addFrames = framesIn(addHtml);

if (addFrames !== 2) {
	failures.push(`\`astro add\` shape: expected 2 diagrams, found ${addFrames}`);
} else {
	done('`astro add`’s `integrations: [astroc4()]` renders diagrams');
}

if (/<pre data-language="likec4"/.test(addHtml)) {
	failures.push('`astro add` shape: a ```likec4 fence survived as a code block');
}

// ── Result ──────────────────────────────────────────────────────────────────
if (keep) console.log(`\n· kept the consumer site at ${site}`);
else {
	try {
		rmSync(work, { recursive: true, force: true });
	} catch (error) {
		// Windows can still hold the dev server's handles for a moment; the
		// assertions above are what the run is about.
		console.warn(`· could not remove the temp site (${(error as Error).message}) — it is at ${work}`);
	}
}

if (failures.length > 0) {
	console.error(`\n✗ ${failures.length} failure(s) in the consumer site:`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\n✓ Packed package builds real Starlight and plain-Astro sites, and their diagrams hydrate.');

