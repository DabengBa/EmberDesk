import { forwardRef, useImperativeHandle, useState } from 'react';
import { translate, useTranslated } from '@/compat/i18n.js';

export type RegexImportTargetValue = 'global' | 'preset' | 'scoped';
export type RegexImportTargetHandle = { getTarget(): RegexImportTargetValue };
export const RegexImportTargetControl = forwardRef<RegexImportTargetHandle, { characterName?: string; presetName?: string; onChange?: (value: RegexImportTargetValue) => void }>(function RegexImportTargetControl({ characterName, presetName, onChange }, ref) {
    useTranslated('');
    const [value, setValue] = useState<RegexImportTargetValue>('global');
    useImperativeHandle(ref, () => ({ getTarget: () => value }), [value]);
    const targets: { value: RegexImportTargetValue; label: string; description: string; disabled?: boolean }[] = [
        { value: 'global', label: 'Global Scripts', description: 'Applies to all characters.' },
        { value: 'preset', label: 'Preset Scripts', description: presetName || 'No preset selected.', disabled: !presetName },
        { value: 'scoped', label: 'Scoped Scripts', description: characterName || 'No character selected for import.', disabled: !characterName },
    ];
    return <div><h3>{translate('Import To:')}</h3><div className="flex-container flexFlowColumn wide100p padding10 justifyLeft regex-import-targets">{targets.map(target => <label key={target.value} htmlFor={`regex_import_target_${target.value}`}><input type="radio" name="regex_import_target" id={`regex_import_target_${target.value}`} value={target.value} checked={value === target.value} disabled={target.disabled} onChange={() => { setValue(target.value); onChange?.(target.value); }} /><span>{translate(target.label)}</span><small>{target.disabled || target.value === 'global' ? translate(target.description) : target.description}</small></label>)}</div></div>;
});
