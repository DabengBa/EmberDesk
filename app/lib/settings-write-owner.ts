/** Per-document coordinator for runtime and form settings writes. */
export function createSettingsWriteOwner() {
    let conflict = false;
    let revision: number | null = null;
    let pendingWrite = Promise.resolve();
    const assertWritable = () => {
        if (conflict) throw new Error('Unresolved runtime settings conflict');
    };
    return {
        getRevision: () => revision,
        observeRevision(value: unknown): boolean {
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || (revision !== null && value < revision)) return false;
            revision = value;
            return true;
        },
        // Include payload construction and publication of the committed revision.
        runWrite<T>(write: () => Promise<T>): Promise<T> {
            const operation = pendingWrite.then(write);
            pendingWrite = operation.then(() => undefined, () => undefined);
            return operation;
        },
        hasConflict: () => conflict,
        markConflict: () => { conflict = true; },
        clearConflict: () => { conflict = false; },
        assertWritable,
        rebaseForm<D extends object, V, P extends object, S>(ports: {
            base: D; local: P; remote: D; values: V; baseline: V; revision: number | null;
            provider: (document: D | P) => S;
            rebaseProvider: (base: S, local: S, remote: S) => S | null;
            formDefaults: (document: D) => V;
            formConflict: (base: V, local: V, remote: V) => boolean;
            buildPayload: (remote: D, values: V, options: { settingsRevision: number | null; baselineFormValues: V }) => P;
        }): P | null {
            const provider = ports.rebaseProvider(ports.provider(ports.base), ports.provider(ports.local), ports.provider(ports.remote));
            if (provider === null || ports.formConflict(ports.baseline, ports.values, ports.formDefaults(ports.remote))) return null;
            return { ...ports.buildPayload(ports.remote, ports.values, { settingsRevision: ports.revision, baselineFormValues: ports.baseline }), oai_settings: provider };
        },

        async saveForm<P, R extends { ok: boolean; status: number }>({ payload, post, rebase }: {
            payload: P;
            post: (payload: P) => Promise<R>;
            rebase: (payload: P) => Promise<P | null>;
        }): Promise<{ response: R; payload: P }> {
            assertWritable();
            let saved = payload;
            let response = await post(saved);
            if (response.status === 409) {
                assertWritable();
                const rebased = await rebase(saved);
                if (rebased !== null) {
                    saved = rebased;
                    assertWritable();
                    response = await post(saved);
                }
            }
            return { response, payload: saved };
        },
    };
}

export type SettingsWriteOwner = ReturnType<typeof createSettingsWriteOwner>;
