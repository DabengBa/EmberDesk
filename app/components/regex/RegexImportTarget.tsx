import { translate, useTranslated } from '@/compat/i18n.js';
export function RegexImportTarget({ characterName, presetName }: { characterName?: string; presetName?: string }) {
    useTranslated('');
    return (
<div>
    <h3 >{translate('Import To:')}</h3>
    <div className="flex-container flexFlowColumn wide100p padding10 justifyLeft regex-import-targets">
        <label htmlFor="regex_import_target_global">
            <input type="radio" name="regex_import_target" id="regex_import_target_global" defaultValue="global" defaultChecked />
            <span >{translate('Global Scripts')}</span>
            <small >{translate('Applies to all characters.')}</small>
        </label>
        <label htmlFor="regex_import_target_preset">
            <input type="radio" name="regex_import_target" id="regex_import_target_preset" defaultValue="preset" disabled={!presetName} />
            <span >{translate('Preset Scripts')}</span>
            <small>{presetName || <span >{translate('No preset selected.')}</span>}</small>
        </label>
        <label htmlFor="regex_import_target_scoped">
            <input type="radio" name="regex_import_target" id="regex_import_target_scoped" defaultValue="scoped" disabled={!characterName} />
            <span >{translate('Scoped Scripts')}</span>
            <small>{characterName || <span >{translate('No character selected for import.')}</span>}</small>
        </label>
    </div>
</div>
    );
}
