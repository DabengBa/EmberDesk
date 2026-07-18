export const workspaceShellFlagEnvKeys = [
    'EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER',
    'EMBERDESK_FEATURES_REACT_SHELL_STRICT',
];

export const workspacePanelFlagEnvKeys = [
    'EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST',
    'EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO',
    'EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY',
    'EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST',
    'EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING',
    'EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING',
];

const workspaceShellProofSpecFiles = new Set([
    'workspace-shell-panel-navigation.e2e.js',
    'character-group-authoring.e2e.js',
    'world-info-workbench.e2e.js',
    'extensions-host.e2e.js',
]);

const authoringProofSpecFiles = new Set([
    'character-group-authoring.e2e.js',
]);

export function getRequestedE2eSpecFiles(argv = []) {
    const seen = new Set();
    const files = [];

    for (const argument of argv) {
        const match = String(argument).match(/(?:^|[\\/])?([^\\/]+\.e2e\.js)$/);
        if (!match || seen.has(match[1])) {
            continue;
        }

        seen.add(match[1]);
        files.push(match[1]);
    }

    return files;
}

export function shouldEnableWorkspaceShellProofFlags(argv = []) {
    const requestedSpecFiles = getRequestedE2eSpecFiles(argv);

    return requestedSpecFiles.length === 0
        || requestedSpecFiles.some(fileName => workspaceShellProofSpecFiles.has(fileName));
}

export function shouldEnableAuthoringProofFlags(argv = []) {
    const requestedSpecFiles = getRequestedE2eSpecFiles(argv);

    return requestedSpecFiles.length === 0
        || requestedSpecFiles.some(fileName => authoringProofSpecFiles.has(fileName));
}

export function applyWorkspaceReactPlaywrightFlagDefaults(env = process.env, argv = process.argv) {
    const shellProofEnabled = shouldEnableWorkspaceShellProofFlags(argv);
    const authoringProofEnabled = shouldEnableAuthoringProofFlags(argv);

    // Authoring panels are sole-owner; always enable for e2e bootstrap compatibility.
    env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING = 'true';
    env.EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING = 'true';
    // Extensions Host is sole-owner; always enable for e2e bootstrap compatibility.
    env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST = 'true';
    // Main Chat message list is sole-owner; always enable for e2e bootstrap compatibility.
    env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST = 'true';

    if (shellProofEnabled) {
        env.EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER ??= 'true';
        env.EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO ??= 'true';
        env.EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY ??= 'true';
        env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST ??= 'true';
    }

    return {
        authoringProofEnabled,
        shellProofEnabled,
    };
}

export function shouldBuildCharacterLibraryPanel() {
    return true;
}

export function shouldBuildWorkspacePanels(env = process.env) {
    // Character/Group Authoring are sole-owner React surfaces; workspace-panels bundle is required.
    return true;
}

export function hasEnabledWorkspaceReactPlaywrightFlag(env = process.env) {
    return workspaceShellFlagEnvKeys.some(envKey => env[envKey] === 'true')
        || workspacePanelFlagEnvKeys.some(envKey => env[envKey] === 'true');
}
