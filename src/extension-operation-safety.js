import fs from 'node:fs';
import path from 'node:path';

import sanitize from 'sanitize-filename';

import { isPathUnderParent, isValidUrl } from './util.js';

/**
 * @typedef {'retryable' | 'user_action_required' | 'forbidden' | 'invalid_request'} ExtensionFailureClass
 */

export const EXTENSION_FAILURE_CLASS = Object.freeze({
    RETRYABLE: 'retryable',
    USER_ACTION_REQUIRED: 'user_action_required',
    FORBIDDEN: 'forbidden',
    INVALID_REQUEST: 'invalid_request',
});

export const EXTENSION_REASON = Object.freeze({
    DIRTY_WORKTREE: 'dirty-worktree',
    DETACHED_HEAD: 'detached-head',
    MISSING_UPSTREAM: 'missing-upstream',
    MISSING_WORKTREE: 'missing-worktree',
    NOT_A_REPO: 'not-a-repo',
    INVALID_MANIFEST: 'invalid-manifest',
    PATH_COLLISION: 'path-collision',
    DESTINATION_EXISTS: 'destination-exists',
    SOURCE_MISSING: 'source-missing',
    SAME_SCOPE: 'same-scope',
    INVALID_URL: 'invalid-url',
    INVALID_EXTENSION_NAME: 'invalid-extension-name',
    INVALID_SCOPE: 'invalid-scope',
    FORBIDDEN_GLOBAL: 'forbidden-global',
    FORBIDDEN_MOVE: 'forbidden-move',
    BRANCH_MISSING: 'branch-missing',
    PATH_ESCAPE: 'path-escape',
    NO_REMOTE: 'no-remote',
});

const REASON_MESSAGES = Object.freeze({
    [EXTENSION_REASON.DIRTY_WORKTREE]: 'Extension has local uncommitted changes. Commit or stash them before continuing.',
    [EXTENSION_REASON.DETACHED_HEAD]: 'Extension repository is in a detached HEAD state. Check out a branch before continuing.',
    [EXTENSION_REASON.MISSING_UPSTREAM]: 'Extension branch has no upstream tracking branch. Set upstream before updating.',
    [EXTENSION_REASON.MISSING_WORKTREE]: 'Extension directory does not exist.',
    [EXTENSION_REASON.NOT_A_REPO]: 'Extension directory is not a Git repository root.',
    [EXTENSION_REASON.INVALID_MANIFEST]: 'Extension manifest.json is missing or invalid.',
    [EXTENSION_REASON.PATH_COLLISION]: 'An extension directory already exists at the destination.',
    [EXTENSION_REASON.DESTINATION_EXISTS]: 'Destination already contains an extension with this name.',
    [EXTENSION_REASON.SOURCE_MISSING]: 'Source extension directory does not exist.',
    [EXTENSION_REASON.SAME_SCOPE]: 'Source and destination scopes are the same.',
    [EXTENSION_REASON.INVALID_URL]: 'A valid HTTP or HTTPS Git repository URL is required.',
    [EXTENSION_REASON.INVALID_EXTENSION_NAME]: 'A valid extension name is required.',
    [EXTENSION_REASON.INVALID_SCOPE]: 'A valid extension scope is required.',
    [EXTENSION_REASON.FORBIDDEN_GLOBAL]: 'No permission to modify global extensions.',
    [EXTENSION_REASON.FORBIDDEN_MOVE]: 'No permission to move extensions.',
    [EXTENSION_REASON.BRANCH_MISSING]: 'Requested branch does not exist.',
    [EXTENSION_REASON.PATH_ESCAPE]: 'Resolved extension path escapes the allowed root.',
    [EXTENSION_REASON.NO_REMOTE]: 'Extension repository has no configured remote.',
});

const REASON_ACTION_HINTS = Object.freeze({
    [EXTENSION_REASON.DIRTY_WORKTREE]: ['commit_or_stash_local_changes', 'retry_after_clean'],
    [EXTENSION_REASON.DETACHED_HEAD]: ['checkout_named_branch', 'retry_after_branch_checkout'],
    [EXTENSION_REASON.MISSING_UPSTREAM]: ['set_upstream_tracking_branch', 'retry_after_upstream'],
    [EXTENSION_REASON.MISSING_WORKTREE]: ['reinstall_extension'],
    [EXTENSION_REASON.NOT_A_REPO]: ['reinstall_as_git_extension'],
    [EXTENSION_REASON.INVALID_MANIFEST]: ['fix_manifest_json', 'reinstall_extension'],
    [EXTENSION_REASON.PATH_COLLISION]: ['choose_different_name_or_delete_existing'],
    [EXTENSION_REASON.DESTINATION_EXISTS]: ['delete_or_rename_destination', 'choose_different_destination'],
    [EXTENSION_REASON.SOURCE_MISSING]: ['reinstall_extension'],
    [EXTENSION_REASON.SAME_SCOPE]: ['choose_different_destination_scope'],
    [EXTENSION_REASON.INVALID_URL]: ['provide_http_https_git_url'],
    [EXTENSION_REASON.INVALID_EXTENSION_NAME]: ['provide_valid_extension_name'],
    [EXTENSION_REASON.INVALID_SCOPE]: ['provide_local_or_global_scope'],
    [EXTENSION_REASON.FORBIDDEN_GLOBAL]: ['use_admin_account'],
    [EXTENSION_REASON.FORBIDDEN_MOVE]: ['use_admin_account'],
    [EXTENSION_REASON.BRANCH_MISSING]: ['choose_existing_branch'],
    [EXTENSION_REASON.PATH_ESCAPE]: ['provide_valid_extension_name'],
    [EXTENSION_REASON.NO_REMOTE]: ['add_git_remote', 'reinstall_extension'],
});

/**
 * @param {object} params
 * @returns {object}
 */
export function createExtensionDecision({
    allowed,
    operation,
    scope = null,
    extensionName = null,
    reason = null,
    failureClass = null,
    actionHints = null,
    message = null,
    extensionPath = null,
    basePath = null,
    destinationPath = null,
    destinationScope = null,
    details = null,
}) {
    const resolvedFailureClass = allowed
        ? null
        : (failureClass || failureClassForReason(reason));
    const resolvedHints = allowed
        ? []
        : (Array.isArray(actionHints) ? actionHints : actionHintsForReason(reason));

    return {
        allowed: Boolean(allowed),
        operation,
        scope,
        destinationScope: destinationScope ?? null,
        extensionName: extensionName ?? null,
        reason: allowed ? null : (reason ?? null),
        failureClass: resolvedFailureClass,
        actionHints: resolvedHints,
        message: allowed ? null : (message || messageForReason(reason)),
        extensionPath: extensionPath ?? null,
        basePath: basePath ?? null,
        destinationPath: destinationPath ?? null,
        details: details && typeof details === 'object' ? details : {},
    };
}

/**
 * @param {string|null|undefined} reason
 * @returns {ExtensionFailureClass|null}
 */
export function failureClassForReason(reason) {
    switch (reason) {
        case EXTENSION_REASON.FORBIDDEN_GLOBAL:
        case EXTENSION_REASON.FORBIDDEN_MOVE:
            return EXTENSION_FAILURE_CLASS.FORBIDDEN;
        case EXTENSION_REASON.INVALID_URL:
        case EXTENSION_REASON.INVALID_EXTENSION_NAME:
        case EXTENSION_REASON.INVALID_SCOPE:
        case EXTENSION_REASON.PATH_ESCAPE:
        case EXTENSION_REASON.SAME_SCOPE:
            return EXTENSION_FAILURE_CLASS.INVALID_REQUEST;
        case EXTENSION_REASON.DIRTY_WORKTREE:
        case EXTENSION_REASON.DETACHED_HEAD:
        case EXTENSION_REASON.MISSING_UPSTREAM:
        case EXTENSION_REASON.MISSING_WORKTREE:
        case EXTENSION_REASON.NOT_A_REPO:
        case EXTENSION_REASON.INVALID_MANIFEST:
        case EXTENSION_REASON.PATH_COLLISION:
        case EXTENSION_REASON.DESTINATION_EXISTS:
        case EXTENSION_REASON.SOURCE_MISSING:
        case EXTENSION_REASON.BRANCH_MISSING:
        case EXTENSION_REASON.NO_REMOTE:
            return EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED;
        default:
            return EXTENSION_FAILURE_CLASS.RETRYABLE;
    }
}

/**
 * @param {string|null|undefined} reason
 * @returns {string[]}
 */
export function actionHintsForReason(reason) {
    return REASON_ACTION_HINTS[reason] ? [...REASON_ACTION_HINTS[reason]] : ['retry_or_inspect_logs'];
}

/**
 * @param {string|null|undefined} reason
 * @returns {string}
 */
export function messageForReason(reason) {
    return REASON_MESSAGES[reason] || 'Extension operation failed.';
}

/**
 * @param {object} decision
 * @returns {number}
 */
export function httpStatusForExtensionDecision(decision) {
    switch (decision?.reason) {
        case EXTENSION_REASON.FORBIDDEN_GLOBAL:
        case EXTENSION_REASON.FORBIDDEN_MOVE:
            return 403;
        case EXTENSION_REASON.MISSING_WORKTREE:
        case EXTENSION_REASON.SOURCE_MISSING:
        case EXTENSION_REASON.BRANCH_MISSING:
            return 404;
        case EXTENSION_REASON.DIRTY_WORKTREE:
        case EXTENSION_REASON.DETACHED_HEAD:
        case EXTENSION_REASON.MISSING_UPSTREAM:
        case EXTENSION_REASON.NOT_A_REPO:
        case EXTENSION_REASON.INVALID_MANIFEST:
        case EXTENSION_REASON.PATH_COLLISION:
        case EXTENSION_REASON.DESTINATION_EXISTS:
        case EXTENSION_REASON.NO_REMOTE:
            return 409;
        case EXTENSION_REASON.INVALID_URL:
        case EXTENSION_REASON.INVALID_EXTENSION_NAME:
        case EXTENSION_REASON.INVALID_SCOPE:
        case EXTENSION_REASON.PATH_ESCAPE:
        case EXTENSION_REASON.SAME_SCOPE:
            return 400;
        default:
            if (decision?.failureClass === EXTENSION_FAILURE_CLASS.FORBIDDEN) {
                return 403;
            }
            if (decision?.failureClass === EXTENSION_FAILURE_CLASS.INVALID_REQUEST) {
                return 400;
            }
            if (decision?.failureClass === EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED) {
                return 409;
            }
            return 500;
    }
}

/**
 * Public failure envelope for HTTP responses. Omits local paths and secrets.
 * @param {object} decision
 * @param {string} [messageOverride]
 * @returns {object}
 */
export function buildExtensionFailureEnvelope(decision, messageOverride = null) {
    return {
        ok: false,
        operation: decision.operation ?? null,
        scope: decision.scope ?? null,
        extensionName: decision.extensionName ?? null,
        reason: decision.reason ?? null,
        failureClass: decision.failureClass ?? failureClassForReason(decision.reason),
        actionHints: Array.isArray(decision.actionHints)
            ? decision.actionHints
            : actionHintsForReason(decision.reason),
        message: messageOverride || decision.message || messageForReason(decision.reason),
    };
}

/**
 * @param {'local'|'global'|boolean|null|undefined} scopeOrGlobal
 * @returns {'local'|'global'|null}
 */
export function normalizeExtensionScope(scopeOrGlobal) {
    if (scopeOrGlobal === true || scopeOrGlobal === 'global') {
        return 'global';
    }
    if (scopeOrGlobal === false || scopeOrGlobal === 'local' || scopeOrGlobal === 'user') {
        return 'local';
    }
    if (scopeOrGlobal == null) {
        return 'local';
    }
    return null;
}

/**
 * Normalize an extension folder name from UI/API input.
 * Accepts optional `third-party/` prefix and a single leading slash left by legacy UI.
 * Rejects traversal and nested path segments.
 * @param {unknown} extensionName
 * @returns {string|null}
 */
export function normalizeExtensionFolderName(extensionName) {
    if (typeof extensionName !== 'string' || !extensionName.trim()) {
        return null;
    }

    let value = extensionName.trim().replace(/\\/g, '/');
    // Accept discovery-style names and legacy UI values left after stripping the marker.
    // Only strip an explicit `third-party/` prefix (or a lone leading slash). Never strip
    // the literal characters `third-party` from a folder name like `third-party-helper`.
    if (value.startsWith('third-party/')) {
        value = value.slice('third-party/'.length);
    }
    value = value.replace(/^\/+/, '');

    if (!value || value.includes('/') || value.includes('..') || value === '.' || value === '..') {
        return null;
    }

    const extensionNameSanitized = sanitize(value);
    if (!extensionNameSanitized || extensionNameSanitized.includes('..')) {
        return null;
    }

    return extensionNameSanitized;
}

/**
 * Resolve a sanitized extension path under the chosen scope root.
 * @param {object} params
 * @returns {object}
 */
export function resolveExtensionTarget({
    scope,
    extensionName,
    userExtensionsDir,
    globalExtensionsDir,
    operation = 'resolve',
}) {
    const normalizedScope = normalizeExtensionScope(scope);
    if (!normalizedScope) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: null,
            reason: EXTENSION_REASON.INVALID_SCOPE,
        });
    }

    const extensionNameSanitized = normalizeExtensionFolderName(extensionName);
    if (!extensionNameSanitized) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: normalizedScope,
            extensionName: null,
            reason: EXTENSION_REASON.INVALID_EXTENSION_NAME,
        });
    }

    const basePath = normalizedScope === 'global' ? globalExtensionsDir : userExtensionsDir;
    if (!basePath) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: normalizedScope,
            extensionName: extensionNameSanitized,
            reason: EXTENSION_REASON.INVALID_SCOPE,
        });
    }

    const extensionPath = path.join(basePath, extensionNameSanitized);
    if (!isPathUnderParent(basePath, extensionPath)) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: normalizedScope,
            extensionName: extensionNameSanitized,
            reason: EXTENSION_REASON.PATH_ESCAPE,
        });
    }

    return createExtensionDecision({
        allowed: true,
        operation,
        scope: normalizedScope,
        extensionName: extensionNameSanitized,
        extensionPath,
        basePath,
    });
}

/**
 * Inspect Git worktree state without fetch/pull/checkout.
 * @param {import('simple-git').SimpleGit} git
 * @returns {Promise<{state: string, reason: string|null, remoteUrl: string, currentBranch: string|null}>}
 */
export async function inspectExtensionGitState(git) {
    try {
        const isRepo = await git.checkIsRepo('is-repo-root');
        if (!isRepo) {
            return {
                state: 'not-a-repo',
                reason: EXTENSION_REASON.NOT_A_REPO,
                remoteUrl: '',
                currentBranch: null,
            };
        }
    } catch {
        return {
            state: 'not-a-repo',
            reason: EXTENSION_REASON.NOT_A_REPO,
            remoteUrl: '',
            currentBranch: null,
        };
    }

    const remotes = await git.getRemotes(true);
    const remoteUrl = remotes[0]?.refs?.fetch || '';
    if (!remotes.length) {
        return {
            state: 'no-remote',
            reason: EXTENSION_REASON.NO_REMOTE,
            remoteUrl: '',
            currentBranch: null,
        };
    }

    const status = await git.status();
    if (typeof status.isClean === 'function' && !status.isClean()) {
        return {
            state: 'dirty',
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
            remoteUrl,
            currentBranch: null,
        };
    }

    const branch = await git.branch();
    if (status.detached || branch.detached || !branch.current) {
        return {
            state: 'detached',
            reason: EXTENSION_REASON.DETACHED_HEAD,
            remoteUrl,
            currentBranch: branch.current || null,
        };
    }

    if (!status.tracking) {
        return {
            state: 'no-upstream',
            reason: EXTENSION_REASON.MISSING_UPSTREAM,
            remoteUrl,
            currentBranch: branch.current,
        };
    }

    return {
        state: 'clean',
        reason: null,
        remoteUrl,
        currentBranch: branch.current,
    };
}

/**
 * @param {object} params
 * @returns {object}
 */
export function preflightExtensionInstall({
    url,
    scope,
    isAdmin,
    userExtensionsDir,
    globalExtensionsDir,
    branch = null,
}) {
    const normalizedScope = normalizeExtensionScope(scope);
    if (!normalizedScope) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            reason: EXTENSION_REASON.INVALID_SCOPE,
        });
    }

    if (normalizedScope === 'global' && !isAdmin) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: 'global',
            reason: EXTENSION_REASON.FORBIDDEN_GLOBAL,
        });
    }

    if (typeof url !== 'string' || !isValidUrl(url)) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: normalizedScope,
            reason: EXTENSION_REASON.INVALID_URL,
        });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: normalizedScope,
            reason: EXTENSION_REASON.INVALID_URL,
        });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: normalizedScope,
            reason: EXTENSION_REASON.INVALID_URL,
        });
    }

    const extensionName = sanitize(path.basename(parsedUrl.pathname, '.git'));
    if (!extensionName) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: normalizedScope,
            reason: EXTENSION_REASON.INVALID_EXTENSION_NAME,
        });
    }

    const target = resolveExtensionTarget({
        scope: normalizedScope,
        extensionName,
        userExtensionsDir,
        globalExtensionsDir,
        operation: 'install',
    });
    if (!target.allowed) {
        return target;
    }

    if (fs.existsSync(target.extensionPath)) {
        return createExtensionDecision({
            allowed: false,
            operation: 'install',
            scope: normalizedScope,
            extensionName: target.extensionName,
            extensionPath: target.extensionPath,
            basePath: target.basePath,
            reason: EXTENSION_REASON.PATH_COLLISION,
        });
    }

    return createExtensionDecision({
        allowed: true,
        operation: 'install',
        scope: normalizedScope,
        extensionName: target.extensionName,
        extensionPath: target.extensionPath,
        basePath: target.basePath,
        details: {
            url: parsedUrl.href,
            branch: branch || null,
        },
    });
}

/**
 * Operations that must never run against a dirty Git worktree.
 */
const GIT_PROTECTED_OPERATIONS = new Set(['update', 'switch', 'move', 'delete']);

/**
 * Operations that require a clean, attached, upstream-ready repo.
 * delete/move only require clean when the directory is a git repo.
 */
const GIT_REQUIRED_OPERATIONS = new Set(['update', 'switch']);

/**
 * Preflight for update/switch/move/delete. Never mutates worktree.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function preflightExtensionMutation({
    operation,
    scope,
    extensionName,
    isAdmin,
    userExtensionsDir,
    globalExtensionsDir,
    destinationScope = null,
    createGit = null,
    requireGitRepo = null,
}) {
    const normalizedScope = normalizeExtensionScope(scope);
    if (!normalizedScope) {
        return createExtensionDecision({
            allowed: false,
            operation,
            reason: EXTENSION_REASON.INVALID_SCOPE,
        });
    }

    if (operation === 'move') {
        if (!isAdmin) {
            return createExtensionDecision({
                allowed: false,
                operation: 'move',
                scope: normalizedScope,
                extensionName: typeof extensionName === 'string' ? extensionName : null,
                reason: EXTENSION_REASON.FORBIDDEN_MOVE,
            });
        }
    } else if (normalizedScope === 'global' && !isAdmin) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: 'global',
            extensionName: typeof extensionName === 'string' ? extensionName : null,
            reason: EXTENSION_REASON.FORBIDDEN_GLOBAL,
        });
    }

    const source = resolveExtensionTarget({
        scope: normalizedScope,
        extensionName,
        userExtensionsDir,
        globalExtensionsDir,
        operation,
    });
    if (!source.allowed) {
        return source;
    }

    if (!fs.existsSync(source.extensionPath) || !fs.statSync(source.extensionPath).isDirectory()) {
        return createExtensionDecision({
            allowed: false,
            operation,
            scope: normalizedScope,
            extensionName: source.extensionName,
            extensionPath: source.extensionPath,
            basePath: source.basePath,
            reason: operation === 'move' ? EXTENSION_REASON.SOURCE_MISSING : EXTENSION_REASON.MISSING_WORKTREE,
        });
    }

    let destinationDecision = null;
    if (operation === 'move') {
        const normalizedDestination = normalizeExtensionScope(destinationScope);
        if (!normalizedDestination) {
            return createExtensionDecision({
                allowed: false,
                operation: 'move',
                scope: normalizedScope,
                extensionName: source.extensionName,
                reason: EXTENSION_REASON.INVALID_SCOPE,
            });
        }
        if (normalizedDestination === normalizedScope) {
            return createExtensionDecision({
                allowed: false,
                operation: 'move',
                scope: normalizedScope,
                destinationScope: normalizedDestination,
                extensionName: source.extensionName,
                extensionPath: source.extensionPath,
                reason: EXTENSION_REASON.SAME_SCOPE,
            });
        }

        destinationDecision = resolveExtensionTarget({
            scope: normalizedDestination,
            extensionName: source.extensionName,
            userExtensionsDir,
            globalExtensionsDir,
            operation: 'move',
        });
        if (!destinationDecision.allowed) {
            return destinationDecision;
        }
        if (fs.existsSync(destinationDecision.extensionPath)) {
            return createExtensionDecision({
                allowed: false,
                operation: 'move',
                scope: normalizedScope,
                destinationScope: normalizedDestination,
                extensionName: source.extensionName,
                extensionPath: source.extensionPath,
                destinationPath: destinationDecision.extensionPath,
                reason: EXTENSION_REASON.DESTINATION_EXISTS,
            });
        }
    }

    const needsGit = requireGitRepo ?? GIT_REQUIRED_OPERATIONS.has(operation);
    const protectIfGit = GIT_PROTECTED_OPERATIONS.has(operation);

    if ((needsGit || protectIfGit) && typeof createGit === 'function') {
        const git = createGit(source.extensionPath);
        const gitState = await inspectExtensionGitState(git);

        if (needsGit) {
            if (gitState.reason) {
                return createExtensionDecision({
                    allowed: false,
                    operation,
                    scope: normalizedScope,
                    destinationScope: destinationDecision?.scope ?? null,
                    extensionName: source.extensionName,
                    extensionPath: source.extensionPath,
                    destinationPath: destinationDecision?.extensionPath ?? null,
                    basePath: source.basePath,
                    reason: gitState.reason,
                    details: {
                        remoteUrl: gitState.remoteUrl,
                        currentBranch: gitState.currentBranch,
                        gitState: gitState.state,
                    },
                });
            }
        } else if (protectIfGit && gitState.reason === EXTENSION_REASON.DIRTY_WORKTREE) {
            // delete/move: only block when directory is a git repo with dirty worktree.
            return createExtensionDecision({
                allowed: false,
                operation,
                scope: normalizedScope,
                destinationScope: destinationDecision?.scope ?? null,
                extensionName: source.extensionName,
                extensionPath: source.extensionPath,
                destinationPath: destinationDecision?.extensionPath ?? null,
                basePath: source.basePath,
                reason: EXTENSION_REASON.DIRTY_WORKTREE,
                details: {
                    remoteUrl: gitState.remoteUrl,
                    currentBranch: gitState.currentBranch,
                    gitState: gitState.state,
                },
            });
        } else if (protectIfGit && gitState.reason === EXTENSION_REASON.DETACHED_HEAD && operation === 'move') {
            return createExtensionDecision({
                allowed: false,
                operation,
                scope: normalizedScope,
                destinationScope: destinationDecision?.scope ?? null,
                extensionName: source.extensionName,
                extensionPath: source.extensionPath,
                destinationPath: destinationDecision?.extensionPath ?? null,
                basePath: source.basePath,
                reason: EXTENSION_REASON.DETACHED_HEAD,
                details: {
                    remoteUrl: gitState.remoteUrl,
                    currentBranch: gitState.currentBranch,
                    gitState: gitState.state,
                },
            });
        }
        // not-a-repo is allowed for delete of plain folders.
    }

    return createExtensionDecision({
        allowed: true,
        operation,
        scope: normalizedScope,
        destinationScope: destinationDecision?.scope ?? null,
        extensionName: source.extensionName,
        extensionPath: source.extensionPath,
        destinationPath: destinationDecision?.extensionPath ?? null,
        basePath: source.basePath,
    });
}

/**
 * Validate a parsed extension manifest object.
 * @param {unknown} manifest
 * @returns {{ok: true, manifest: object} | {ok: false, reason: string}}
 */
export function validateExtensionManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { ok: false, reason: EXTENSION_REASON.INVALID_MANIFEST };
    }
    return { ok: true, manifest };
}
