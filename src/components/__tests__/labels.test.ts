import { describe, expect, it } from 'vitest';

import { translations } from '../../translations.ts';
import { format, getIslandLabels, getTranslator } from '../labels';
import { resolveProjectId } from '../utils';

describe('getTranslator', () => {
	it('falls back to English when there is no Starlight t()', () => {
		expect(getTranslator(undefined)('likec4.error.retry')).toBe('Retry');
	});

	it('uses the page translation when there is one', () => {
		const t = getTranslator((key: string) => (key === 'likec4.error.retry' ? 'Réessayer' : ''));

		expect(t('likec4.error.retry')).toBe('Réessayer');
		// An empty string means "no translation", not "show nothing".
		expect(t('likec4.error.body')).toBe(translations.en['likec4.error.body']);
	});

	it('resolves the loading string per component', () => {
		const t = getTranslator(undefined);

		expect(getIslandLabels(t, 'likec4.fence.loading').loading).toBe('Loading diagram…');
		expect(getIslandLabels(t, 'likec4.view.loading').loading).toBe('Loading architecture diagram…');
	});
});

describe('format', () => {
	it('fills named placeholders', () => {
		expect(format('Project "{projectId}"', { projectId: 'core' })).toBe('Project "core"');
	});

	it('leaves unknown placeholders visible rather than blanking them', () => {
		expect(format('{a} and {b}', { a: '1' })).toBe('1 and {b}');
	});

	it('is what translated error templates go through', () => {
		const labels = {
			...getIslandLabels(getTranslator(undefined), 'likec4.view.loading'),
			unknownProject: 'Projet inconnu « {projectId} » ({available})',
		};

		expect(resolveProjectId('x', ['a', 'b'], labels).error).toBe('Projet inconnu « x » (a, b)');
	});
});

describe('projectRequired', () => {
	it('has an English default and a translation key', () => {
		expect(translations.en['likec4.error.projectRequired']).toBe(
			'Several LikeC4 projects exist ({available}); pass project="…".',
		);
		expect(getIslandLabels(getTranslator(undefined), 'likec4.view.loading').projectRequired).toBe(
			translations.en['likec4.error.projectRequired'],
		);
	});
});

describe('translations', () => {
	it('uses single-brace placeholders, which i18next leaves alone', () => {
		for (const value of Object.values(translations.en)) {
			expect(value).not.toMatch(/\{\{/);
		}
	});
});
