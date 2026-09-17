let generationShellContext = null;

export function registerGenerationShellContext(context) {
    generationShellContext = context;
}

export function getGenerationShellContext() {
    return generationShellContext;
}

export function requireGenerationShellContext() {
    if (!generationShellContext) {
        throw new Error('Generation shell context is not registered.');
    }

    return generationShellContext;
}

export function clearGenerationShellContext() {
    generationShellContext = null;
}
