// Browser-only: mount it with `client:only="react"`.

import { type ElementIconRenderer, getProjectIcons } from 'likec4:icons';
import { loadModel } from 'likec4:model';
import { projects } from 'likec4:projects';
import type { aux, UnknownLayouted } from 'likec4/model';
import { LikeC4View as GenericLikeC4View, LikeC4ModelProvider } from 'likec4/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import ErrorBoundary from './ErrorBoundary';
import { DEFAULT_LABELS, type IslandLabels } from './labels';
import { withImageIcons } from './render-icon';
import {
	getAvailableProjectIds,
	resolveProjectId,
	toLoadErrorMessage,
	validateViewId,
} from './utils';

type Props = {
	viewId: string;
	projectId?: string;
	labels?: IslandLabels;
};

type LoadedProjectModel = Awaited<ReturnType<typeof loadModel>>;

type LoadedLikeC4ViewProps = {
	loadedProjectModel: LoadedProjectModel;
	viewId: string;
	iconRenderer?: ElementIconRenderer;
};

function LoadedLikeC4View({ loadedProjectModel, viewId, iconRenderer }: LoadedLikeC4ViewProps) {
	const model = loadedProjectModel.useLikeC4Model();

	return (
		<LikeC4ModelProvider likec4model={model}>
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

function LikeC4ProjectViewContent({ viewId, projectId, labels }: Props & { labels: IslandLabels }) {
	const [loadedProjectModel, setLoadedProjectModel] = useState<LoadedProjectModel | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Guards against an older, slower load resolving after a newer one.
	const loadRequestIdRef = useRef(0);

	const availableProjectIds = useMemo(() => getAvailableProjectIds(projects), []);
	const viewIdError = useMemo(() => validateViewId(viewId, labels), [viewId, labels]);

	const projectResolution = useMemo(
		() => resolveProjectId(projectId, availableProjectIds, labels),
		[projectId, availableProjectIds, labels],
	);

	const resolvedProjectId = projectResolution.resolvedProjectId;

	const iconRenderer = useMemo(() => {
		if (!resolvedProjectId) {
			return undefined;
		}

		return withImageIcons(getProjectIcons(resolvedProjectId));
	}, [resolvedProjectId]);

	useEffect(() => {
		let isActive = true;
		const currentRequestId = ++loadRequestIdRef.current;

		if (viewIdError) {
			setError(viewIdError);
			setLoadedProjectModel(null);
			return () => {
				isActive = false;
			};
		}

		if (projectResolution.error || !resolvedProjectId) {
			setError(projectResolution.error ?? labels.unresolvedProject);
			setLoadedProjectModel(null);
			return () => {
				isActive = false;
			};
		}

		setError(null);
		setLoadedProjectModel(null);

		loadModel(resolvedProjectId)
			.then((projectModel) => {
				if (!isActive || currentRequestId !== loadRequestIdRef.current) {
					return;
				}

				setLoadedProjectModel(projectModel);
			})
			.catch((err: unknown) => {
				if (!isActive || currentRequestId !== loadRequestIdRef.current) {
					return;
				}

				setError(toLoadErrorMessage(err, resolvedProjectId, labels));
				setLoadedProjectModel(null);
			});

		return () => {
			isActive = false;
		};
	}, [projectResolution.error, resolvedProjectId, viewIdError, labels]);

	if (error) {
		return (
			<p role="alert" aria-live="polite">
				{error}
			</p>
		);
	}

	if (!loadedProjectModel) {
		return <p aria-live="polite">{labels.loading}</p>;
	}

	return (
		<LoadedLikeC4View
			loadedProjectModel={loadedProjectModel}
			viewId={viewId}
			iconRenderer={iconRenderer}
		/>
	);
}

export default function LikeC4ProjectView({ labels = DEFAULT_LABELS, ...props }: Props) {
	return (
		<ErrorBoundary labels={labels}>
			<LikeC4ProjectViewContent {...props} labels={labels} />
		</ErrorBoundary>
	);
}
