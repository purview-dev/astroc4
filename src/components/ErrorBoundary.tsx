// Styled by the `.likec4-error` rules in DiagramFrame.astro, always an ancestor.

import { Component, type ReactNode } from 'react';

import type { IslandLabels } from './labels';

type Props = {
	children: ReactNode;
	labels: Pick<IslandLabels, 'errorTitle' | 'errorBody' | 'errorRetry'>;
};

type State = {
	hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidCatch(error: unknown) {
		console.error('[likec4] Diagram render error:', error);
	}

	handleRetry = () => {
		this.setState({ hasError: false });
	};

	render() {
		if (this.state.hasError) {
			const { labels } = this.props;

			return (
				<div role="alert" className="likec4-error">
					<p className="likec4-error__title">{labels.errorTitle}</p>
					<p>{labels.errorBody}</p>
					<button type="button" onClick={this.handleRetry} className="likec4-error__retry">
						{labels.errorRetry}
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
