// test-site.mjs
// path: scripts/test-site.mjs
// Builds a *consumer* Starlight site from the packed tarball: `npm pack`, a
// throwaway site outside this repository, `bun install` from the registry,
// `astro build`, then assertions on the generated HTML.
//
// The playground proves the plugin works from source. This proves the thing
// that actually ships works once installed — the package boundary (exports,
// `files`, declaration files, peer dependencies) is exactly where "works in the
// repo" and "works for a user" diverge.
//
//   bun run test:site              # build and assert
//   bun run test:site --keep       # keep the temp site for debugging
//   bun run test:site --no-check   # skip the consumer `astro check`
//
// Network: the site installs packages and the plugin resolves the grammar from
// likec4/likec4, so this is not hermetic. Set ASTROC4_OFFLINE=1 to use the
// bundled grammar instead (CI does not, on purpose: the fetch is part of what
// is being tested).

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const runCheck = !args.includes('--no-check');

const failures = [];
const step = (message) => console.log(`\n» ${message}`);
const done = (message) => console.log(`✓ ${message}`);

/** Run a command, echoing it, with the temp site as the working directory. */
function run(command, commandArgs, options = {}) {
	execFileSync(command, commandArgs, {
		cwd: options.cwd ?? root,
		stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
		encoding: 'utf8',
		env: { ...process.env, ...options.env },
		shell: process.platform === 'win32',
	});
}

// ── Pack ────────────────────────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'astroc4-site-'));
const packed = join(work, 'packed');
mkdirSync(packed);

step(`Packing ${repo.name}@${repo.version}`);
const tarballName = execFileSync('npm', ['pack', '--silent', '--pack-destination', packed], {
	cwd: root,
	encoding: 'utf8',
	shell: process.platform === 'win32',
}).trim().split(/\r?\n/).pop();

const tarball = join(packed, tarballName);
done(`packed ${tarballName} (${readFileSync(tarball).length} bytes)`);

// ── Scaffold a consumer site ────────────────────────────────────────────────
const site = join(work, 'site');
const src = join(site, 'src');

for (const directory of [src, join(src, 'content', 'docs'), join(src, 'likec4')]) {
	mkdirSync(directory, { recursive: true });
}

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

writeFileSync(
	join(site, 'tsconfig.json'),
	`${JSON.stringify(
		{
			extends: 'astro/tsconfigs/strict',
			compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react', resolveJsonModule: true },
			include: ['.astro/types.d.ts', '**/*'],
			exclude: ['dist'],
		},
		null,
		2,
	)}\n`,
);

writeFileSync(
	join(site, 'astro.config.mjs'),
	`import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

import astroc4 from '${repo.name}';

// No ec.config.mjs: zero-configuration highlighting is the claim under test.
export default defineConfig({
	integrations: [starlight({ title: 'astroc4 site test', plugins: [astroc4()] }), react()],
});
`,
);

writeFileSync(
	join(src, 'content.config.ts'),
	`import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }) };
`,
);

writeFileSync(
	join(src, 'likec4', 'demo.c4'),
	`specification {
  element system
  element person
}
model {
  reader = person 'Reader'
  docs = system 'Docs site'
  reader -> docs 'reads'
}
views {
  view index { include * }
}
`,
);

writeFileSync(
	join(src, 'likec4', 'likec4.config.json'),
	`{ "name": "site-test", "title": "astroc4 site test" }\n`,
);

// Nothing here is imported at runtime; it exists so the consumer's `astro
// check` resolves the declaration file for `@purview-dev/astroc4/expressive-code` (and the
// `shiki` types it refers to) from an installed package.
writeFileSync(
	join(src, 'types-probe.ts'),
	`import { likec4Language } from '${repo.name}/expressive-code';

export const probe: string = likec4Language.name;
`,
);

// The page exercises every entry point: a component island, an inline fence, a
// project view fence, and code that must stay code.
writeFileSync(
	join(src, 'content', 'docs', 'index.mdx'),
	`---
title: Consumer site test
description: A real Starlight site built against the packed astroc4 tarball.
---

import { Code } from '@astrojs/starlight/components';
import LikeC4View from '${repo.name}/components/LikeC4View.astro';

<LikeC4View viewId="index" height={240} />

\`\`\`likec4 title="Inline" height=200
specification { element box }
model {
  a = box 'Alpha'
  b = box 'Beta'
  a -> b 'calls'
}
views { view index { include * } }
\`\`\`

\`\`\`likec4 view="index" title="From the model" height=200
\`\`\`

\`\`\`c4
specification {
  color brand #0046BE
  element system { style { shape agent color brand } }
}
\`\`\`

<Code code={"model {\\n  app = system 'App'\\n}"} lang="likec4" />
`,
);

// ── Install and build ───────────────────────────────────────────────────────
step('Installing the consumer site (registry + packed tarball)');
run('bun', ['install'], { cwd: site });
done(`installed ${Object.keys(siteManifest.dependencies).length} dependencies`);

if (runCheck) {
	step('Type-checking the consumer site');
	run('bun', ['x', 'astro', 'check'], { cwd: site });
	done('astro check passed against the installed package');
}

step('Building the consumer site');
run('bun', ['x', 'astro', 'build'], { cwd: site });

// ── Assertions on the built HTML ────────────────────────────────────────────
const html = readFileSync(join(site, 'dist', 'index.html'), 'utf8');

/** Distinct Shiki colour variables inside a `<pre data-language="…">` block. */
function coloursOf(language) {
	const block = new RegExp(`<pre data-language="${language}"[^>]*>([\\s\\S]*?)</pre>`).exec(html);
	if (!block) return undefined;

	return new Set([...block[1].matchAll(/--0:(#[0-9A-Fa-f]{3,8})/g)].map((match) => match[1].toLowerCase())).size;
}

// Astro scopes component styles, so the class attribute carries a hash:
// match the class *list*, not `class="likec4-frame"`, and not the CSS, which
// also contains the name.
const frames = (html.match(/class="[^"]*\blikec4-frame\b[^"]*"/g) ?? []).length;
if (frames !== 3) failures.push(`expected 3 diagrams (one island, two fences), found ${frames}`);
else done(`the island and both fences rendered (${frames} diagrams)`);

// The ```likec4 fence must not survive as a highlighted block; the only
// `likec4`-language block on the page is the explicit <Code>.
const likec4Blocks = (html.match(/<pre data-language="likec4"/g) ?? []).length;
if (likec4Blocks !== 1) failures.push(`expected 1 <Code lang="likec4"> block, found ${likec4Blocks}`);
else done('```likec4 fences became diagrams, not code blocks');

const c4Colours = coloursOf('c4');
if (!c4Colours || c4Colours < 4) failures.push(`\`\`\`c4 highlighted in ${c4Colours ?? 0} colours, expected ≥ 4`);
else done(`\`\`\`c4 highlighted (${c4Colours} colours)`);

const likec4Colours = coloursOf('likec4');
if (!likec4Colours || likec4Colours < 4) {
	failures.push(`<Code lang="likec4"> highlighted in ${likec4Colours ?? 0} colours, expected ≥ 4`);
} else {
	done(`<Code lang="likec4"> highlighted (${likec4Colours} colours)`);
}

for (const label of ['Alpha', 'Beta', 'calls']) {
	// The fence embeds the layouted model as a serialised island prop, so the
	// label reaches the HTML escaped — match the text, not the quoting.
	if (!html.includes(label)) failures.push(`the inline fence's model is missing the "${label}" node`);
}

if (!failures.some((failure) => failure.includes('inline fence'))) {
	done('the inline fence compiled and laid out at build time');
}

// ── Result ──────────────────────────────────────────────────────────────────
if (keep) console.log(`\n· kept the consumer site at ${site}`);
else rmSync(work, { recursive: true, force: true });

if (failures.length > 0) {
	console.error(`\n✗ ${failures.length} failure(s) in the consumer site:`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\n✓ Packed package builds a real Starlight site.');

