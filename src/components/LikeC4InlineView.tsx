// LikeC4InlineView.tsx
// path: src/components/LikeC4InlineView.tsx
// Renders a LikeC4 model that was compiled at build time from a ```likec4
// fence, rather than loaded from the workspace project.
//
// The DSL is parsed and laid out by the fence plugin during the build (layout
// needs a WASM graph engine, so it cannot happen in the browser); this island
// only rehydrates the resulting plain-JSON model.

import { getProjectIcons } from 'likec4:icons';
import { projects } from 'likec4:projects';
// `@likec4/core/model`, not `likec4/model`: the latter is the Node entry point
// and pulls `node:module`'s createRequire into the browser bundle, which fails
// at hydration with "createRequire is not a function". This is the same module
// `likec4/react` itself imports.
import { LikeC4Model } from '@likec4/core/model';
import type { aux, UnknownLayouted } from 'likec4/model';
import { LikeC4View as GenericLikeC4View, LikeC4ModelProvider } from 'likec4/react';
import { useMemo } from 'react';

import ErrorBoundary from './ErrorBoundary';
import { DEFAULT_LABELS, type IslandLabels } from './labels';
import { withImageIcons } from './render-icon';

type Props = {
	/** Layouted model dump produced at build time. */
	model: unknown;
	viewId: string;
	/** Translated on the server; defaults to English. */
	labels?: IslandLabels;
};

function LikeC4InlineViewContent({ model, viewId }: Props) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dump is plain JSON
	const likec4model = useMemo(() => LikeC4Model.create(model as any), [model]);

	// Inline models are not workspace projects, so they have no icon bundle of
	// their own. The icon ids (`tech:…`, `aws:…`) are global, so borrow the
	// renderer from the first project rather than shipping a second copy.
	const iconRenderer = useMemo(() => {
		const first = projects[0];

		return first ? withImageIcons(getProjectIcons(String(first.id))) : undefined;
	}, []);

	return (
		<LikeC4ModelProvider likec4model={likec4model}>
			<GenericLikeC4View
				viewId={viewId as aux.ViewId<UnknownLayouted>}
				controls={false}
				renderIcon={iconRenderer}
				browser={{
					enableFocusMode: false,
					enableSearch: false,
				}}
			/>
		</LikeC4ModelProvider>
	);
}

export default function LikeC4InlineView({ labels = DEFAULT_LABELS, ...props }: Props) {
	return (
		<ErrorBoundary labels={labels}>
			<LikeC4InlineViewContent {...props} />
		</ErrorBoundary>
	);
}
