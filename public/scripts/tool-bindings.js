/**
 * User-defined tool bindings ("工具绑定").
 *
 * Storage: feature_settings.tool_bindings — a global, user-level list. Each
 * enabled binding is registered with ToolManager as a real function tool and
 * therefore travels to the API inside `tools` on every generation request.
 *
 * This is the first-party replacement for preset-carried tool definitions:
 * bindings live in user settings, not inside preset files, and the action
 * body receives exactly one argument (`args`).
 */
import { saveSettingsDebounced } from '../script.js';
import { eventSource, event_types } from './events.js';
import { feature_settings } from './feature-settings.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { t } from './i18n.js';
import { ToolManager } from './tool-calling.js';
import {
    createToolAction,
    createToolFormatMessage,
    isValidToolName,
    normalizeToolBindings,
    sanitizeToolParameters,
} from './tool-bindings-core.js';

/** @typedef {import('./tool-bindings-core.js').ToolBinding} ToolBinding */

/**
 * Names currently registered on behalf of user bindings. Kept separate from
 * code-registered tools so reloads never unregister foreign tools.
 * @type {Set<string>}
 */
const ownedToolNames = new Set();

/**
 * Returns the normalized binding list stored in feature_settings.
 * @returns {ToolBinding[]}
 */
export function getToolBindings() {
    return normalizeToolBindings(feature_settings.tool_bindings);
}

/**
 * Re-synchronizes the ToolManager registry with the stored bindings:
 * unregisters every previously-owned name, then registers all enabled ones.
 */
export function reloadUserToolBindings() {
    for (const name of ownedToolNames) {
        ToolManager.unregisterFunctionTool(name);
    }
    ownedToolNames.clear();

    for (const binding of getToolBindings()) {
        if (!binding.enabled) {
            continue;
        }
        ToolManager.registerFunctionTool({
            name: binding.name,
            displayName: binding.displayName || binding.name,
            description: binding.description,
            parameters: binding.parameters,
            stealth: binding.stealth,
            action: createToolAction(binding.actionBody),
            formatMessage: createToolFormatMessage(binding.formatMessageBody) ?? undefined,
            // Re-read live state per request so a binding disabled through any
            // path stops traveling with prompts even before the next reload.
            shouldRegister: () => getToolBindings().some(candidate => candidate.name === binding.name && candidate.enabled),
        });
        ownedToolNames.add(binding.name);
    }
}

function getBindingsStore() {
    if (!Array.isArray(feature_settings.tool_bindings)) {
        feature_settings.tool_bindings = [];
    }
    return feature_settings.tool_bindings;
}

async function saveBinding(binding) {
    const store = getBindingsStore();
    const index = store.findIndex(entry => entry?.id === binding.id);
    if (index === -1) {
        store.push(binding);
    } else {
        store[index] = binding;
    }
    saveSettingsDebounced();
    reloadUserToolBindings();
    renderToolBindingsList();
}

async function deleteBinding(binding) {
    const confirm = await callGenericPopup(t`Delete this tool binding?`, POPUP_TYPE.CONFIRM);
    if (!confirm) {
        return;
    }
    const store = getBindingsStore();
    const index = store.findIndex(entry => entry?.id === binding.id);
    if (index !== -1) {
        store.splice(index, 1);
    }
    saveSettingsDebounced();
    reloadUserToolBindings();
    renderToolBindingsList();
}

function renderToolBindingsList() {
    const container = $('#saved_tool_bindings');
    if (!container.length) {
        return;
    }
    container.empty();

    const bindings = getToolBindings();
    if (!bindings.length) {
        container.append($('<div>').addClass('regex-script-empty').text(t`No tool bindings yet.`));
        return;
    }

    for (const binding of bindings) {
        const row = $('<div>').addClass('regex-script-label tool-binding-label flex-container flexnowrap');

        const name = $('<div>').addClass('regex_script_name tool-binding-name flex1 overflow-hidden')
            .text(binding.displayName ? `${binding.displayName} (${binding.name})` : binding.name)
            .attr('title', binding.name);
        if (binding.stealth) {
            name.append($('<i>').addClass('fa-solid fa-ghost fa-sm marginLeft5').attr('title', t`Stealth: hidden from chat, no follow-up generation`));
        }

        const toggle = $('<input>').attr('type', 'checkbox')
            .addClass('enable_scoped tool-binding-enabled')
            .prop('checked', binding.enabled)
            .on('input', async function () {
                binding.enabled = $(this).prop('checked');
                await saveBinding(binding);
            });
        const toggleLabel = $('<label>').addClass('checkbox flex-container margin-r5')
            .attr('title', t`Enabled`)
            .append(
                toggle,
                $('<span>').addClass('tool-binding-toggle-on fa-solid fa-toggle-on').attr('title', t`Enabled`),
                $('<span>').addClass('tool-binding-toggle-off fa-solid fa-toggle-off').attr('title', t`Disabled`),
            );

        const edit = $('<div>').addClass('menu_button tool-binding-edit')
            .attr({ role: 'button', tabindex: '0', title: t`Edit` })
            .append($('<i>').addClass('fa-solid fa-pencil'))
            .on('click', () => openToolBindingEditor(binding.id));
        const del = $('<div>').addClass('menu_button tool-binding-delete')
            .attr({ role: 'button', tabindex: '0', title: t`Delete` })
            .append($('<i>').addClass('fa-solid fa-trash'))
            .on('click', () => deleteBinding(binding));

        row.append(name, $('<div>').addClass('flex-container flexnowrap').append(toggleLabel, edit, del));
        container.append(row);
    }
}

/**
 * Opens the tool binding editor popup. Markup is React-owned; this function
 * fills values, validates, and persists the result.
 * @param {string|null} existingId Binding id to edit, or null to create
 */
async function openToolBindingEditor(existingId = null) {
    const editorHtml = $(document.createElement('div'));
    const host = document.createElement('div');
    editorHtml.append(host);
    const workspacePanels = await loadWorkspacePanelsModule();
    workspacePanels.mountToolBindingEditor(host);

    const bindings = getToolBindings();
    const existing = bindings.find(binding => binding.id === existingId) ?? null;

    if (existing) {
        editorHtml.find('#tb_name').val(existing.name);
        editorHtml.find('#tb_display_name').val(existing.displayName);
        editorHtml.find('#tb_description').val(existing.description);
        editorHtml.find('#tb_parameters').val(JSON.stringify(existing.parameters, null, 2));
        editorHtml.find('#tb_action_body').val(existing.actionBody);
        editorHtml.find('#tb_format_message').val(existing.formatMessageBody);
        editorHtml.find('input[name="tb_enabled"]').prop('checked', existing.enabled);
        editorHtml.find('input[name="tb_stealth"]').prop('checked', existing.stealth);
    } else {
        editorHtml.find('input[name="tb_enabled"]').prop('checked', true);
        editorHtml.find('#tb_parameters').val(JSON.stringify({ type: 'object', properties: {} }, null, 2));
    }

    const parseParameters = () => {
        const raw = String(editorHtml.find('#tb_parameters').val() ?? '').trim();
        if (!raw) {
            return { ok: true, value: { type: 'object', properties: {} } };
        }
        try {
            return { ok: true, value: sanitizeToolParameters(JSON.parse(raw)) };
        } catch {
            return { ok: false };
        }
    };

    const validateEditor = () => {
        const nameInput = editorHtml.find('#tb_name');
        const parametersInput = editorHtml.find('#tb_parameters');
        const name = String(nameInput.val() ?? '').trim();
        const parsed = parseParameters();

        const errors = [
            { controls: nameInput, output: '#tb_name_error', message: isValidToolName(name) ? '' : t`Enter a tool name (1-64 chars: letters, digits, _ and -).` },
            { controls: parametersInput, output: '#tb_parameters_error', message: parsed.ok ? '' : t`Parameters must be a valid JSON Schema object.` },
        ];
        const duplicate = name && bindings.some(binding => binding.name === name && binding.id !== existing?.id);
        if (duplicate) {
            errors[0].message = t`A tool with this name already exists.`;
        }
        errors.forEach(({ controls, output, message }) => {
            controls.attr('aria-invalid', String(Boolean(message)));
            editorHtml.find(output).text(message).prop('hidden', !message);
        });
        const firstError = errors.find(error => error.message);
        firstError?.controls.first().trigger('focus');
        return !firstError;
    };

    const popupResult = await new Popup(editorHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
        onClosing: (popup) => popup.result !== POPUP_RESULT.AFFIRMATIVE || validateEditor(),
    }).show();

    if (!popupResult) {
        return;
    }

    const binding = {
        id: existing?.id ?? `tb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        enabled: Boolean(editorHtml.find('input[name="tb_enabled"]').prop('checked')),
        name: String(editorHtml.find('#tb_name').val() ?? '').trim(),
        displayName: String(editorHtml.find('#tb_display_name').val() ?? '').trim(),
        description: String(editorHtml.find('#tb_description').val() ?? ''),
        parameters: parseParameters().value,
        actionBody: String(editorHtml.find('#tb_action_body').val() ?? ''),
        formatMessageBody: String(editorHtml.find('#tb_format_message').val() ?? ''),
        stealth: Boolean(editorHtml.find('input[name="tb_stealth"]').prop('checked')),
    };
    await saveBinding(binding);
}

/**
 * Initializes the feature: ensures the store exists, registers stored
 * bindings, and wires the tools tab inside the regex drawer. Called after the
 * regex feature init has mounted the panel markup.
 */
export async function init() {
    getBindingsStore();
    reloadUserToolBindings();
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        reloadUserToolBindings();
        renderToolBindingsList();
    });

    $(document).on('click', '#open_tool_binding_editor', () => openToolBindingEditor(null));
    $(document).on('input', '#tool_choice_required', async function () {
        feature_settings.tool_choice_required = Boolean($(this).prop('checked'));
        saveSettingsDebounced();
    });
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        $('#tool_choice_required').prop('checked', Boolean(feature_settings.tool_choice_required));
    });
    $('#tool_choice_required').prop('checked', Boolean(feature_settings.tool_choice_required));
    renderToolBindingsList();
    document.getElementById('RegexPanel')?.setAttribute('data-tool-bindings-init', 'true');
}
