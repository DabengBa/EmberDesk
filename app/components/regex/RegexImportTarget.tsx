export function RegexImportTarget({ characterName, presetName }: { characterName?: string; presetName?: string }) {
    return (
<div>
    <h3 data-i18n="ext_regex_import_target">
        Import To:
    </h3>
    <div className="flex-container flexFlowColumn wide100p padding10 justifyLeft regex-import-targets">
        <label htmlFor="regex_import_target_global">
            <input type="radio" name="regex_import_target" id="regex_import_target_global" defaultValue="global" defaultChecked />
            <span data-i18n="ext_regex_global_scripts">
                Global Scripts
            </span>
            <small data-i18n="Applies to all characters.">Applies to all characters.</small>
        </label>
        <label htmlFor="regex_import_target_preset">
            <input type="radio" name="regex_import_target" id="regex_import_target_preset" defaultValue="preset" disabled={!presetName} />
            <span data-i18n="ext_regex_preset_scripts">
                Preset Scripts
            </span>
            <small>{presetName || <span data-i18n="No preset selected.">No preset selected.</span>}</small>
        </label>
        <label htmlFor="regex_import_target_scoped">
            <input type="radio" name="regex_import_target" id="regex_import_target_scoped" defaultValue="scoped" disabled={!characterName} />
            <span data-i18n="ext_regex_scoped_scripts">
                Scoped Scripts
            </span>
            <small>{characterName || <span data-i18n="No character selected for import.">No character selected for import.</span>}</small>
        </label>
    </div>
</div>
    );
}
