import { describe, expect, test } from '@jest/globals';
import { getExtensionRepositoryUpdateState } from '../src/extension-repo-update-state.js';

function createGitDouble({
    remotes = [{ refs: { fetch: 'https://example.test/repo.git' } }],
    initialStatus = { isClean: () => true, detached: false },
    refreshedStatus = initialStatus,
    branch = {
        current: 'main',
        detached: false,
        all: ['main', 'remotes/origin/main'],
        branches: {},
    },
    logTotal = 0,
} = {}) {
    const calls = [];
    return {
        calls,
        git: {
            getRemotes: async () => {
                calls.push('getRemotes');
                return remotes;
            },
            status: async () => {
                calls.push('status');
                return calls.filter(call => call === 'status').length === 1 ? initialStatus : refreshedStatus;
            },
            branch: async () => {
                calls.push('branch');
                return branch;
            },
            fetch: async () => {
                calls.push('fetch');
            },
            revparse: async () => {
                calls.push('revparse');
                return 'abc123';
            },
            log: async () => {
                calls.push('log');
                return { total: logTotal };
            },
        },
    };
}

describe('getExtensionRepositoryUpdateState', () => {
    test('skips detached extension repositories instead of checking an invalid remote ref', async () => {
        const { git, calls } = createGitDouble({
            initialStatus: { isClean: () => true, detached: true },
        });

        await expect(getExtensionRepositoryUpdateState(git)).resolves.toEqual({
            isUpToDate: true,
            remoteUrl: 'https://example.test/repo.git',
            skippedReason: 'detached-head',
        });
        expect(calls).not.toContain('fetch');
        expect(calls).not.toContain('log');
    });

    test('skips dirty extension repositories so auto-update does not overwrite local edits', async () => {
        const { git, calls } = createGitDouble({
            initialStatus: { isClean: () => false, detached: false },
        });

        await expect(getExtensionRepositoryUpdateState(git)).resolves.toMatchObject({
            isUpToDate: true,
            skippedReason: 'dirty-worktree',
        });
        expect(calls).not.toContain('fetch');
        expect(calls).not.toContain('log');
    });

    test('skips repositories without an upstream branch', async () => {
        const { git, calls } = createGitDouble({
            branch: {
                current: 'feature',
                detached: false,
                all: ['feature'],
                branches: {},
            },
            refreshedStatus: { isClean: () => true, detached: false, tracking: null },
        });

        await expect(getExtensionRepositoryUpdateState(git)).resolves.toMatchObject({
            isUpToDate: true,
            skippedReason: 'missing-upstream',
        });
        expect(calls).toContain('fetch');
        expect(calls).not.toContain('log');
    });

    test('reports repositories with remote commits as not up to date', async () => {
        const { git } = createGitDouble({
            refreshedStatus: { isClean: () => true, detached: false, tracking: 'origin/main' },
            logTotal: 2,
        });

        await expect(getExtensionRepositoryUpdateState(git)).resolves.toEqual({
            isUpToDate: false,
            remoteUrl: 'https://example.test/repo.git',
        });
    });
});
