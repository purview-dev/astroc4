// utils.ts
// path: src/components/utils.ts
// Pure resolution/validation helpers for <LikeC4View>. Separated from the React
// component so the error-message behaviour can be tested without a DOM.

import { DEFAULT_LABELS, format, type IslandLabels } from './labels';

type ErrorLabels = Pick<
	IslandLabels,
	'viewIdRequired' | 'noProjects' | 'unknownProject' | 'projectRequired' | 'loadFailed'
>;

export function getAvailableProjectIds(
	projectDefinitions: ReadonlyArray<{ id: unknown }>,
): string[] {
	return projectDefinitions
		.map((project) => String(project.id).trim())
		.filter((id) => id.length > 0);
}

export function validateViewId(viewId: string, labels: ErrorLabels = DEFAULT_LABELS): string | null {
	if (!viewId || viewId.trim().length === 0) {
		return labels.viewIdRequired;
	}

	return null;
}

export function resolveProjectId(
	projectId: string | undefined,
	availableProjectIds: string[],
	labels: ErrorLabels = DEFAULT_LABELS,
) {
	if (availableProjectIds.length === 0) {
		return {
			resolvedProjectId: null,
			error: labels.noProjects,
		};
	}

	const requested = projectId?.trim();

	// With several projects, "the first one found" depends on folder order —
	// a reorder would silently change the diagram — so the page has to say.
	if (!requested && availableProjectIds.length > 1) {
		return {
			resolvedProjectId: null,
			error: format(labels.projectRequired, { available: availableProjectIds.join(', ') }),
		};
	}

	const resolvedProjectId = requested || availableProjectIds[0]!;

	if (!availableProjectIds.includes(resolvedProjectId)) {
		return {
			resolvedProjectId: null,
			error: format(labels.unknownProject, {
				projectId: resolvedProjectId,
				available: availableProjectIds.join(', ') || '(none)',
			}),
		};
	}

	return {
		resolvedProjectId,
		error: null,
	};
}

/**
 * The `import.meta.glob` key for `<LikeC4View file="…">`: a `.c4` path relative
 * to the site's `src/`, or `null` when it is not one. Only files under `src/`
 * can match the glob, so a path that climbs out can never load anything.
 */
export function fileKey(file: string): string | null {
	// Absolute paths (`/etc/x.c4`, `C:/x.c4`, `\\server\x.c4`) are never relative to src/.
	if (/^[\\/]/.test(file) || /^[a-z]:/i.test(file)) return null;

	const segments: string[] = [];

	for (const segment of file.split(/[\\/]+/)) {
		if (segment === '' || segment === '.') continue;

		if (segment === '..') {
			if (segments.length === 0) return null;
			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	const path = segments.join('/');

	return path.toLowerCase().endsWith('.c4') ? `/src/${path}` : null;
}

export function toLoadErrorMessage(
	err: unknown,
	resolvedProjectId: string,
	labels: ErrorLabels = DEFAULT_LABELS,
): string {
	if (err instanceof Error && err.message.trim().length > 0) {
		return err.message;
	}

	return format(labels.loadFailed, { projectId: resolvedProjectId });
}
