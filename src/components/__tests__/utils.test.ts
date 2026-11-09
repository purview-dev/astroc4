import { describe, expect, it } from 'vitest';

import {
	fileKey,
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

	it('uses the only project when project is omitted', () => {
		const result = resolveProjectId(undefined, ['a']);
		expect(result.resolvedProjectId).toBe('a');
		expect(result.error).toBeNull();
	});

	it('fails with projectRequired, listing the names, when several exist and project is omitted', () => {
		const result = resolveProjectId(undefined, ['a', 'b']);
		expect(result.resolvedProjectId).toBeNull();
		expect(result.error).toBe('Several LikeC4 projects exist (a, b); pass project="…".');
	});

	it('resolves a named project', () => {
		expect(resolveProjectId('b', ['a', 'b'])).toEqual({ resolvedProjectId: 'b', error: null });
	});

	it('returns unknown project error when explicit project id is invalid', () => {
		const result = resolveProjectId('missing', ['a', 'b']);
		expect(result.resolvedProjectId).toBeNull();
		expect(result.error).toContain('Unknown LikeC4 projectId "missing"');
	});

	it('maps a file prop to its key under src/', () => {
		expect(fileKey('./flows/x.c4')).toBe('/src/flows/x.c4');
		expect(fileKey('flows\\x.c4')).toBe('/src/flows/x.c4');
		expect(fileKey('a/../b.c4')).toBe('/src/b.c4');
	});

	it('rejects a file prop that leaves src/ or is not a .c4 file', () => {
		expect(fileKey('../outside.c4')).toBeNull();
		expect(fileKey('/etc/x.c4')).toBeNull();
		expect(fileKey('C:/x.c4')).toBeNull();
		expect(fileKey('flows/x.txt')).toBeNull();
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
