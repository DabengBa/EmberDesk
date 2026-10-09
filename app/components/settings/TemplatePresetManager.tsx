import { useEffect, useRef, useState } from 'react';

import type { FormattingPresetResult, RuntimePort } from '../../compat/runtime-port';
import { getValueAtPath } from '../../lib/settings-helpers.js';

type PresetRecord = Record<string, any>;

type FormHandle = {
    getFieldValue(name: string): any;
    setFieldValue(name: string, value: any): void;
    /** TanStack Form reactive subscriber (renders children with selected state). */
    Subscribe: any;
};

type FormattingPresetRowProps = {
    apiId: 'sysprompt' | 'reasoning';
    label: string;
    runtime?: RuntimePort;
    /** Preset list (owned by the parent so master import can refresh both rows). */
    presets: PresetRecord[];
    onPresetsChanged(apiId: 'sysprompt' | 'reasoning', presets: PresetRecord[]): void;
    /** TanStack Form handle owning the advanced.* fields. */
    form: FormHandle;
    /** Form path of the preset-name field (e.g. 'advanced.systemPromptName'). */
    nameField: string;
    /** Build the preset payload from current form values (name is added by the caller). */
    collectPreset(): PresetRecord;
    /** Apply a preset's fields to the form (excluding name, handled internally). */
    applyPreset(preset: PresetRecord): void;
    disabled?: boolean;
    onNotice(message: string): void;
    onError(message: string): void;
};

function presetName(preset: PresetRecord): string {
    return typeof preset?.name === 'string' ? preset.name : '';
}

function downloadJson(data: unknown, fileName: string) {
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function readJsonFile(file: File): Promise<any> {
    const text = await file.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('导入的文件不是有效的 JSON。');
    }
}

/**
 * Preset selector + action menu for the file-backed formatting presets
 * (system prompt / reasoning template). CRUD goes through the
 * `formattingPreset` runtime command so the legacy preset files, slash-command
 * enums, and PRESET_* events stay in one implementation.
 */
export function FormattingPresetRow({
    apiId,
    label,
    runtime,
    presets,
    onPresetsChanged,
    form,
    nameField,
    collectPreset,
    applyPreset,
    disabled = false,
    onNotice,
    onError,
}: FormattingPresetRowProps) {
    const presetList = presets;
    const [menuOpen, setMenuOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!menuOpen) {
            return;
        }
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

    const command = runtime?.commands?.formattingPreset;
    const actionsDisabled = disabled || busy || typeof command !== 'function';

    async function run(request: Parameters<NonNullable<typeof command>>[0]): Promise<FormattingPresetResult | null> {
        if (!command) {
            onError('运行时未提供预设管理命令。');
            return null;
        }
        setBusy(true);
        try {
            const result = await command(request);
            onPresetsChanged(apiId, result.presets ?? []);
            return result;
        } catch (error) {
            onError(error instanceof Error ? error.message : '预设操作失败。');
            return null;
        } finally {
            setBusy(false);
        }
    }

    function handleSelect(name: string) {
        const preset = presetList.find(entry => presetName(entry) === name);
        if (!preset) {
            form.setFieldValue(nameField, name);
            return;
        }
        applyPreset(preset);
        form.setFieldValue(nameField, presetName(preset));
    }

    async function handleAction(action: string) {
        setMenuOpen(false);
        const currentName = String(form.getFieldValue(nameField) ?? '');
        switch (action) {
            case 'update': {
                if (!currentName) {
                    onError('先选择一个预设或使用「另存为」命名。');
                    return;
                }
                const result = await run({ action: 'save', apiId, name: currentName, preset: { ...collectPreset(), name: currentName } });
                if (result) onNotice(`已更新预设「${currentName}」。`);
                return;
            }
            case 'saveAs': {
                const name = window.prompt('新预设名称：', currentName ? `${currentName} - 副本` : '');
                if (!name?.trim()) {
                    return;
                }
                const trimmed = name.trim();
                const result = await run({ action: 'save', apiId, name: trimmed, preset: { ...collectPreset(), name: trimmed } });
                if (result) {
                    form.setFieldValue(nameField, trimmed);
                    onNotice(`已保存预设「${trimmed}」。`);
                }
                return;
            }
            case 'rename': {
                if (!currentName) {
                    onError('没有可重命名的当前预设。');
                    return;
                }
                const newName = window.prompt('重命名预设：', currentName);
                if (!newName?.trim() || newName.trim() === currentName) {
                    return;
                }
                const result = await run({ action: 'rename', apiId, name: currentName, newName: newName.trim(), preset: collectPreset() });
                if (result) {
                    form.setFieldValue(nameField, newName.trim());
                    onNotice(`已重命名为「${newName.trim()}」。`);
                }
                return;
            }
            case 'import': {
                fileInputRef.current?.click();
                return;
            }
            case 'export': {
                const preset = presetList.find(entry => presetName(entry) === currentName);
                const data = preset ?? { ...collectPreset(), name: currentName };
                const safeName = (presetName(data) || 'preset').replace(/[\\/:*?"<>|]/g, '_');
                downloadJson(data, `${safeName}.json`);
                return;
            }
            case 'restore': {
                if (!currentName) {
                    onError('没有可恢复的当前预设。');
                    return;
                }
                const result = await run({ action: 'restore', apiId, name: currentName });
                if (result) {
                    if (result.restored?.isDefault && result.restored.preset) {
                        applyPreset(result.restored.preset);
                        onNotice(`已恢复默认预设「${currentName}」。`);
                    } else {
                        onNotice(`预设「${currentName}」没有可恢复的默认版本。`);
                    }
                }
                return;
            }
            case 'delete': {
                if (!currentName) {
                    onError('没有可删除的当前预设。');
                    return;
                }
                if (!window.confirm(`删除预设「${currentName}」？此操作不可撤销。`)) {
                    return;
                }
                const result = await run({ action: 'delete', apiId, name: currentName });
                if (result) onNotice(`已删除预设「${currentName}」。`);
                return;
            }
        }
    }

    async function handleImportFile(file: File | undefined) {
        if (!file) {
            return;
        }
        try {
            const data = await readJsonFile(file);
            const name = typeof data?.name === 'string' && data.name
                ? data.name
                : file.name.replace(/\.json$/i, '');
            const result = await run({ action: 'save', apiId, name, preset: { ...data, name } });
            if (result) {
                applyPreset({ ...data, name });
                form.setFieldValue(nameField, name);
                onNotice(`已导入预设「${name}」。`);
            }
        } catch (error) {
            onError(error instanceof Error ? error.message : '预设导入失败。');
        }
    }

    const menuItems: Array<{ action: string; label: string; icon: string } | 'divider'> = [
        { action: 'update', label: '更新当前预设', icon: 'fa-save' },
        { action: 'saveAs', label: '另存为…', icon: 'fa-file-circle-plus' },
        { action: 'rename', label: '重命名…', icon: 'fa-pencil' },
        'divider',
        { action: 'import', label: '导入…', icon: 'fa-file-import' },
        { action: 'export', label: '导出', icon: 'fa-file-export' },
        { action: 'restore', label: '恢复默认', icon: 'fa-recycle' },
        'divider',
        { action: 'delete', label: '删除', icon: 'fa-trash-can' },
    ];

    return (
        <div className="flex-container flexFlowRow flexGap10 alignItemsCenter" data-formatting-preset-row={apiId}>
            <form.Subscribe selector={(state: any) => String(getValueAtPath(state.values, nameField) ?? '')}>
                {(currentName: string) => (
                    <select
                        className="text_pole flex1"
                        aria-label={label}
                        value={presetList.some(entry => presetName(entry) === currentName) ? currentName : ''}
                        disabled={actionsDisabled}
                        onChange={event => handleSelect(event.target.value)}
                    >
                        <option value="" disabled>{`— 选择${label} —`}</option>
                        {presetList.map(entry => {
                            const name = presetName(entry);
                            return <option key={name} value={name}>{name}</option>;
                        })}
                    </select>
                )}
            </form.Subscribe>
            <div ref={menuRef} className="preset-actions-menu">
                <button
                    type="button"
                    className="preset-menu-trigger margin0 menu_button menu_button_icon"
                    title={`${label}操作`}
                    aria-label={`${label}操作`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={actionsDisabled}
                    onClick={() => setMenuOpen(value => !value)}
                >
                    <i className="fa-fw fa-solid fa-ellipsis-vertical" aria-hidden="true" />
                </button>
                {menuOpen && (
                    <div className="preset-popup-menu show" role="menu" tabIndex={-1}>
                        {menuItems.map((item, index) => item === 'divider'
                            ? <hr key={`divider-${index}`} />
                            : (
                                <button
                                    key={item.action}
                                    type="button"
                                    role="menuitem"
                                    className="preset-popup-menu-item"
                                    onClick={() => void handleAction(item.action)}
                                >
                                    <i className={`fa-fw fa-solid ${item.icon}`} aria-hidden="true" />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                    </div>
                )}
            </div>
            <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".json,application/json"
                data-formatting-preset-file={apiId}
                onChange={event => {
                    void handleImportFile(event.target.files?.[0]);
                    event.target.value = '';
                }}
            />
        </div>
    );
}

type FormattingMasterActionsProps = {
    runtime?: RuntimePort;
    form: FormHandle;
    /** Refresh each preset row's list after a master import writes presets. */
    onPresetsChanged(apiId: 'sysprompt' | 'reasoning', presets: PresetRecord[]): void;
    disabled?: boolean;
    onNotice(message: string): void;
    onError(message: string): void;
};

function isPossiblySystemPromptData(data: any): boolean {
    return Boolean(data && typeof data === 'object' && 'name' in data && 'content' in data);
}

function isPossiblyReasoningData(data: any): boolean {
    return Boolean(data && typeof data === 'object'
        && ['name', 'prefix', 'suffix', 'separator'].every(prop => prop in data));
}

function isPossiblyStartReplyWithData(data: any): boolean {
    return Boolean(data && typeof data === 'object' && 'value' in data && 'show' in data);
}

/**
 * Master import/export for the formatting sections previously owned by the
 * Advanced Formatting drawer: system prompt preset, reasoning template, and
 * Start Reply With. Export writes the current form values; import accepts both
 * the multi-section master format and legacy single-section preset files.
 */
export function FormattingMasterActions({
    runtime,
    form,
    onPresetsChanged,
    disabled = false,
    onNotice,
    onError,
}: FormattingMasterActionsProps) {
    const [busy, setBusy] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const command = runtime?.commands?.formattingPreset;
    const actionsDisabled = disabled || busy || typeof command !== 'function';

    function collectSysprompt(): PresetRecord {
        return {
            name: String(form.getFieldValue('advanced.systemPromptName') ?? ''),
            content: String(form.getFieldValue('advanced.systemPromptContent') ?? ''),
            post_history: String(form.getFieldValue('advanced.syspromptPostHistory') ?? ''),
        };
    }

    function collectReasoning(): PresetRecord {
        return {
            name: String(form.getFieldValue('advanced.reasoningName') ?? ''),
            prefix: String(form.getFieldValue('advanced.reasoningPrefix') ?? ''),
            suffix: String(form.getFieldValue('advanced.reasoningSuffix') ?? ''),
            separator: String(form.getFieldValue('advanced.reasoningSeparator') ?? ''),
        };
    }

    function handleExport() {
        const data = {
            sysprompt: collectSysprompt(),
            reasoning: collectReasoning(),
            srw: {
                value: String(form.getFieldValue('advanced.userPromptBias') ?? ''),
                show: Boolean(form.getFieldValue('advanced.showUserPromptBias')),
            },
        };
        const shortDate = new Date().toISOString().split('T')[0];
        downloadJson(data, `emberdesk-formatting-${shortDate}.json`);
        onNotice('已导出高级格式设置。');
    }

    async function importSection(apiId: 'sysprompt' | 'reasoning', data: PresetRecord): Promise<boolean> {
        if (!command) {
            return false;
        }
        const name = presetName(data);
        if (!name) {
            return false;
        }
        const result = await command({ action: 'save', apiId, name, preset: data });
        onPresetsChanged(apiId, result.presets ?? []);
        return true;
    }

    async function handleImportFile(file: File | undefined) {
        if (!file || !command) {
            return;
        }
        setBusy(true);
        try {
            const data = await readJsonFile(file);
            const imported: string[] = [];

            // Legacy single-section files: a bare system prompt or reasoning
            // template object imports directly as a preset of that kind.
            if (isPossiblyReasoningData(data)) {
                if (await importSection('reasoning', data)) imported.push('推理模板');
            } else if (isPossiblySystemPromptData(data)) {
                if (await importSection('sysprompt', data)) imported.push('系统提示');
            } else {
                if (isPossiblySystemPromptData(data?.sysprompt)) {
                    if (await importSection('sysprompt', data.sysprompt)) imported.push('系统提示');
                }
                if (isPossiblyReasoningData(data?.reasoning)) {
                    if (await importSection('reasoning', data.reasoning)) imported.push('推理模板');
                }
                if (isPossiblyStartReplyWithData(data?.srw)) {
                    form.setFieldValue('advanced.userPromptBias', String(data.srw.value ?? ''));
                    form.setFieldValue('advanced.showUserPromptBias', Boolean(data.srw.show));
                    imported.push('Start Reply With');
                }
            }

            if (imported.length === 0) {
                onError('文件中没有可识别的格式设置分区。');
            } else {
                onNotice(`已导入：${imported.join('、')}。`);
            }
        } catch (error) {
            onError(error instanceof Error ? error.message : '导入失败。');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex-container flexFlowRow flexGap10 alignItemsCenter" data-formatting-master-actions="true">
            <button
                type="button"
                className="menu_button menu_button_icon"
                disabled={actionsDisabled}
                onClick={() => fileInputRef.current?.click()}
            >
                <i className="fa-fw fa-solid fa-file-import" aria-hidden="true" />
                <span>导入格式设置</span>
            </button>
            <button
                type="button"
                className="menu_button menu_button_icon"
                disabled={actionsDisabled}
                onClick={handleExport}
            >
                <i className="fa-fw fa-solid fa-file-export" aria-hidden="true" />
                <span>导出格式设置</span>
            </button>
            <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".json,application/json"
                data-formatting-master-file="true"
                onChange={event => {
                    void handleImportFile(event.target.files?.[0]);
                    event.target.value = '';
                }}
            />
        </div>
    );
}
