/** Structured prompts for the existing preset service and import/export commands. */
export function createPresetDialogs({ showLocalDialog, t }) {
    const show = request => showLocalDialog({ ...request, scope: 'presets' });
    const cancel = () => ({ id: 'cancel', label: t`Cancel` });
    const confirm = async (title, message, label = t`OK`, variant = 'primary') => (await show({
        title, message,
        actions: [{ id: 'confirm', label, variant }, cancel()],
    }))?.action === 'confirm';

    return {
        async confirmSwitch() {
            const result = await show({
                title: t`Unsaved preset changes`,
                message: t`The current preset has unsaved changes. Save before switching?`,
                actions: [{ id: 'save', label: t`Save and switch`, variant: 'primary' }, { id: 'discard', label: t`Switch without saving` }, cancel()],
            });
            return result?.action === 'save' ? 'save' : result?.action === 'discard' ? 'discard' : 'cancel';
        },
        async askName(current) {
            const result = await show({
                title: t`Preset name:`, message: t`Hint: Use a character name to bind preset to a specific chat.`,
                fields: [{ type: 'text', name: 'name', label: t`Preset name:`, value: current }],
                actions: [{ id: 'save', label: t`Save`, variant: 'primary', required: ['name'] }, cancel()], initialFocus: 'name',
            });
            return result?.action === 'save' ? String(result.values.name) : null;
        },
        confirmDelete: () => confirm(t`Are you sure?`, t`Delete the preset? This action is irreversible and your current settings will be overwritten.`, t`Delete`, 'destructive'),
        confirmRestore: isDefault => confirm(t`Are you sure?`, isDefault ? t`Resetting a default preset will restore the default settings.` : t`Resetting a custom preset will restore to the last saved state.`),
        confirmOverwrite: () => confirm(t`Preset name already exists. Overwrite?`, undefined),
        async confirmSensitiveFields(mode, preset, fields) {
            const importing = mode === 'import';
            const result = await show({
                title: importing ? t`The imported preset contains proxy and/or custom endpoint settings.` : t`Your preset contains proxy and/or custom endpoint settings.`,
                message: fields.map(field => importing ? field : `${field}: ${preset[field]}`).join('\n'),
                actions: [
                    { id: 'remove', label: t`Remove them`, variant: 'primary' },
                    { id: 'keep', label: importing ? t`Import as-is` : t`Keep them` },
                    cancel(),
                ],
            });
            return result?.action === 'remove' ? 'remove' : result?.action === 'keep' ? 'keep' : null;
        },
        async chooseConnectionData() {
            const result = await show({
                title: t`Do you want to export connection data with the preset?`,
                message: `${t`This includes the selected source, models, and other preferences set in the API Connections panel.`}\n${t`Your stored API keys are never exported.`}`,
                fields: [{ type: 'radio', name: 'connection', label: t`Export connection data`, value: 'false', options: [
                    { value: 'true', label: t`Export connection data` }, { value: 'false', label: t`Do not export connection data` },
                ] }],
                actions: [{ id: 'export', label: t`Export`, variant: 'primary' }],
                // The former TEXT popup exported on user close as well. Scope
                // disposal/abort still resolves null and cancels the operation.
                closeAction: 'export',
            });
            return result?.action === 'export' ? result.values.connection === 'true' : null;
        },
    };
}
