// How a fence that cannot be turned into a diagram is treated: `strict` fails the
// build — and so `astro check`, which runs the same content transform — while
// `relaxed` logs the reason as a warning and leaves the fence as a highlighted
// code block. Relaxing can be scoped by content collection or page path, so a
// tutorial section need not take the whole site's strictness with it.

export type ValidationMode = 'strict' | 'relaxed';

export interface ValidationScope {
	/** The mode for a page no `relaxed` pattern matches. Defaults to `'strict'`. */
	default?: ValidationMode;
	/**
	 * Page path globs, relative to the site root, that use `'relaxed'`. `*`
	 * matches within a path segment, `**` across segments, and a pattern matches
	 * at any depth — `tutorials/**` finds `src/content/docs/tutorials/…`.
	 */
	relaxed?: string | string[];
	/**
	 * Content collections that use `'relaxed'`, by name. A page's collection is
	 * its first folder under the content directory (`src/content/<name>/…`),
	 * which is how Astro's `glob` loader maps a collection to a folder.
	 */
	collections?: string | string[];
}

/** A single mode for the whole site, or per-page rules. */
export type ValidationOptions = ValidationMode | ValidationScope;

/** A glob as a regexp anchored at both ends, with an implicit "any folder" prefix. */
export function globToRegExp(pattern: string): RegExp {
	let body = '';

	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index]!;

		if (char === '*') {
			if (pattern[index + 1] === '*') {
				body += '.*';
				index += 1;
			} else {
				body += '[^/]*';
			}
		} else if (char === '?') {
			body += '[^/]';
		} else if ('.+^${}()|[]\\'.includes(char)) {
			body += `\\${char}`;
		} else {
			body += char;
		}
	}

	return new RegExp(`^(?:.*/)?${body}$`);
}

const toSlashes = (value: string): string => value.replaceAll('\\', '/');

/**
 * The mode a page uses. `relativePath` is the page's path from the site root and
 * `collection` its content collection; either may be `undefined` when it cannot
 * be worked out — then whatever is left decides, falling back to `default`.
 */
export function validationModeFor(
	options: ValidationOptions | undefined,
	relativePath: string | undefined,
	collection?: string,
): ValidationMode {
	if (options === undefined) return 'strict';
	if (typeof options === 'string') return options;

	const fallback = options.default ?? 'strict';
	const collections = options.collections === undefined ? [] : [options.collections].flat();

	if (collection !== undefined && collections.includes(collection)) return 'relaxed';

	if (relativePath === undefined) return fallback;

	const patterns = options.relaxed === undefined ? [] : [options.relaxed].flat();
	const path = toSlashes(relativePath);

	return patterns.some((pattern) => globToRegExp(pattern).test(path)) ? 'relaxed' : fallback;
}
