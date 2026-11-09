// icon-source.ts
// path: src/components/icon-source.ts
// Works out how an element's `icon` value should be rendered.
//
// LikeC4 resolves a *relative* icon path against the .c4 file and stores an
// absolute `file://` URL in the compiled model. That path is baked into the
// client bundle, so the icon 404s for every visitor and the author's local
// directory structure ships with the site.
//
// Files under `public/` are the exception worth supporting: Astro serves them
// verbatim at the site root, so the absolute path can be rewritten back to the
// URL it will actually be served from.
//
// Every other local icon — through an `imageAliases` alias or a relative path —
// is rewritten at build time by `src/icon-plugin.ts` to its `/_astroc4/…` URL,
// so it arrives here as `url` already. A `file://` value still reaching this
// function is one the build could not attribute to a project.

/** Everything after a `/public/` segment, which Astro serves at the site root. */
const PUBLIC_SEGMENT = /\/public\/(.+)$/;

/** A path the compiler resolved on the build machine, rather than a pack id. */
const LOCAL_PATH = /^(file:\/\/|virtual:\/)/;

export type IconSource =
	| { kind: 'pack' }
	| { kind: 'url'; src: string }
	| { kind: 'unresolvable'; path: string };

/**
 * Classify an icon value from the compiled model.
 *
 * - `pack`          — a bundled icon id (`tech:nginx`, `aws:…`, …)
 *                     or anything else the LikeC4 renderer handles itself.
 * - `url`           — render directly as an `<img src>`.
 * - `unresolvable`  — a build-machine path with no web equivalent. Rendering
 *                     nothing is better than a broken image, and the caller
 *                     warns so it is not silently wrong.
 */
export function classifyIcon(icon: string | null | undefined): IconSource {
	const value = icon?.trim();

	if (!value) {
		return { kind: 'pack' };
	}

	// Absolute URLs (and protocol-relative ones) are already web-addressable.
	if (/^(https?:)?\/\//i.test(value)) {
		return { kind: 'url', src: value };
	}

	if (!LOCAL_PATH.test(value)) {
		return { kind: 'pack' };
	}

	// `file:///c%3A/.../public/likec4-icons/x.svg` -> `/likec4-icons/x.svg`
	const decoded = safeDecode(value);
	const match = PUBLIC_SEGMENT.exec(decoded);

	if (match) {
		return { kind: 'url', src: `/${match[1]}` };
	}

	return { kind: 'unresolvable', path: decoded };
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
