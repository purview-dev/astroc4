import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseLangium } from '../langium.mjs';

const fixture = (name: string) => readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), 'utf8');

/** The grammar shipped as a snapshot, i.e. whatever likec4/likec4@<ref> was. */
const snapshot = readFileSync(new URL('../like-c4.langium', import.meta.url), 'utf8');

describe('parseLangium over the LikeC4 grammar', () => {
	const vocabulary = parseLangium(snapshot);

	it('finds the blocks a site actually writes', () => {
		expect(vocabulary.blocks).toEqual(
			expect.arrayContaining(['specification', 'model', 'views', 'deployment', 'global', 'likec4lib', 'diff']),
		);
	});

	it('finds keywords, and does not repeat values or property names as keywords', () => {
		expect(vocabulary.keywords).toEqual(expect.arrayContaining(['element', 'view', 'import', 'extend', 'where']));
		// `rectangle` is an ElementShape value, `title` a property name.
		expect(vocabulary.keywords).not.toContain('rectangle');
		expect(vocabulary.keywords).not.toContain('title');
	});

	it('finds property names from `key=` assignments', () => {
		expect(vocabulary.properties).toEqual(
			expect.arrayContaining(['title', 'description', 'technology', 'link', 'descriptionFile', 'head', 'tail']),
		);
	});

	it('resolves value domains, including ones that inherit from another', () => {
		expect(vocabulary.enums.ElementShape).toEqual(expect.arrayContaining(['rectangle', 'person', 'agent']));
		expect(vocabulary.enums.ThemeColor).toEqual(expect.arrayContaining(['primary', 'blue', 'red']));
		// `BorderStyleValue: LineOptions | 'none'` inherits `LineOptions`.
		expect(vocabulary.enums.BorderStyleValue).toEqual(
			expect.arrayContaining(['none', 'solid', 'dashed', 'dotted']),
		);
	});

	it('does not mistake the `Id` catch-all rule for a value domain', () => {
		expect(vocabulary.enums).not.toHaveProperty('Id');
		expect(vocabulary.enums).not.toHaveProperty('HashId');
	});

	it('reads the relationship connectors, longest first', () => {
		expect(vocabulary.arrows).toEqual([']<->', ']->', '<->', '->']);
	});

	it('reads icon packs and booleans out of their terminals', () => {
		expect(vocabulary.icons).toEqual(expect.arrayContaining(['aws', 'azure', 'tech']));
		expect(vocabulary.booleans).toEqual(['false', 'true']);
	});

	it('reports how many rules it saw', () => {
		expect(vocabulary.ruleCount).toBeGreaterThan(100);
	});
});

describe('parseLangium across versions', () => {
	const v1 = parseLangium(fixture('mini.langium'));
	const v2 = parseLangium(fixture('mini.v2.langium'));

	it('reflects the version it was given', () => {
		expect(v1.enums.ElementShape).toEqual(['cylinder', 'rectangle']);
		expect(v2.enums.ElementShape).toEqual(['agent', 'cylinder', 'rectangle']);
		expect(v2.blocks).toContain('views');
		expect(v1.blocks).not.toContain('views');
	});

	it('keeps a block keyword out of the keyword list, and a shape out of it too', () => {
		expect(v2.blocks).toContain('model');
		expect(v2.keywords).not.toContain('model');
		expect(v2.keywords).not.toContain('agent');
	});

	it('finds inherited value domains', () => {
		expect(v2.enums.BorderStyleValue).toEqual(['dashed', 'none', 'solid']);
	});
});

describe('parseLangium robustness', () => {
	it('ignores comments, including ones inside strings and regexes', () => {
		const source = [
			'// a comment mentioning a blocked keyword: secretBlock',
			'grammar Tiny',
			'/** another comment with quoted text: \'notAKeyword\' */',
			'Model:',
			"  name='model' '{'",
			'    text=/\\/\\/ not a comment/',
			"    quoted='a // still in a string'",
			'  \'}\';',
			"terminal String: /\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'/;",
		].join('\n');

		const vocabulary = parseLangium(source);

		// `model` opens a block; neither the commented-out words nor the quoted
		// text inside a string or regex is a keyword.
		expect(vocabulary.blocks).toEqual(['model']);
		expect(vocabulary.keywords).toEqual([]);
	});

	it('handles CRLF and a rule that ends at end of file', () => {
		const source = "grammar Tiny\r\nModel:\r\n  name='model' '{'\r\n  '}'";

		expect(parseLangium(source).blocks).toEqual(['model']);
	});

	it('throws a useful error when the file is not a Langium grammar', () => {
		expect(() => parseLangium('<html>not a grammar</html>')).toThrow(/no Langium parser rules/);
		expect(() => parseLangium('')).toThrow(/no Langium parser rules/);
	});

	it('throws when there are rules but no keywords at all', () => {
		expect(() => parseLangium('interface FqnRef {\n  value: string;\n}')).toThrow(/no Langium parser rules/);
	});
});
