import type { ElementIconRenderer } from 'likec4:icons';

import { classifyIcon } from './icon-source';

export function withImageIcons(packRenderer: ElementIconRenderer): ElementIconRenderer {
	return function IconRenderer(props) {
		const source = classifyIcon(props.node.icon);

		if (source.kind === 'url') {
			// The virtual `likec4:icons` module's props carry no className, so size
			// the image to its slot explicitly rather than relying on a class.
			return (
				<img
					src={source.src}
					alt=""
					loading="lazy"
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
				/>
			);
		}

		if (source.kind === 'unresolvable') {
			console.warn(
				`[likec4] Element "${props.node.id}" has icon "${source.path}", which only exists on the machine that built the site. ` +
					'Use a bundled icon (azure:, aws:, gcp:, tech:, bootstrap:), an absolute URL, or a file under public/.',
			);
			return null;
		}

		return packRenderer(props);
	};
}
