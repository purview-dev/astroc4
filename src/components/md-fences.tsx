// md-fences.tsx
// path: src/components/md-fences.tsx
// Mounts the diagrams of ```likec4 fences in .md pages.
//
// A .md page cannot hold an Astro or React component, so the fence transform
// (src/fences.ts) writes a placeholder carrying the view id — and, for an
// inline or `file=` fence, the model it laid out at build time. The page script
// the integration injects imports this module only on a page that has one, and
// this renders the same islands an .mdx page gets into each placeholder.

import { likec4IdFor, projectNames } from 'virtual:astroc4/projects';
import { createRoot } from 'react-dom/client';

import { DEFAULT_LABELS } from './labels';
import LikeC4InlineView from './LikeC4InlineView';
import LikeC4ProjectView from './LikeC4ProjectView';
import { resolveProjectId } from './utils';

const SELECTOR = '[data-astroc4-fence]:not([data-astroc4-mounted])';

/** Render every not-yet-mounted fence placeholder under `root`. */
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

/**
 * A fence's `project` (a configured or discovered name) as LikeC4's project id.
 * An unknown or missing name is passed through for the island to report.
 */
function likec4Id(project: string | undefined): string | undefined {
	if (projectNames.length === 0) return project;

	const { resolvedProjectId } = resolveProjectId(project, projectNames, DEFAULT_LABELS);

	return resolvedProjectId ? likec4IdFor[resolvedProjectId] : project;
}
