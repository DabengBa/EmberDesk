import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import { CheckRepoActions, default as simpleGit } from 'simple-git';

import { PUBLIC_DIRECTORIES } from '../constants.js';
import { getConfigValue } from '../util.js';
import { createGitClient } from '../git/client.js';
import { getExtensionRepositoryUpdateState } from '../extension-repo-update-state.js';
import {
    EXTENSION_REASON,
    buildExtensionFailureEnvelope,
    createExtensionDecision,
    httpStatusForExtensionDecision,
    normalizeExtensionFolderName,
    preflightExtensionInstall,
    preflightExtensionMutation,
    validateExtensionManifest,
} from '../extension-operation-safety.js';

const gitBackend = getConfigValue('git.backend', 'auto');

/**
 * @type {Partial<import('simple-git').SimpleGitOptions>}
 */
const OPTIONS = Object.freeze({ timeout: { block: 5 * 60 * 1000 } });

/**
 * This function extracts the extension information from the manifest file.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<Object>} - Returns the manifest data as an object
 */
async function getManifest(extensionPath) {
    const manifestPath = path.join(extensionPath, 'manifest.json');

    // Check if manifest.json exists
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file not found at ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest;
}

/**
 * This function checks if the local repository is up-to-date with the remote repository.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<Object>} - Returns the extension information as an object
 */
async function checkIfRepoIsUpToDate(extensionPath) {
    const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
    return getExtensionRepositoryUpdateState(git);
}

/**
 * Send a structured extension operation failure without exposing local paths.
 * @param {import('express').Response} response
 * @param {object} decision
 */
function sendExtensionFailure(response, decision) {
    return response
        .status(httpStatusForExtensionDecision(decision))
        .json(buildExtensionFailureEnvelope(decision));
}

/**
 * @param {import('express').Request} request
 * @param {boolean} globalFlag
 * @returns {{ userExtensionsDir: string, globalExtensionsDir: string, isAdmin: boolean, scope: 'local'|'global' }}
 */
function getExtensionOperationContext(request, globalFlag) {
    return {
        userExtensionsDir: request.user.directories.extensions,
        globalExtensionsDir: PUBLIC_DIRECTORIES.globalExtensions,
        isAdmin: Boolean(request.user.profile.admin),
        scope: globalFlag ? 'global' : 'local',
    };
}

/**
 * @param {string} extensionPath
 * @returns {import('simple-git').SimpleGit}
 */
function createExtensionGit(extensionPath) {
    return simpleGit({ baseDir: extensionPath, ...OPTIONS });
}

/**
 * @param {string} operation
 * @param {import('express').Request} request
 * @param {string} [message]
 */
function retryableFailure(operation, request, message = 'Internal Server Error. Check the server logs for more details.') {
    return createExtensionDecision({
        allowed: false,
        operation,
        scope: request.body?.global ? 'global' : 'local',
        extensionName: typeof request.body?.extensionName === 'string' ? request.body.extensionName : null,
        failureClass: 'retryable',
        actionHints: ['retry_or_inspect_logs'],
        message,
    });
}

export const router = express.Router();

/**
 * Feature flag guard: don't allow calling any of the endpoints if extensions are disabled
 * @type {import('express').RequestHandler}
 */
export const extensionsEnabledFeatureGuard = (_, response, next) => {
    const enabled = !!getConfigValue('extensions.enabled', true, 'boolean');
    if (!enabled) {
        response.sendStatus(404);
        return;
    }
    next();
};

router.use(extensionsEnabledFeatureGuard);

/**
 * HTTP POST handler function to clone a git repository from a provided URL, read the extension manifest,
 * and return extension information and path.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with a 'url' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/install', async (request, response) => {
    try {
        const { url, global, branch } = request.body;
        const context = getExtensionOperationContext(request, Boolean(global));
        const decision = preflightExtensionInstall({
            url,
            scope: context.scope,
            isAdmin: context.isAdmin,
            userExtensionsDir: context.userExtensionsDir,
            globalExtensionsDir: context.globalExtensionsDir,
            branch: branch || null,
        });
        if (!decision.allowed) {
            if (decision.reason === EXTENSION_REASON.FORBIDDEN_GLOBAL) {
                console.error(`User ${request.user.profile.handle} does not have permission to install global extensions.`);
            }
            return sendExtensionFailure(response, decision);
        }

        // make sure the third-party directory exists
        if (!fs.existsSync(context.userExtensionsDir)) {
            fs.mkdirSync(context.userExtensionsDir);
        }

        if (!fs.existsSync(context.globalExtensionsDir)) {
            fs.mkdirSync(context.globalExtensionsDir);
        }

        const extensionPath = decision.extensionPath;
        const folderName = decision.extensionName;
        const cloneUrl = decision.details?.url || url;
        const git = createGitClient({ backend: gitBackend });
        const cloneOptions = { depth: 1 };
        if (branch) {
            cloneOptions.branch = branch;
        }
        await git.clone(cloneUrl, extensionPath, cloneOptions);
        console.info(`Extension has been cloned to ${extensionPath} from ${cloneUrl} at ${branch || '(default)'} branch`);

        try {
            const manifest = await getManifest(extensionPath);
            const validated = validateExtensionManifest(manifest);
            if (!validated.ok) {
                throw new Error('Manifest is not a valid JSON object.');
            }
            const { version, author, display_name } = validated.manifest;
            // Keep legacy success shape.
            return response.send({ version, author, display_name, extensionPath, folderName });
        } catch (manifestError) {
            await fs.promises.rm(extensionPath, { recursive: true, force: true });
            console.error('Importing extension failed', manifestError);
            return sendExtensionFailure(response, createExtensionDecision({
                allowed: false,
                operation: 'install',
                scope: decision.scope,
                extensionName: decision.extensionName,
                reason: EXTENSION_REASON.INVALID_MANIFEST,
            }));
        }
    } catch (error) {
        console.error('Importing extension failed', error);
        return response.status(500).json(buildExtensionFailureEnvelope(retryableFailure('install', request)));
    }
});

/**
 * HTTP POST handler function to pull the latest updates from a git repository
 * based on the extension name provided in the request body. It returns the latest commit hash,
 * the path of the extension, the status of the repository (whether it's up-to-date or not),
 * and the remote URL of the repository.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with an 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/update', async (request, response) => {
    try {
        const { extensionName, global } = request.body;
        const context = getExtensionOperationContext(request, Boolean(global));
        const decision = await preflightExtensionMutation({
            operation: 'update',
            scope: context.scope,
            extensionName,
            isAdmin: context.isAdmin,
            userExtensionsDir: context.userExtensionsDir,
            globalExtensionsDir: context.globalExtensionsDir,
            createGit: createExtensionGit,
        });
        if (!decision.allowed) {
            if (decision.reason === EXTENSION_REASON.FORBIDDEN_GLOBAL) {
                console.error(`User ${request.user.profile.handle} does not have permission to update global extensions.`);
            }
            return sendExtensionFailure(response, decision);
        }

        const extensionPath = decision.extensionPath;
        const { isUpToDate, remoteUrl, skippedReason } = await checkIfRepoIsUpToDate(extensionPath);
        // If auto-update helper still reports a blocked state, never pull.
        if (skippedReason) {
            return sendExtensionFailure(response, createExtensionDecision({
                allowed: false,
                operation: 'update',
                scope: decision.scope,
                extensionName: decision.extensionName,
                reason: skippedReason,
            }));
        }

        const git = createExtensionGit(extensionPath);
        const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
        if (!isRepo) {
            return sendExtensionFailure(response, createExtensionDecision({
                allowed: false,
                operation: 'update',
                scope: decision.scope,
                extensionName: decision.extensionName,
                reason: EXTENSION_REASON.NOT_A_REPO,
            }));
        }
        const currentBranch = await git.branch();
        if (!isUpToDate) {
            await git.pull('origin', currentBranch.current);
            console.info(`Extension has been updated at ${extensionPath}`);
        } else {
            console.info(`Extension is up to date at ${extensionPath}`);
        }
        await git.fetch('origin');
        const fullCommitHash = await git.revparse(['HEAD']);
        const shortCommitHash = fullCommitHash.slice(0, 7);

        // Keep legacy success shape.
        return response.send({ shortCommitHash, extensionPath, isUpToDate, remoteUrl });
    } catch (error) {
        console.error('Updating extension failed', error);
        return response.status(500).json(buildExtensionFailureEnvelope(retryableFailure('update', request)));
    }
});

router.post('/branches', async (request, response) => {
    try {
        const { extensionName, global } = request.body;
        const extensionNameSanitized = normalizeExtensionFolderName(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to list branches of global extensions.`);
            return response.status(403).send('Forbidden: No permission to list branches of global extensions.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        // Unshallow the repository if it is shallow
        const isShallow = await git.revparse(['--is-shallow-repository']) === 'true';
        if (isShallow) {
            console.info(`Unshallowing the repository at ${extensionPath}`);
            await git.fetch('origin', ['--unshallow']);
        }

        // Fetch all branches
        await git.remote(['set-branches', 'origin', '*']);
        await git.fetch('origin');
        const localBranches = await git.branchLocal();
        const remoteBranches = await git.branch(['-r', '--list', 'origin/*']);
        const result = [
            ...Object.values(localBranches.branches),
            ...Object.values(remoteBranches.branches),
        ].map(b => ({ current: b.current, commit: b.commit, name: b.name, label: b.label }));

        return response.send(result);
    } catch (error) {
        console.error('Getting branches failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

router.post('/switch', async (request, response) => {
    try {
        const { extensionName, branch, global } = request.body;
        if (branch == null || branch === '') {
            return sendExtensionFailure(response, createExtensionDecision({
                allowed: false,
                operation: 'switch',
                scope: global ? 'global' : 'local',
                extensionName: typeof extensionName === 'string' ? extensionName : null,
                reason: EXTENSION_REASON.INVALID_EXTENSION_NAME,
                message: 'Bad Request: A valid extensionName and branch are required in the request body.',
            }));
        }

        const context = getExtensionOperationContext(request, Boolean(global));
        const decision = await preflightExtensionMutation({
            operation: 'switch',
            scope: context.scope,
            extensionName,
            isAdmin: context.isAdmin,
            userExtensionsDir: context.userExtensionsDir,
            globalExtensionsDir: context.globalExtensionsDir,
            createGit: createExtensionGit,
        });
        if (!decision.allowed) {
            if (decision.reason === EXTENSION_REASON.FORBIDDEN_GLOBAL) {
                console.error(`User ${request.user.profile.handle} does not have permission to switch branches of global extensions.`);
            }
            return sendExtensionFailure(response, decision);
        }

        const extensionPath = decision.extensionPath;
        const git = createExtensionGit(extensionPath);
        const branches = await git.branchLocal();

        if (String(branch).startsWith('origin/')) {
            const localBranch = branch.replace('origin/', '');
            if (branches.all.includes(localBranch)) {
                console.info(`Branch ${localBranch} already exists locally, checking it out`);
                await git.checkout(localBranch);
                return response.sendStatus(204);
            }

            console.info(`Branch ${localBranch} does not exist locally, creating it from ${branch}`);
            await git.checkoutBranch(localBranch, branch);
            return response.sendStatus(204);
        }

        if (!branches.all.includes(branch)) {
            console.error(`Branch ${branch} does not exist locally`);
            return sendExtensionFailure(response, createExtensionDecision({
                allowed: false,
                operation: 'switch',
                scope: decision.scope,
                extensionName: decision.extensionName,
                reason: EXTENSION_REASON.BRANCH_MISSING,
                message: `Branch ${branch} does not exist locally`,
            }));
        }

        // Check if the branch is already checked out
        const currentBranch = await git.branch();
        if (currentBranch.current === branch) {
            console.info(`Branch ${branch} is already checked out`);
            return response.sendStatus(204);
        }

        // Checkout the branch
        await git.checkout(branch);
        console.info(`Checked out branch ${branch} at ${extensionPath}`);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Switching branches failed', error);
        return response.status(500).json(buildExtensionFailureEnvelope(retryableFailure('switch', request)));
    }
});

router.post('/move', async (request, response) => {
    try {
        const { extensionName, source, destination } = request.body;
        const decision = await preflightExtensionMutation({
            operation: 'move',
            scope: source,
            destinationScope: destination,
            extensionName,
            isAdmin: Boolean(request.user.profile.admin),
            userExtensionsDir: request.user.directories.extensions,
            globalExtensionsDir: PUBLIC_DIRECTORIES.globalExtensions,
            createGit: createExtensionGit,
        });
        if (!decision.allowed) {
            if (decision.reason === EXTENSION_REASON.FORBIDDEN_MOVE) {
                console.error(`User ${request.user.profile.handle} does not have permission to move extensions.`);
            }
            return sendExtensionFailure(response, decision);
        }

        fs.cpSync(decision.extensionPath, decision.destinationPath, { recursive: true, force: true });
        fs.rmSync(decision.extensionPath, { recursive: true, force: true });
        console.info(`Extension has been moved from ${decision.extensionPath} to ${decision.destinationPath}`);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Moving extension failed', error);
        return response.status(500).json(buildExtensionFailureEnvelope(retryableFailure('move', request)));
    }
});

/**
 * HTTP POST handler function to get the current git commit hash and branch name for a given extension.
 * It checks whether the repository is up-to-date with the remote, and returns the status along with
 * the remote URL of the repository.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with an 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/version', async (request, response) => {
    try {
        const { extensionName, global } = request.body;
        const extensionNameSanitized = normalizeExtensionFolderName(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        let currentCommitHash;
        try {
            const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) {
                throw new Error(`Directory is not a Git repository at ${extensionPath}`);
            }
            currentCommitHash = await git.revparse(['HEAD']);
        } catch (error) {
            // it is not a git repo, or has no commits yet, or is a bare repo
            // not possible to update it, most likely can't get the branch name either
            return response.send({ currentBranchName: '', currentCommitHash: '', isUpToDate: true, remoteUrl: '' });
        }

        const currentBranch = await git.branch();
        // get only the working branch
        const currentBranchName = currentBranch.current;
        await git.fetch('origin');
        console.debug(extensionNameSanitized, currentBranchName, currentCommitHash);
        const { isUpToDate, remoteUrl } = await checkIfRepoIsUpToDate(extensionPath);

        return response.send({ currentBranchName, currentCommitHash, isUpToDate, remoteUrl });
    } catch (error) {
        console.error('Getting extension version failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

/**
 * HTTP POST handler function to delete a git repository based on the extension name provided in the request body.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with a 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/delete', async (request, response) => {
    try {
        const { extensionName, global } = request.body;
        const context = getExtensionOperationContext(request, Boolean(global));
        const decision = await preflightExtensionMutation({
            operation: 'delete',
            scope: context.scope,
            extensionName,
            isAdmin: context.isAdmin,
            userExtensionsDir: context.userExtensionsDir,
            globalExtensionsDir: context.globalExtensionsDir,
            createGit: createExtensionGit,
        });
        if (!decision.allowed) {
            if (decision.reason === EXTENSION_REASON.FORBIDDEN_GLOBAL) {
                console.error(`User ${request.user.profile.handle} does not have permission to delete global extensions.`);
            }
            return sendExtensionFailure(response, decision);
        }

        await fs.promises.rm(decision.extensionPath, { recursive: true });
        console.info(`Extension has been deleted at ${decision.extensionPath}`);

        // Keep legacy success shape (plain text path message).
        return response.send(`Extension has been deleted at ${decision.extensionPath}`);
    } catch (error) {
        console.error('Deleting extension failed', error);
        return response.status(500).json(buildExtensionFailureEnvelope(retryableFailure('delete', request)));
    }
});

/**
 * Discover the extension folders
 * If the folder is called third-party, search for subfolders instead
 */
router.get('/discover', function (request, response) {
    if (!fs.existsSync(path.join(request.user.directories.extensions))) {
        fs.mkdirSync(path.join(request.user.directories.extensions));
    }

    if (!fs.existsSync(PUBLIC_DIRECTORIES.globalExtensions)) {
        fs.mkdirSync(PUBLIC_DIRECTORIES.globalExtensions);
    }

    // Get all folders in system extensions folder, excluding third-party
    const builtInExtensions = fs
        .readdirSync(PUBLIC_DIRECTORIES.extensions)
        .filter(f => fs.statSync(path.join(PUBLIC_DIRECTORIES.extensions, f)).isDirectory())
        .filter(f => f !== 'third-party')
        .map(f => ({ type: 'system', name: f }));

    // Get all folders in local extensions folder
    const userExtensions = fs
        .readdirSync(path.join(request.user.directories.extensions))
        .filter(f => fs.statSync(path.join(request.user.directories.extensions, f)).isDirectory())
        .map(f => ({ type: 'local', name: `third-party/${f}` }));

    // Get all folders in global extensions folder
    // In case of a conflict, the extension will be loaded from the user folder
    const globalExtensions = fs
        .readdirSync(PUBLIC_DIRECTORIES.globalExtensions)
        .filter(f => fs.statSync(path.join(PUBLIC_DIRECTORIES.globalExtensions, f)).isDirectory())
        .map(f => ({ type: 'global', name: `third-party/${f}` }))
        .filter(f => !userExtensions.some(e => e.name === f.name));

    // Combine all extensions
    const allExtensions = [...builtInExtensions, ...userExtensions, ...globalExtensions];
    console.debug('Extensions available for', request.user.profile.handle, allExtensions);

    return response.send(allExtensions);
});
