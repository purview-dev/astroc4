// sync-grammar.mjs
// path: scripts/sync-grammar.mjs
// Regenerates the LikeC4 syntax highlighting artefacts shipped with astroc4
// from the live Langium grammar:
//
//   src/grammar/like-c4.langium        snapshot, so builds work offline
//   src/grammar/likec4.tmLanguage.json generated TextMate grammar
//
//   bun run grammar:sync                 # likec4/likec4@main
//   bun run grammar:sync --ref v1.59.4   # any branch, tag or commit
//   bun run grammar:sync --check         # fail if the snapshot is stale
//
// `--check` is the drift gate: it re-derives from the committed snapshot and
// compares with the committed JSON, so a change to the derivation that is not
// accompanied by a regenerated snapshot fails `bun run test` and CI.

import { readFile, writeFile } from 'node:fs/promises';

import { parseLangium } from '../src/grammar/langium.js';
import {
	DEFAULT_REF,
	DEFAULT_REPO,
	fetchLangiumSource,
	grammarSha,
	validateRef,
} from '../src/grammar/source.js';
import { buildTmLanguage } from '../src/grammar/textmate.js';

const LANGIUM_FILE = new URL('../src/grammar/like-c4.langium', import.meta.url);
const GRAMMAR_FILE = new URL('../src/grammar/likec4.tmLanguage.json', import.meta.url);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(usage());
	process.exit(0);
}

const check = args.includes('--check');
const ref = argument('--ref') ?? DEFAULT_REF;
const repo = argument('--repo') ?? DEFAULT_REPO;

try {
	validateRef(ref);
} catch (error) {
	console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}

if (check) {
	await verify();
} else {
	await sync();
}

/**
 * Derive from the committed snapshot and compare with the committed JSON.
 * With `--ref` it also checks the snapshot against the live ref, which is how
 * a maintainer notices that upstream has moved on.
 */
async function verify() {
	const langium = await readFile(LANGIUM_FILE, 'utf8');
	const committed = JSON.parse(await readFile(GRAMMAR_FILE, 'utf8'));
	const generated = buildTmLanguage(parseLangium(langium), provenance(committed, { repo, ref }));

	const differences = diff(committed, generated);

	if (differences.length > 0) {
		console.error('✗ src/grammar/likec4.tmLanguage.json is out of date:');

		for (const difference of differences) console.error(`  - ${difference}`);

		console.error('\nRun `bun run grammar:sync` and commit the result.');
		process.exit(1);
	}

	console.log(`✓ grammar snapshot matches its derivation (${grammarSha(langium)}, ref ${ref})`);

	// Informational only: the parity above is the gate, and it has to pass
	// without network access.
	try {
		const live = await fetchLangiumSource({ repo, ref });

		if ('notModified' in live) return;

		if (grammarSha(live.text) !== grammarSha(langium)) {
			console.log(
				`· ${repo}@${ref} has moved (${grammarSha(live.text)} vs ${grammarSha(langium)}) — ` +
					'run `bun run grammar:sync` to pick it up',
			);
		}
	} catch (error) {
		console.log(`· could not check ${repo}@${ref}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** Fetch, then write the snapshot and the generated grammar. */
async function sync() {
	const source = await fetchLangiumSource({ repo, ref });
	const langium = 'notModified' in source ? await readFile(LANGIUM_FILE, 'utf8') : source.text;

	const before = JSON.parse(await readFile(GRAMMAR_FILE, 'utf8').catch(() => '{}'));
	const generated = buildTmLanguage(parseLangium(langium), {
		repo,
		ref,
		sha: grammarSha(langium),
	});

	await writeFile(LANGIUM_FILE, langium, 'utf8');
	await writeFile(GRAMMAR_FILE, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');

	const vocabulary = parseLangium(langium);
	console.log(`✓ ${repo}@${ref} (${grammarSha(langium)})`);
	console.log(
		`  ${vocabulary.ruleCount} rules · ${vocabulary.blocks.length} blocks · ` +
			`${vocabulary.keywords.length} keywords · ${vocabulary.properties.length} properties · ` +
			`${Object.keys(vocabulary.enums).length} value domains`,
	);

	const differences = diff(before, generated);

	if (differences.length > 0) {
		console.log('  changed:');
		for (const difference of differences) console.log(`  - ${difference}`);
	}
}

/** The provenance to record in the generated grammar. */
function provenance(
	committed: { $generated?: { repo?: string; ref?: string; sha?: string } },
	fallback: { repo: string; ref: string },
): { repo: string; ref: string; sha: string | undefined } {
	const generated = committed.$generated;

	return {
		repo: generated?.repo ?? fallback.repo,
		ref: generated?.ref ?? fallback.ref,
		sha: generated?.sha,
	};
}

/** Human-readable differences, so a regenerated snapshot is reviewable. */
function diff(before: unknown, after: unknown): string[] {
	const differences: string[] = [];
	const keywords = new Set(wordsOf(before));
	const next = new Set(wordsOf(after));

	const added = [...next].filter((word) => !keywords.has(word));
	const removed = [...keywords].filter((word) => !next.has(word));

	if (added.length > 0) differences.push(`+ ${added.join(', ')}`);
	if (removed.length > 0) differences.push(`- ${removed.join(', ')}`);

	return differences;
}

/** Every word inside a `match` alternation, for the diff above. */
function wordsOf(grammar: unknown): Set<string> {
	const source = JSON.stringify(grammar ?? {});
	const words = new Set<string>();

	for (const match of source.matchAll(/\\\\b\(\?:([^)]+)\)/g)) {
		for (const word of (match[1] ?? '').split('|')) {
			if (/^[A-Za-z_]\w*$/.test(word)) words.add(word);
		}
	}

	return words;
}

function argument(name: string): string | undefined {
	const index = args.indexOf(name);

	if (index === -1) return undefined;

	return args[index + 1];
}

function usage() {
	return [
		'Usage: bun run grammar:sync [--ref <branch|tag|sha>] [--repo <owner/name>] [--check]',
		'',
		'  --ref    LikeC4 ref to read the Langium grammar from (default: main)',
		'  --repo   Repository to read it from (default: likec4/likec4)',
		'  --check  Do not write; fail if the committed snapshot is stale',
	].join('\n');
}
