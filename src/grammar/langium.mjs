// langium.mjs
// path: src/grammar/langium.mjs
// Reduces the LikeC4 Langium grammar to the vocabulary a TextMate grammar
// needs: which words open a block, which are plain keywords, which are
// property names, which belong to a closed value domain (shapes, colours,
// arrow heads…) and which tokens have to be matched structurally (comments,
// strings, icon ids).
//
// The grammar is read from likec4/likec4 at a ref the site chooses:
// `packages/language-server/src/like-c4.langium`. Deriving from it is what
// keeps highlighting in step with the language — `ElementShape` gained `agent`
// after v1.59.4, and the TextMate grammar upstream maintains by hand still
// does not know about it.
//
// Deliberately no Langium dependency: this is a tolerant scanner over one
// file, not a parser for the grammar language, and it has to survive upstream
// reformatting. Anything it cannot classify is dropped rather than guessed.

/** Rules that describe a closed set of values are named after what they hold. */
const NOT_VALUE_DOMAINS = /Id$/;

/** Property names the grammar matches as `key='…'` assignments. */
const PROPERTY_SUPPLEMENTS = ['kind', 'tag'];

/**
 * @typedef {object} Terminal
 * @property {boolean} hidden
 * @property {'regex' | 'literal'} kind
 * @property {string} value Raw regex source (without slashes) or literal.
 */

/**
 * @typedef {object} Vocabulary
 * @property {string[]} blocks Keywords that open a `{ … }` block.
 * @property {string[]} keywords Every remaining word-like literal.
 * @property {string[]} properties Property names from `key='…'` assignments.
 * @property {string[]} arrows Relationship connectors containing `->`.
 * @property {Record<string, string[]>} enums `returns string` value domains.
 * @property {string[]} icons Icon packs from the `LIB_ICON` terminal.
 * @property {string[]} booleans Literals from the `BOOLEAN` terminal.
 * @property {number} ruleCount Parser rules seen — used for sanity checks.
 */

/**
 * @param {string} source
 * @returns {Vocabulary}
 */
export function parseLangium(source) {
	// `grammar LikeC4` is a header, not a rule, and it has no `;`: leaving it in
	// would glue it to the first real rule and hide that rule from the scanner.
	const statements = splitStatements(
		stripComments(source).replace(/^[ \t]*grammar[ \t]+[A-Za-z_]\w*[ \t]*$/gm, ''),
	);
	const rules = statements.map(readStatement).filter((rule) => rule !== undefined);

	const parserRules = rules.filter((rule) => rule.kind === 'rule' || rule.kind === 'fragment');

	if (parserRules.length === 0) {
		throw new Error(
			'the file contains no Langium parser rules — is this still `packages/language-server/src/like-c4.langium`?',
		);
	}

	const enums = resolveEnums(parserRules);
	const blocks = findBlocks(parserRules);
	const properties = unique([...findProperties(parserRules), ...PROPERTY_SUPPLEMENTS]);
	const arrows = findArrows(parserRules);
	const literals = unique(
		parserRules.flatMap((rule) => rule.tokens.filter((t) => t.type === 'literal').map((t) => t.value)),
	);

	const classified = new Set([...blocks, ...properties, ...Object.values(enums).flat()]);
	const keywords = literals.filter(
		(value) => /^[A-Za-z_]\w*$/.test(value) && !classified.has(value),
	);

	const terminals = readTerminals(rules);

	// A grammar with parser rules but no structure at all is not a LikeC4
	// grammar — most likely the path now holds something else. A small grammar
	// can legitimately have no "leftover" keywords, so blocks and value domains
	// count too.
	if (keywords.length === 0 && blocks.length === 0 && Object.keys(enums).length === 0) {
		throw new Error('the file contains no LikeC4 keywords — the Langium grammar could not be read');
	}

	return {
		blocks,
		keywords,
		properties,
		arrows,
		enums,
		icons: terminalAlternatives(terminals.LIB_ICON),
		booleans: terminalAlternatives(terminals.BOOLEAN),
		ruleCount: parserRules.length,
	};
}

// region scanning

/**
 * Blank out `//` and block comments. String and regex literals are copied
 * verbatim, because a `//` inside `/https?:\/\//` is not a comment.
 * @param {string} source
 */
function stripComments(source) {
	let out = '';
	let i = 0;

	while (i < source.length) {
		const char = source[i];

		if (char === '/' && source[i + 1] === '/') {
			while (i < source.length && source[i] !== '\n') i++;
			out += ' ';
			continue;
		}

		if (char === '/' && source[i + 1] === '*') {
			i += 2;
			while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
			i += 2;
			out += ' ';
			continue;
		}

		if (char === "'" || char === '"') {
			const end = endOfString(source, i);
			out += source.slice(i, end);
			i = end;
			continue;
		}

		if (char === '/') {
			const end = endOfRegex(source, i);
			out += source.slice(i, end);
			i = end;
			continue;
		}

		out += char;
		i++;
	}

	return out;
}

/** Index just past the quoted literal that opens at `start`. */
function endOfString(source, start) {
	const quote = source[start];
	let i = start + 1;

	while (i < source.length) {
		if (source[i] === '\\') {
			i += 2;
			continue;
		}
		if (source[i] === quote) return i + 1;
		i++;
	}

	return source.length;
}

/** Index just past the regex literal that opens at `start`. */
function endOfRegex(source, start) {
	let i = start + 1;
	let inClass = false;

	while (i < source.length) {
		const char = source[i];

		if (char === '\\') {
			i += 2;
			continue;
		}
		if (char === '[') inClass = true;
		else if (char === ']') inClass = false;
		else if (char === '/' && !inClass) return i + 1;

		i++;
	}

	return source.length;
}

/**
 * Split on the `;` that ends each rule, ignoring the ones inside strings,
 * regexes and `{ … }` — interfaces have fields, and rules have `{infer X}`
 * actions, both of which can contain semicolons.
 * @param {string} source
 */
function splitStatements(source) {
	const statements = [];
	let depth = 0;
	let start = 0;
	let i = 0;

	while (i < source.length) {
		const char = source[i];

		if (char === "'" || char === '"') {
			i = endOfString(source, i);
			continue;
		}

		if (char === '/') {
			i = endOfRegex(source, i);
			continue;
		}

		if (char === '{') depth++;
		else if (char === '}') depth = Math.max(0, depth - 1);
		else if (char === ';' && depth === 0) {
			statements.push(source.slice(start, i));
			start = i + 1;
		}

		i++;
	}

	const tail = source.slice(start).trim();
	if (tail.length > 0) statements.push(tail);

	return statements.filter((statement) => statement.trim().length > 0);
}

const HEADERS = [
	// `hidden terminal WS: /[ \t]+/`
	{ kind: 'terminal', hidden: true, pattern: /^\s*hidden\s+terminal\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*:/ },
	// `terminal LIB_ICON: /…/`, `terminal fragment HASH: '#'`
	{
		kind: 'terminal',
		hidden: false,
		pattern:
			/^\s*terminal\s+(?:fragment\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*(?:returns\s+[A-Za-z_]\w*\s*)?:/,
	},
	// `fragment RelationConnector:`
	{ kind: 'fragment', hidden: false, pattern: /^\s*fragment\s+([A-Za-z_]\w*)\s*:/ },
	// `Model:`, `ModelViews:`, `entry LikeC4Grammar:`, `Relation<isExplicit>:`
	{
		kind: 'rule',
		hidden: false,
		pattern: /^\s*(?:entry\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*(?:returns\s+([A-Za-z_]\w*)\s*)?:/,
	},
];

/**
 * @param {string} statement
 * @returns {{ name: string, kind: 'rule' | 'fragment' | 'terminal', hidden: boolean, returns?: string, tokens: Token[] } | undefined}
 */
function readStatement(statement) {
	for (const header of HEADERS) {
		const match = header.pattern.exec(statement);
		if (!match) continue;

		return {
			name: match[1],
			kind: header.kind,
			hidden: header.hidden,
			returns: header.kind === 'rule' ? match[2] : undefined,
			tokens: tokenize(statement.slice(match[0].length)),
		};
	}

	return undefined;
}

/**
 * @typedef {'literal' | 'regex' | 'ident' | 'punct'} TokenType
 * @typedef {{ type: TokenType, value: string }} Token
 */

/**
 * @param {string} body
 * @returns {Token[]}
 */
function tokenize(body) {
	/** @type {Token[]} */
	const tokens = [];
	let i = 0;

	while (i < body.length) {
		const char = body[i];

		if (/\s/.test(char)) {
			i++;
			continue;
		}

		if (char === "'" || char === '"') {
			const end = endOfString(body, i);
			tokens.push({ type: 'literal', value: unquote(body.slice(i, end)) });
			i = end;
			continue;
		}

		if (char === '/') {
			const end = endOfRegex(body, i);
			tokens.push({ type: 'regex', value: body.slice(i + 1, end - 1) });
			i = end;
			continue;
		}

		const identifier = /^[A-Za-z_]\w*/.exec(body.slice(i));
		if (identifier) {
			tokens.push({ type: 'ident', value: identifier[0] });
			i += identifier[0].length;
			continue;
		}

		// Multi-character punctuation (`+=`, `?=`) is irrelevant: only `=`, `|`,
		// `(` and `)` are inspected, and per-character tokens give all four.
		tokens.push({ type: 'punct', value: char });
		i++;
	}

	return tokens;
}

/** Strip the quotes and resolve the escapes Langium allows in literals. */
function unquote(quoted) {
	const inner = quoted.slice(1, -1);
	let out = '';

	for (let i = 0; i < inner.length; i++) {
		if (inner[i] !== '\\') {
			out += inner[i];
			continue;
		}

		const escaped = inner[++i];
		if (escaped === 'n') out += '\n';
		else if (escaped === 't') out += '\t';
		else if (escaped === 'r') out += '\r';
		else out += escaped ?? '';
	}

	return out;
}

// endregion

// region vocabulary

/**
 * Rules of the shape `'specification' '{' …` or `name='model' '{' …` open a
 * block. The first literal of the rule is the keyword, and it only counts when
 * the rule reaches a `{` without branching first: `'element' kind=ElementKind
 * ('{' …)` has an optional body, so `element` stays a keyword.
 * @param {{ tokens: Token[] }[]} rules
 */
function findBlocks(rules) {
	return unique(
		rules.flatMap((rule) => {
			const tokens = rule.tokens;
			const first = tokens.findIndex((token) => token.type === 'literal');
			const keyword = first === -1 ? undefined : tokens[first].value;

			if (!keyword || keyword === '{' || !/^[A-Za-z_]\w*$/.test(keyword)) return [];

			for (let i = first + 1; i < tokens.length; i++) {
				if (tokens[i].value === '(' || tokens[i].value === '|') return [];
				if (tokens[i].type === 'literal' && tokens[i].value === '{') return [keyword];
			}

			return [];
		}),
	);
}

/**
 * `key='title'` and `key=('head' | 'tail')` name a property. Positional
 * arguments (`props+=String`) and `name=` (block headers) are ignored.
 * @param {{ tokens: Token[] }[]} rules
 */
function findProperties(rules) {
	/** @type {string[]} */
	const properties = [];

	for (const rule of rules) {
		const tokens = rule.tokens;

		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].type !== 'ident' || tokens[i].value !== 'key') continue;

			const equals = equalsIndex(tokens, i);
			if (equals === -1) continue;

			let j = equals + 1;

			if (tokens[j]?.value === '(') {
				for (j++; j < tokens.length && tokens[j].value !== ')'; j++) {
					if (tokens[j].type === 'literal') properties.push(tokens[j].value);
				}
				continue;
			}

			if (tokens[j]?.type === 'literal') properties.push(tokens[j].value);
		}
	}

	return properties.filter((value) => /^[A-Za-z_]\w*$/.test(value));
}

/**
 * Index of the `=` that assigns `tokens[i]` (`key=`, `key?=`, `key+=`), or `-1`
 * when the identifier is not being assigned.
 * @param {Token[]} tokens
 * @param {number} i
 */
function equalsIndex(tokens, i) {
	if (tokens[i]?.type !== 'ident') return -1;

	const next = tokens[i + 1]?.value;
	if (next === '=') return i + 1;
	if ((next === '?' || next === '+') && tokens[i + 2]?.value === '=') return i + 2;

	return -1;
}

/**
 * The connectors live in one fragment:
 *   dotKind=RelationKindDotRef | '-[' kind=[RelationshipKind] (… '->') | … | '->'
 * @param {{ name: string, tokens: Token[] }[]} rules
 */
function findArrows(rules) {
	const connector = rules.find((rule) => rule.name === 'RelationConnector');
	const fromConnector = (connector?.tokens ?? [])
		.filter((token) => token.type === 'literal' && token.value.includes('->'))
		.map((token) => token.value);

	// Longest first: TextMate alternation is first-match, so `]->` has to be
	// tried before `->` at the same position.
	return unique([...fromConnector, '->', '<->']).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * A `returns string` rule whose body is only literals, `|` and references to
 * other such rules is a closed value domain — `BorderStyleValue: LineOptions |
 * 'none'` inherits from `LineOptions` that way. Anything referencing a rule
 * that is not itself a value domain (e.g. `Id returns string`) resolves to
 * nothing and is dropped.
 * @param {{ name: string, returns?: string, tokens: Token[] }[]} rules
 */
function resolveEnums(rules) {
	/** @type {Map<string, string[]>} */
	const candidates = new Map();

	for (const rule of rules) {
		if (rule.returns !== 'string' || NOT_VALUE_DOMAINS.test(rule.name)) continue;

		const onlyValuesAndChoices = rule.tokens.every(
			(token) =>
				token.type === 'literal' ||
				token.type === 'ident' ||
				(token.type === 'punct' && (token.value === '|' || token.value === ';')),
		);

		if (onlyValuesAndChoices) candidates.set(rule.name, []);
	}

	// Fixpoint, because `BorderStyleValue` can only resolve once `LineOptions`
	// has. One pass per rule is enough for any acyclic grammar.
	for (let pass = 0; pass < rules.length; pass++) {
		let changed = false;

		for (const rule of rules) {
			if (!candidates.has(rule.name)) continue;

			/** @type {string[]} */
			const resolved = [];
			let complete = true;

			for (const token of rule.tokens) {
				if (token.type === 'literal') {
					resolved.push(token.value);
					continue;
				}

				if (token.type !== 'ident') continue;

				const inherited = candidates.get(token.value);
				if (inherited === undefined) {
					complete = false;
					break;
				}
				resolved.push(...inherited);
			}

			const next = unique(resolved);
			if (!complete || next.length === 0) continue;

			if ((candidates.get(rule.name) ?? []).length !== next.length) {
				candidates.set(rule.name, next);
				changed = true;
			}
		}

		if (!changed) break;
	}

	/** @type {Record<string, string[]>} */
	const enums = {};
	for (const [name, values] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
		if (values.length > 0) enums[name] = values;
	}

	return enums;
}

/**
 * @param {{ name: string, kind: string, hidden: boolean, tokens: Token[] }[]} rules
 * @returns {Record<string, Terminal>}
 */
function readTerminals(rules) {
	/** @type {Record<string, Terminal>} */
	const terminals = {};

	for (const rule of rules) {
		if (rule.kind !== 'terminal') continue;

		const token = rule.tokens.find((candidate) => candidate.type === 'regex' || candidate.type === 'literal');
		if (!token) continue;

		terminals[rule.name] = {
			hidden: rule.hidden,
			kind: token.type === 'regex' ? 'regex' : 'literal',
			value: token.value,
		};
	}

	return terminals;
}

/**
 * The alternatives of the first group in a terminal's regex:
 * `(aws|azure|bootstrap|gcp|md|tech):[-\w]+` -> the icon packs.
 * @param {Terminal | undefined} terminal
 */
function terminalAlternatives(terminal) {
	if (!terminal || terminal.kind !== 'regex') return [];

	const group = /\(([^()]*)\)/.exec(terminal.value);
	if (!group) return [];

	return unique(group[1].split('|').map((value) => value.trim())).filter((value) =>
		/^[A-Za-z][\w-]*$/.test(value),
	);
}

function unique(values) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

// endregion

export default parseLangium;

