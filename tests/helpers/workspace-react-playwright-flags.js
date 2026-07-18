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

export function applyWorkspaceReactPlaywrightFlagDefaults() {
    // React shell and declared child slots are release requirements, not test flags.
    return {
        authoringProofEnabled: true,
        shellProofEnabled: true,
    };
}

export function shouldBuildCharacterLibraryPanel() {
    return true;
}

export function shouldBuildWorkspacePanels() {
    return true;
}

export function hasEnabledWorkspaceReactPlaywrightFlag() {
    return false;
}
