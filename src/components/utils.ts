// utils.ts
// path: src/components/utils.ts
// Pure resolution/validation helpers for <LikeC4View>. Separated from the React
// component so the error-message behaviour can be tested without a DOM.

import { DEFAULT_LABELS, format, type IslandLabels } from './labels';

type ErrorLabels = Pick<
	IslandLabels,
	'viewIdRequired' | 'noProjects' | 'unknownProject' | 'loadFailed'
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

	const resolvedProjectId = projectId?.trim() || availableProjectIds[0]!;

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
