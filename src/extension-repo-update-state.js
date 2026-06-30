/**
 * Determine whether a git-backed extension can be updated safely.
 * @param {import('simple-git').SimpleGit} git
 * @returns {Promise<{isUpToDate: boolean, remoteUrl: string, skippedReason?: string}>}
 */
export async function getExtensionRepositoryUpdateState(git) {
    const remotes = await git.getRemotes(true);
    const remoteUrl = remotes[0]?.refs?.fetch || '';
    if (remotes.length === 0) {
        return { isUpToDate: true, remoteUrl, skippedReason: 'no-remote' };
    }

    const status = await git.status();
    if (typeof status.isClean === 'function' && !status.isClean()) {
        return { isUpToDate: true, remoteUrl, skippedReason: 'dirty-worktree' };
    }
    if (status.detached) {
        return { isUpToDate: true, remoteUrl, skippedReason: 'detached-head' };
    }

    const currentBranch = await git.branch();
    if (currentBranch.detached || !currentBranch.current) {
        return { isUpToDate: true, remoteUrl, skippedReason: 'detached-head' };
    }

    await git.fetch('origin');

    const refreshedStatus = await git.status();
    const refreshedBranch = await git.branch();
    const trackingBranch = refreshedStatus.tracking || `origin/${currentBranch.current}`;
    const remoteBranchNames = new Set([
        ...(refreshedBranch.all || []),
        ...Object.keys(refreshedBranch.branches || {}),
    ]);
    const hasTrackingBranch = Boolean(refreshedStatus.tracking)
        || remoteBranchNames.has(trackingBranch)
        || remoteBranchNames.has(`remotes/${trackingBranch}`);
    if (!hasTrackingBranch) {
        return { isUpToDate: true, remoteUrl, skippedReason: 'missing-upstream' };
    }

    const currentCommitHash = await git.revparse(['HEAD']);
    const log = await git.log({
        from: currentCommitHash,
        to: trackingBranch,
    });

    return {
        isUpToDate: log.total === 0,
        remoteUrl,
    };
}
