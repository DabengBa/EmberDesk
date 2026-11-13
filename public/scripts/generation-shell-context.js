let generationShellContext = null;
let generationLifecycleService = null;

/** Protect the asynchronous runtime-load gap before the lifecycle owns a foreground entry. */
export function createGenerationBootstrapAdmission() {
    let active = null;
    return {
        enter() {
            if (active) return null;
            const controller = new AbortController();
            active = controller;
            return {
                signal: controller.signal,
                release() { if (active === controller) active = null; },
            };
        },
        stop() {
            if (!active || active.signal.aborted) return false;
            active.abort();
            return true;
        },
    };
}

/** Share one bootstrap across simultaneous generation requests; retry a failed bundle load. */
export function createGenerationRuntimeBootstrap({ load, readIdentity, installLifecycle, installAttempt }) {
    let pending;
    return function ensureGenerationRuntime() {
        if (!pending) {
            pending = Promise.resolve().then(load).then(runtime => {
                if (typeof runtime.createGenerationLifecycleService !== 'function' || typeof runtime.executeGenerationAttempts !== 'function') {
                    throw new TypeError('Workspace bundle does not export the generation runtime.');
                }
                installAttempt(runtime.executeGenerationAttempts);
                installLifecycle(runtime.createGenerationLifecycleService(readIdentity));
            }).catch(error => {
                pending = undefined;
                throw error;
            });
        }
        return pending;
    };
}

/** Install the single bundle-created runtime before generation can begin. */
export function installGenerationLifecycleService(service) {
    if (!service || typeof service.run !== 'function') throw new TypeError('Generation lifecycle service requires a run method.');
    if (generationLifecycleService && generationLifecycleService !== service) throw new Error('Generation lifecycle service already installed.');
    generationLifecycleService = service;
}

export function getGenerationLifecycleService() {
    if (!generationLifecycleService) throw new Error('Generation lifecycle service is not installed.');
    return generationLifecycleService;
}

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
