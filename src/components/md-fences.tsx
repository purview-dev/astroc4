// Mounts the islands into the placeholders src/fences.ts writes for .md pages.

import { likec4IdFor, projectNames } from 'virtual:astroc4/projects';
import { createRoot } from 'react-dom/client';

import { DEFAULT_LABELS } from './labels';
import LikeC4InlineView from './LikeC4InlineView';
import LikeC4ProjectView from './LikeC4ProjectView';
import { resolveProjectId } from './utils';

const SELECTOR = '[data-astroc4-fence]:not([data-astroc4-mounted])';

export function mountFences(root: ParentNode = document): void {
	for (const placeholder of root.querySelectorAll<HTMLElement>(SELECTOR)) {
		placeholder.dataset.astroc4Mounted = '';

		const frame = placeholder.querySelector<HTMLElement>('.likec4-frame') ?? placeholder;
		const { viewId = '', model, project } = placeholder.dataset;

		createRoot(frame).render(
			model !== undefined ? (
				<LikeC4InlineView model={JSON.parse(model)} viewId={viewId} labels={DEFAULT_LABELS} />
			) : (
				<LikeC4ProjectView viewId={viewId} projectId={likec4Id(project)} labels={DEFAULT_LABELS} />
			),
		);
	}
}

/** A page's project name as LikeC4's id; anything unknown is left for the island to report. */
function likec4Id(project: string | undefined): string | undefined {
	if (projectNames.length === 0) return project;

	const { resolvedProjectId } = resolveProjectId(project, projectNames, DEFAULT_LABELS);

	return resolvedProjectId ? likec4IdFor[resolvedProjectId] : project;
}
