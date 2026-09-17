export function RegexImportTarget() {
    return (
<div>
    <h3 data-i18n="ext_regex_import_target">
        Import To:
    </h3>
    <div className="flex-container flexFlowColumn wide100p padding10 justifyLeft">
        <label htmlFor="regex_import_target_global">
            <input type="radio" name="regex_import_target" id="regex_import_target_global" defaultValue="global" defaultChecked />
            <span data-i18n="ext_regex_global_scripts">
                Global Scripts
            </span>
        </label>
        <label htmlFor="regex_import_target_preset">
            <input type="radio" name="regex_import_target" id="regex_import_target_preset" defaultValue="preset" />
            <span data-i18n="ext_regex_preset_scripts">
                Preset Scripts
            </span>
        </label>
        <label htmlFor="regex_import_target_scoped">
            <input type="radio" name="regex_import_target" id="regex_import_target_scoped" defaultValue="scoped" />
            <span data-i18n="ext_regex_scoped_scripts">
                Scoped Scripts
            </span>
        </label>
    </div>
</div>
    );
}
