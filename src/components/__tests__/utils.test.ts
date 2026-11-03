import { describe, expect, it } from 'vitest';

import {
	getAvailableProjectIds,
	resolveProjectId,
	toLoadErrorMessage,
	validateViewId,
} from '../utils';

describe('likec4 utils', () => {
	it('extracts non-empty project ids', () => {
		const ids = getAvailableProjectIds([{ id: 'core' }, { id: '  aux ' }, { id: '' }]);
		expect(ids).toEqual(['core', 'aux']);
	});

	it('returns missing-project error when there are no projects', () => {
		const result = resolveProjectId(undefined, []);
		expect(result.resolvedProjectId).toBeNull();
		expect(result.error).toContain('No LikeC4 projects');
	});

	it('uses first project when projectId not provided', () => {
		const result = resolveProjectId(undefined, ['a', 'b']);
		expect(result.resolvedProjectId).toBe('a');
		expect(result.error).toBeNull();
	});

	it('returns unknown project error when explicit project id is invalid', () => {
		const result = resolveProjectId('missing', ['a', 'b']);
		expect(result.resolvedProjectId).toBeNull();
		expect(result.error).toContain('Unknown LikeC4 projectId "missing"');
	});

	it('validates non-empty view id', () => {
		expect(validateViewId('   ')).toContain('viewId is required');
		expect(validateViewId('index')).toBeNull();
	});

	it('prefers underlying error message when available', () => {
		expect(toLoadErrorMessage(new Error('boom'), 'core')).toBe('boom');
		expect(toLoadErrorMessage('bad', 'core')).toBe('Unable to load LikeC4 project "core".');
	});
});
