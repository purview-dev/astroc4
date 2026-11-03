// textmate.mjs
// path: src/grammar/textmate.mjs
// Builds the Shiki / TextMate grammar for LikeC4 out of the vocabulary read
// from the live Langium grammar (./langium.mjs).
//
// Two layers:
//   - generated — every word list: blocks, keywords, property names and closed
//     value domains. These are exactly the lists that go stale when the
//     language grows (`agent` was added to `ElementShape` after v1.59.4).
//   - structural — how LikeC4 source is *shaped* rather than which words it
//     uses: comments, quoted and triple-quoted strings, `#tag` vs `#hex`,
//     `tech:astro` icons, `-[https]->` arrows, `element system` declarations.
//     These are curated here because a Langium rule does not say how a token
//     should look, only that it is one.
//
// The result must stay plain JSON: Expressive Code JSON-round-trips integration
// options before the `<Code>` component renders them, and throws on functions
// or RegExp instances.

/** Scope name of the grammar, as upstream's VS Code extension uses it. */
export const SCOPE_NAME = 'source.likec4';

/** Shiki language id, plus the short alias used by ` ```c4 ` fences. */
export const LANGUAGE_NAME = 'likec4';
export const LANGUAGE_ALIASES = ['c4'];

const TMLANGUAGE_SCHEMA =
	'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json';

/**
 * Closed value domains: they colour as values, not as keywords.
 * Anything the grammar adds under these names is picked up automatically.
 */
const VALUE_DOMAINS = [
	'BorderStyleValue',
	'DynamicViewDisplayVariantValue',
	'EdgeRoutingValue',
	'ElementShape',
	'IconPositionValue',
	'LineOptions',
	'ArrowType',
	'RankValue',
	'SizeValue',
	'SizingValue',
	'ThemeColor',
	'ViewLayoutDirection',
];

/** Control-flow keywords read as keywords, not as a value domain. */
const KEYWORD_DOMAINS = ['DynamicViewFlowKeyword'];

/** `source` / `target` are the only value-like variables. */
const VARIABLE_DOMAINS = ['Participant'];

/** Operators whose scope is a word, kept curated: they are not all literals. */
const OPERATOR_WORDS = ['and', 'or', 'not', 'is'];

/** Used when the grammar cannot be read — never expected, never silent. */
const FALLBACK_ICON_PACKS = ['aws', 'azure', 'bootstrap', 'gcp', 'tech'];

/**
 * @typedef {object} TmPattern
 * @property {string} [name]
 * @property {string} [comment]
 * @property {string} [include]
 * @property {string} [match]
 * @property {string} [begin]
 * @property {string} [end]
 * @property {string} [contentName]
 * @property {Record<string, { name: string }>} [captures]
 * @property {Record<string, { name: string }>} [beginCaptures]
 * @property {Record<string, { name: string }>} [endCaptures]
 * @property {TmPattern[]} [patterns]
 */

/**
 * A TextMate grammar: JSON all the way down, never a `RegExp`.
 * @typedef {object} TmGrammar
 * @property {string} $schema
 * @property {string} name
 * @property {string} displayName
 * @property {string} scopeName
 * @property {string[]} fileTypes
 * @property {TmPattern[]} patterns
 * @property {Record<string, any>} repository
 * @property {{ repo: string, ref: string, sha?: string, by: string }} [$generated]
 */

/**
 * @param {import('./langium.mjs').Vocabulary} vocabulary
 * @param {{ repo?: string, ref?: string, sha?: string }} [meta] Provenance.
 * @returns {TmGrammar} A TextMate grammar, JSON-serialisable.
 */
export function buildTmLanguage(vocabulary, meta = {}) {
	const control = uniqueDomain(vocabulary, KEYWORD_DOMAINS);
	const variables = uniqueDomain(vocabulary, VARIABLE_DOMAINS);
	const icons = vocabulary.icons.length > 0 ? vocabulary.icons : FALLBACK_ICON_PACKS;

	// Words that are always syntax, never the name of a kind: `deployed =
	// instanceOf a` must not paint `instanceOf` as a type.
	const reserved = alternationOf([...vocabulary.keywords, ...vocabulary.blocks, ...control]);

	/** @type {TmGrammar} */
	const grammar = {
		$schema: TMLANGUAGE_SCHEMA,
		...(meta.repo && meta.ref
			? {
					$generated: {
						repo: meta.repo,
						ref: meta.ref,
						...(meta.sha ? { sha: meta.sha } : {}),
						by: 'astroc4/scripts/sync-grammar.mjs',
					},
				}
			: {}),
		name: LANGUAGE_NAME,
		displayName: 'LikeC4',
		scopeName: SCOPE_NAME,
		fileTypes: ['c4', 'likec4'],
		patterns: [{ include: '#everything' }],
		repository: {
			everything: {
				patterns: [
					'comments',
					'strings',
					'urls',
					'icons',
					'hex-colors',
					'tags',
					'typed-arrow',
					'declarations',
					'keywords',
					'numbers',
					'operators',
					'punctuation',
				].map((name) => ({ include: `#${name}` })),
			},
			comments: comments(),
			strings: strings(),
			urls: urls(),
			icons: iconIds(icons),
			'hex-colors': hexColours(),
			tags: tags(),
			'typed-arrow': typedArrow(),
			declarations: declarations(reserved),
			keywords: keywords({ ...vocabulary, control, variables }),
			numbers: numbers(),
			operators: operators(vocabulary.arrows),
			punctuation: punctuation(),
		},
	};

	if (meta.repo && meta.ref) {
		grammar.$generated = {
			repo: meta.repo,
			ref: meta.ref,
			...(meta.sha ? { sha: meta.sha } : {}),
			by: 'astroc4/scripts/sync-grammar.mjs',
		};
	}

	return grammar;
}
// region structural patterns

function comments() {
	return {
		patterns: [
			{
				name: 'comment.block.likec4',
				begin: '/\\*',
				end: '\\*/',
				captures: { 0: { name: 'punctuation.definition.comment.likec4' } },
			},
			{
				name: 'comment.line.double-slash.likec4',
				match: '//.*$',
				captures: { 0: { name: 'punctuation.definition.comment.likec4' } },
			},
		],
	};
}

/**
 * `'…'`, `"…"`, and the markdown strings `''' … '''` / `""" … """` that
 * LikeC4 uses for descriptions.
 */
function strings() {
	const triple = (quote) => ({
		name: 'string.quoted.triple.likec4',
		begin: quote.repeat(3),
		end: quote.repeat(3),
		beginCaptures: { 0: { name: 'punctuation.definition.string.begin.likec4' } },
		endCaptures: { 0: { name: 'punctuation.definition.string.end.likec4' } },
	});

	const single = (quote, name) => ({
		name,
		begin: quote,
		end: `${quote}|$`,
		beginCaptures: { 0: { name: 'punctuation.definition.string.begin.likec4' } },
		endCaptures: { 0: { name: 'punctuation.definition.string.end.likec4' } },
		patterns: [{ name: 'constant.character.escape.likec4', match: '\\\\.' }],
	});

	return {
		patterns: [
			triple("'"),
			triple('"'),
			single("'", 'string.quoted.single.likec4'),
			single('"', 'string.quoted.double.likec4'),
		],
	};
}

function urls() {
	return { name: 'markup.underline.link.likec4', match: "\\bhttps?://[^\\s'\"]+" };
}

/**
 * Icon ids (`tech:astro`, `aws:lambda`). The packs come from the `LIB_ICON`
 * terminal, so a pack added upstream highlights without touching this package.
 * @param {string[]} packs
 */
function iconIds(packs) {
	return {
		comment: 'Bundled icon ids: `tech:nginx`, `aws:…`, `gcp:…`, …',
		match: `\\b(${alternationOf(packs)})(:)([\\w-]+)`,
		captures: {
			1: { name: 'support.constant.icon-pack.likec4' },
			2: { name: 'punctuation.separator.likec4' },
			3: { name: 'support.constant.icon.likec4' },
		},
	};
}

/** `#0046BE` is a colour, `#compute` is a tag — hex first, so it wins. */
function hexColours() {
	return {
		name: 'constant.other.color.rgb-value.hex.likec4',
		match: '#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![\\w-])',
	};
}

function tags() {
	return { name: 'entity.name.tag.likec4', match: '#[A-Za-z_][\\w-]*' };
}

/** `a -[https]-> b` — the relationship kind inside the connector. */
function typedArrow() {
	return {
		comment: '`a -[https]-> b`',
		match: '(-\\[)\\s*([A-Za-z_][\\w-]*)\\s*(\\]->)',
		captures: {
			1: { name: 'keyword.operator.arrow.likec4' },
			2: { name: 'entity.name.type.relationship.likec4' },
			3: { name: 'keyword.operator.arrow.likec4' },
		},
	};
}

/**
 * Declarations: the name being introduced is scoped, the name only being
 * referred to is not. Runs before the keyword patterns so `element system`
 * reads as a declaration rather than as two keywords.
 *
 * @param {string} reserved Alternation of syntax words (`instanceOf`, `extend`,
 *   …), so `deployed = instanceOf a` scopes `instanceOf` as a keyword rather
 *   than as the element kind the name is being assigned.
 */
function declarations(reserved) {
	const notReserved = reserved ? `(?!(?:${reserved})\\b)` : '';

	return {
		patterns: [
			{
				comment:
					'`element system`, `deploymentNode region`, `tag tls`, `relationship https`. Not `where tag is #x`.',
				match: '\\b(element|deploymentNode|tag|relationship)\\s+(?!is\\b)([A-Za-z_][\\w-]*)(?=\\s*(?:\\{|$|//))',
				captures: {
					1: { name: 'storage.type.likec4' },
					2: { name: 'entity.name.type.likec4' },
				},
			},
			{
				comment:
					'`color testingBlue #0046BE` declares; `color testingBlue` inside a style block only refers.',
				match: '\\b(color)\\s+([A-Za-z_][\\w-]*)(?=\\s+#)',
				captures: {
					1: { name: 'storage.type.likec4' },
					2: { name: 'entity.name.type.likec4' },
				},
			},
			{
				comment: '`view index`, `dynamic view firstRequest`, `deployment view prod`, `view internals of site`',
				match: '\\b(?:(dynamic|deployment)\\s+)?(view)\\s+([A-Za-z_]\\w*)',
				captures: {
					1: { name: 'storage.modifier.likec4' },
					2: { name: 'storage.type.view.likec4' },
					3: { name: 'entity.name.function.view.likec4' },
				},
			},
			{
				comment: "`reader = actor 'Engineer'`",
				match: `\\b([A-Za-z_]\\w*)\\s*(=)(?!=)\\s*${notReserved}([A-Za-z_]\\w*)?`,
				captures: {
					1: { name: 'variable.other.definition.likec4' },
					2: { name: 'keyword.operator.assignment.likec4' },
					3: { name: 'entity.name.type.likec4' },
				},
			},
		],
	};
}

// endregion

// region generated keyword patterns

/**
 * Order matters here: blocks before plain keywords (so `model {` is a block),
 * operator words before keywords (`is`, `not`), variables before value domains
 * (so `source`/`target` stay variables even though `RankValue` reuses `source`).
 *
 * @param {import('./langium.mjs').Vocabulary & { control: string[], variables: string[] }} vocabulary
 */
function keywords(vocabulary) {
	/** @type {Record<string, unknown>[]} */
	const patterns = [];

	const blocks = alternationOf(vocabulary.blocks);
	if (blocks) {
		patterns.push({
			comment: 'Keywords that open a block: `model { … }`.',
			name: 'keyword.control.block.likec4',
			match: `\\b(?:${blocks})\\b(?=\\s*\\{)`,
		});
	}

	// Blocks repeat in the keyword list on purpose: `predicateGroup mine { … }`
	// is not followed by `{`, and still has to colour as a keyword. The block
	// pattern above wins wherever the brace is there.
	const control = alternationOf([...vocabulary.keywords, ...vocabulary.control, ...vocabulary.blocks]);

	// Word operators (`is`, `not`) come before the keyword list, which also
	// contains them: `where tag is #x` reads as an operator, not a keyword.
	patterns.push({
		name: 'keyword.operator.word.likec4',
		match: `\\b(?:${alternationOf(OPERATOR_WORDS)})\\b`,
	});

	if (control) {
		patterns.push({ name: 'keyword.control.likec4', match: `\\b(?:${control})\\b` });
	}

	const variables = alternationOf(vocabulary.variables);
	if (variables) {
		patterns.push({ name: 'variable.language.likec4', match: `\\b(?:${variables})\\b` });
	}

	const properties = alternationOf(vocabulary.properties);
	if (properties) {
		patterns.push({ name: 'support.type.property-name.likec4', match: `\\b(?:${properties})\\b` });
	}

	const values = alternationOf(uniqueDomain(vocabulary, VALUE_DOMAINS));
	if (values) {
		patterns.push({ name: 'constant.language.likec4', match: `\\b(?:${values})\\b` });
	}

	return { patterns };
}

function numbers() {
	return { name: 'constant.numeric.likec4', match: '\\b\\d+(?:\\.\\d+)?%?' };
}

/**
 * Relationship connectors, longest first so `]->` wins over `->`.
 * @param {string[]} arrows
 */
function operators(arrows) {
	const patterns = [];

	const connectors = alternationOf(arrows);
	if (connectors) {
		patterns.push({ name: 'keyword.operator.arrow.likec4', match: connectors });
	}

	patterns.push({ name: 'keyword.operator.wildcard.likec4', match: '\\.\\*\\*|\\.\\*|\\*\\*|\\*' });

	return { patterns };
}

function punctuation() {
	return {
		patterns: [
			{ name: 'punctuation.section.block.begin.likec4', match: '\\{' },
			{ name: 'punctuation.section.block.end.likec4', match: '\\}' },
			{ name: 'punctuation.separator.comma.likec4', match: ',' },
			{ name: 'punctuation.accessor.likec4', match: '\\.' },
		],
	};
}

// endregion

// region helpers

/**
 * Every value of the named domains, deduplicated and sorted. Missing domains
 * are skipped rather than failing: upstream is free to rename a rule, and a
 * renamed domain still reaches the grammar through `keywords`.
 * @param {import('./langium.mjs').Vocabulary} vocabulary
 * @param {string[]} names
 */
function uniqueDomain(vocabulary, names) {
	const values = names.flatMap((name) => vocabulary.enums[name] ?? []);

	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * `['a', 'b']` -> `a|b`, escaped for a TextMate regex. Returns '' for an empty
 * list so callers can skip the pattern instead of emitting `\b(?:)\b`.
 * @param {string[]} values
 */
function alternationOf(values) {
	return values.map(escapeRegExp).join('|');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// endregion

export default buildTmLanguage;

