// Local icons are normally rewritten to `/_astroc4/…` URLs at build time by
// src/icon-plugin.ts; a `file://` value reaching here is one the build could
// not attribute to a project.

/** Everything after a `/public/` segment, which Astro serves at the site root. */
const PUBLIC_SEGMENT = /\/public\/(.+)$/;

const LOCAL_PATH = /^(file:\/\/|virtual:\/)/;

export type IconSource =
	| { kind: 'pack' }
	| { kind: 'url'; src: string }
	| { kind: 'unresolvable'; path: string };

/**
 * `pack` is anything the LikeC4 renderer handles itself; `unresolvable` is a
 * build-machine path with no web equivalent, which renders nothing (and warns).
 */
export function classifyIcon(icon: string | null | undefined): IconSource {
	const value = icon?.trim();

	if (!value) {
		return { kind: 'pack' };
	}

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
