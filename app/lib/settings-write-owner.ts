/** Per-document coordinator for runtime and form settings writes. */
export function createSettingsWriteOwner() {
    let conflict = false;
    const assertWritable = () => {
        if (conflict) throw new Error('Unresolved runtime settings conflict');
    };
    return {
        hasConflict: () => conflict,
        markConflict: () => { conflict = true; },
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
        async saveRuntime<R extends { ok: boolean; status: number }>({ post, onConflict }: {
            post: () => Promise<R>;
            onConflict?: () => void;
        }): Promise<R> {
            assertWritable();
            const response = await post();
            if (response.status === 409) {
                conflict = true;
                onConflict?.();
                throw new Error('Failed to save settings: revision conflict');
            }
            return response;
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
