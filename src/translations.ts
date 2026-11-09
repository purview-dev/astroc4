// Placeholders are `{name}`, not i18next's `{{name}}`: some values are only
// known in the browser, so the template has to reach the island unformatted.

export const translations = {
	en: {
		'likec4.view.title': 'Architecture diagram',
		'likec4.view.description': 'Interactive LikeC4 diagram for this section.',
		'likec4.view.hint': 'Click a node in the diagram to open its details.',
		'likec4.view.badge': 'Click any node to open the modal',
		'likec4.view.loading': 'Loading architecture diagram…',
		'likec4.fence.title': 'Diagram',
		'likec4.fence.hint': 'Click any node to open its details.',
		'likec4.fence.loading': 'Loading diagram…',
		'likec4.error.title': 'We couldn’t load this diagram.',
		'likec4.error.body': 'Please retry, or refresh the page if the issue persists.',
		'likec4.error.retry': 'Retry',
		'likec4.error.viewIdRequired': 'A LikeC4 viewId is required to render the diagram.',
		'likec4.error.noProjects': 'No LikeC4 projects are available in this workspace.',
		'likec4.error.unknownProject': 'Unknown LikeC4 projectId "{projectId}". Available projects: {available}.',
		'likec4.error.projectRequired': 'Several LikeC4 projects exist ({available}); pass project="…".',
		'likec4.error.unresolvedProject': 'Unable to resolve a LikeC4 project.',
		'likec4.error.loadFailed': 'Unable to load LikeC4 project "{projectId}".',
	},
};

export default translations;
