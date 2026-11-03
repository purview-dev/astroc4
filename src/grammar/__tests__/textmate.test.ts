import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseLangium } from '../langium.mjs';
import { buildTmLanguage, LANGUAGE_ALIASES, LANGUAGE_NAME, SCOPE_NAME } from '../textmate.mjs';

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), 'utf8');

const v1 = parseLangium(fixture('mini.langium'));
const v2 = parseLangium(fixture('mini.v2.langium'));

const grammarOf = (vocabulary: typeof v1) => buildTmLanguage(vocabulary);

/** `repository.keywords.patterns` entry by scope. */
function keywordPattern(grammar: Record<string, any>, scope: string): string {
	const pattern = grammar.repository.keywords.patterns.find((entry: any) => entry.name === scope);

	return pattern?.match ?? '';
}

/** Every string that TextMate would compile as a regex. */
function regexesIn(value: unknown, found: string[] = []): string[] {
	if (typeof value === 'string') return found;
	if (Array.isArray(value)) {
		for (const item of value) regexesIn(item, found);
		return found;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			if (['match', 'begin', 'end'].includes(key) && typeof child === 'string') found.push(child);
			else regexesIn(child, found);
		}
	}

	return found;
}

describe('buildTmLanguage', () => {
	it('produces a grammar Shiki can register', () => {
		const grammar = grammarOf(v1);

		expect(grammar.scopeName).toBe(SCOPE_NAME);
		expect(grammar.name).toBe(LANGUAGE_NAME);
		expect(grammar.fileTypes).toEqual(['c4', 'likec4']);
		expect(grammar.patterns).toEqual([{ include: '#everything' }]);
		expect(Object.keys(grammar.repository)).toEqual(
			expect.arrayContaining(['comments', 'strings', 'icons', 'declarations', 'keywords', 'operators']),
		);

		// `aliases` belong to the Shiki registration, not the TextMate file.
		expect(grammar).not.toHaveProperty('aliases');
		expect(LANGUAGE_ALIASES).toContain('c4');
	});

	it('is plain JSON, because Expressive Code round-trips it for <Code>', () => {
		const grammar = grammarOf(v2);
		const walk = (value: unknown): void => {
			if (value === null || typeof value === 'string' || typeof value === 'number') return;
			if (typeof value === 'boolean') return;

			expect(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype).toBe(true);

			for (const child of Object.values(value as object)) walk(child);
		};

		walk(grammar);
		expect(JSON.parse(JSON.stringify(grammar))).toEqual(grammar);
	});

	it('only emits regexes that compile', () => {
		const grammar = grammarOf(v2);

		expect(regexesIn(grammar).length).toBeGreaterThan(20);

		for (const regex of regexesIn(grammar)) {
			expect(() => new RegExp(regex), regex).not.toThrow();
		}
	});

	it('is deterministic', () => {
		expect(grammarOf(v2)).toEqual(grammarOf(v2));
	});

	it('records provenance only when it is known', () => {
		expect(grammarOf(v1)).not.toHaveProperty('$generated');

		const grammar = grammarOf(v1);
		const withMeta = buildTmLanguage(v1, { repo: 'likec4/likec4', ref: 'v1.59.4', sha: 'abc123' });

		expect(withMeta.$generated).toEqual({
			repo: 'likec4/likec4',
			ref: 'v1.59.4',
			sha: 'abc123',
			by: 'astroc4/scripts/sync-grammar.mjs',
		});
		expect(grammar.$generated).toBeUndefined();
	});

	it('takes the word lists from the grammar it was given', () => {
		// Shapes, colours and line options are all closed value domains, so they
		// share the `constant.language` pattern — and `agent` only appears in v2.
		expect(keywordPattern(grammarOf(v1), 'constant.language.likec4')).toBe(
			'\\b(?:blue|cylinder|dashed|none|rectangle|red|solid)\\b',
		);
		expect(keywordPattern(grammarOf(v2), 'constant.language.likec4')).toBe(
			'\\b(?:agent|blue|cylinder|dashed|none|rectangle|red|solid)\\b',
		);
		expect(keywordPattern(grammarOf(v1), 'keyword.control.block.likec4')).toBe('\\b(?:model)\\b(?=\\s*\\{)');
		expect(keywordPattern(grammarOf(v2), 'keyword.control.block.likec4')).toBe(
			'\\b(?:model|views)\\b(?=\\s*\\{)',
		);
		expect(keywordPattern(grammarOf(v1), 'support.type.property-name.likec4')).toBe(
			'\\b(?:description|kind|tag|title)\\b',
		);
	});

	it('keeps word operators ahead of the keyword list that repeats them', () => {
		const grammar = buildTmLanguage(parseLangium(readFileSync(new URL('../like-c4.langium', import.meta.url), 'utf8')));
		const scopes = (grammar.repository.keywords.patterns as { name: string }[]).map((entry) => entry.name);

		expect(scopes.indexOf('keyword.operator.word.likec4')).toBeLessThan(
			scopes.indexOf('keyword.control.likec4'),
		);
	});

	it('escapes relationship connectors and tries longer ones first', () => {
		const grammar = grammarOf(v1);

		expect(grammar.repository.operators.patterns[0].match).toBe('\\]<->|\\]->|<->|->');
	});

	it('falls back to known icon packs when the terminal yields none', () => {
		const grammar = buildTmLanguage({ ...v1, icons: [] });

		expect(grammar.repository.icons.match).toContain('aws|azure|bootstrap|gcp|tech');
	});

	it('omits a pattern rather than emitting an empty alternation', () => {
		const grammar = buildTmLanguage({ ...v1, properties: [], enums: {}, blocks: [] });

		expect(keywordPattern(grammar, 'keyword.control.block.likec4')).toBe('');
		expect(keywordPattern(grammar, 'support.type.property-name.likec4')).toBe('');
		expect(keywordPattern(grammar, 'constant.language.likec4')).toBe('');
	});
});
