import { type BundledLanguage, createHighlighter } from 'shiki';
import { beforeAll, describe, expect, it } from 'vitest';

import { likec4Language } from '../expressive-code.mjs';

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

let highlighter: Highlighter;

beforeAll(async () => {
	// A real theme: with `none`, Shiki merges the whole line into one token.
	highlighter = await createHighlighter({ themes: ['github-dark'], langs: [likec4Language] });
});

/** The innermost scope of every token whose text is exactly `text`. */
function scopesOf(source: string, text: string): string[] {
	const lines = highlighter.codeToTokensBase(source, {
		// Loaded via `langs` above; the type only lists Shiki's bundled ids.
		lang: 'likec4' as BundledLanguage,
		theme: 'github-dark',
		includeExplanation: true,
	});

	return lines
		.flat()
		.flatMap((token) => token.explanation ?? [])
		.filter((part) => part.content.trim() === text)
		.map((part) => part.scopes.at(-1)?.scopeName ?? '');
}

describe('likec4Language', () => {
	it('registers under `likec4` with a `c4` alias', () => {
		expect(likec4Language.name).toBe('likec4');
		expect(likec4Language.scopeName).toBe('source.likec4');
		expect(likec4Language.aliases).toContain('c4');
	});

	it('scopes declarations, references and values', () => {
		const source = [
			'specification {',
			'  color testingBlue #0046BE',
			'  element system { style { shape rectangle color testingBlue } }',
			'  tag tls { color red }',
			'}',
		].join('\n');

		expect(scopesOf(source, 'specification')).toEqual(['keyword.control.block.likec4']);
		expect(scopesOf(source, '#0046BE')).toEqual(['constant.other.color.rgb-value.hex.likec4']);
		expect(scopesOf(source, 'system')).toEqual(['entity.name.type.likec4']);
		expect(scopesOf(source, 'tls')).toEqual(['entity.name.type.likec4']);
		expect(scopesOf(source, 'rectangle')).toEqual(['constant.language.likec4']);
		// Declared once, then only referred to inside the style block.
		expect(scopesOf(source, 'testingBlue')).toEqual([
			'entity.name.type.likec4',
			'source.likec4',
		]);
	});

	it('scopes the model: definitions, tags, icons, typed arrows and strings', () => {
		const source = [
			'model {',
			"  app = container 'web-app' {",
			'    #compute',
			'    icon tech:cloudflare-workers',
			"    description '''",
			'    multi-line',
			"    '''",
			'  }',
			"  reader -[https]-> app 'GET /'",
			'}',
		].join('\n');

		expect(scopesOf(source, 'app')[0]).toBe('variable.other.definition.likec4');
		expect(scopesOf(source, 'container')).toEqual(['entity.name.type.likec4']);
		expect(scopesOf(source, '#compute')).toEqual(['entity.name.tag.likec4']);
		expect(scopesOf(source, 'cloudflare-workers')).toEqual([
			'support.constant.icon.likec4',
		]);
		expect(scopesOf(source, 'https')).toEqual(['entity.name.type.relationship.likec4']);
		expect(scopesOf(source, 'multi-line')).toEqual(['string.quoted.triple.likec4']);
	});

	it('does not mistake a `where tag is` predicate for a tag declaration', () => {
		const source = 'include cloud.** where tag is #observability';

		expect(scopesOf(source, 'tag')).toEqual(['support.type.property-name.likec4']);
		expect(scopesOf(source, 'is')).toEqual(['keyword.operator.word.likec4']);
		expect(scopesOf(source, '#observability')).toEqual(['entity.name.tag.likec4']);
	});

	it('scopes view declarations', () => {
		const source = 'views { dynamic view firstRequest { } deployment view prod { } }';

		expect(scopesOf(source, 'firstRequest')).toEqual(['entity.name.function.view.likec4']);
		expect(scopesOf(source, 'dynamic')).toEqual(['storage.modifier.likec4']);
		expect(scopesOf(source, 'deployment')).toEqual(['storage.modifier.likec4']);
	});
});
