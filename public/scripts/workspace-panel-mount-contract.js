export const WORKSPACE_PANEL_MOUNT_STATUSES = Object.freeze({
    FALLBACK: 'fallback',
    MOUNTED: 'mounted',
});

export const WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS = Object.freeze({
    BUNDLE_LOAD_FAILED: 'bundle-load-failed',
    FEATURE_DISABLED: 'feature-disabled',
    MISSING_CONTAINER: 'missing-container',
    MOUNT_FAILED: 'mount-failed',
});

export function createWorkspacePanelMountedResult(kind) {
    return {
        kind,
        mounted: true,
        status: WORKSPACE_PANEL_MOUNT_STATUSES.MOUNTED,
    };
}

export function createWorkspacePanelFallbackResult(kind, reason) {
    return {
        kind,
        mounted: false,
        reason,
        status: WORKSPACE_PANEL_MOUNT_STATUSES.FALLBACK,
    };
}
