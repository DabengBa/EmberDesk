/* eslint-disable */
// Generated from app/lib/settings-write-owner.ts; run node scripts/build-settings-write-owner.mjs.
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
        rebaseForm                                          (ports






         )           {
            const provider = ports.rebaseProvider(ports.provider(ports.base), ports.provider(ports.local), ports.provider(ports.remote));
            if (provider === null || ports.formConflict(ports.baseline, ports.values, ports.formDefaults(ports.remote))) return null;
            return { ...ports.buildPayload(ports.remote, ports.values, { settingsRevision: ports.revision, baselineFormValues: ports.baseline }), oai_settings: provider };
        },
        async saveRuntime                                           ({ post, onConflict }


         )             {
            assertWritable();
            const response = await post();
            if (response.status === 409) {
                conflict = true;
                onConflict?.();
                throw new Error('Failed to save settings: revision conflict');
            }
            return response;
        },
        async saveForm                                              ({ payload, post, rebase }



         )                                       {
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
