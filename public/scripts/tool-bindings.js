/** User tool bindings: shell ports and popup/chip compatibility adapters. */
import { saveSettingsDebounced } from '../script.js';
import { eventSource, event_types } from './events.js';
import { feature_settings } from './feature-settings.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { setComposerValue } from './main-chat-composer-service.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { t } from './i18n.js';
import { ToolManager } from './tool-calling.js';


const ownedToolNames = new Set();
let service;
let initialized = false;
const names = () => ToolManager.tools.map(tool => tool.toFunctionOpenAI().function.name);
const store = () => {
    if (!Array.isArray(feature_settings.tool_bindings)) feature_settings.tool_bindings = [];
    return feature_settings.tool_bindings;
};

/** Install the cached workspace bundle factory once, before bootstrap consumers. */
export function installToolBindingsServiceFactory(factory) {
    if (service) return service;
    service = factory({ settings: feature_settings, save: saveSettingsDebounced, names,
        register: tool => ToolManager.registerFunctionTool(tool),
        unregister: name => ToolManager.unregisterFunctionTool(name), ownedNames: ownedToolNames });
    service.refresh();
    return service;
}

function requireService() {
    if (!service) throw new Error('Tool bindings service factory must be installed before use');
    return service;
}

export function getToolBindings() { return requireService().getBindings(); }
export function reloadUserToolBindings() { requireService().refresh(); }
export function syncPipelineToolBindings(pipelineNames, { activate = false } = {}) {
    requireService().syncPipeline(pipelineNames, { activate });
}

async function openEditor(id) {
    const workspace = await loadWorkspacePanelsModule();
    const host = document.createElement('div');
    const bindings = service.getBindings();
    const controller = { submit: () => null };
    let result = null;
    workspace.mountToolBindingEditor(host, { existing: bindings.find(binding => binding.id === id) ?? null, bindings, controller });
    try {
        const confirmed = await new Popup(host, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Save`, cancelButton: t`Cancel`, allowVerticalScrolling: true,
            onClosing: popup => popup.result !== POPUP_RESULT.AFFIRMATIVE || Boolean(result = controller.submit()),
        }).show();
        if (confirmed && result) service.save(result);
    } finally {
        workspace.unmountSmallPanel(host);
    }
}
async function deleteBinding(id) {
    if (await callGenericPopup(t`Delete this tool binding?`, POPUP_TYPE.CONFIRM)) service.delete(id);
}
/** Shared React mount receives this bridge; the service is installed at bootstrap. */
export function getToolBindingsBridge() {
    if (!service) throw new Error('Tool bindings service factory must be installed before mounting the settings panel');
    return { service, openEditor, deleteBinding };
}
export async function init() {
    if (initialized) return;
    requireService();
    initialized = true;
    store();
    reloadUserToolBindings();
    eventSource.on(event_types.SETTINGS_LOADED, reloadUserToolBindings);
    // Sanitization rewrites classes; retain the data-* hooks.
    document.addEventListener('click', async event => {
        if (!(event.target instanceof Element)) return;
        const respond = event.target.closest('[data-respond-option]');
        if (respond) {
            const text = String(respond.textContent ?? '').replace(/^▸\s*/, '').trim();
            if (text) setComposerValue(text);
        }
        const copy = event.target.closest('[data-copy-option]');
        if (copy) {
            const text = String(copy.getAttribute('data-copy-option') ?? '').trim();
            if (!text) return;
            try { await navigator.clipboard.writeText(text); toastr.success(text, t`已复制`); } catch { toastr.warning(t`剪贴板不可用`); }
        }
    });
    document.getElementById('RegexPanel')?.setAttribute('data-tool-bindings-init', 'true');
}
