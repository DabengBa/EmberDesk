import { expect, jest, test } from '@jest/globals';

const settings = { tool_bindings: [] };
const tools = [];
const save = jest.fn();
jest.unstable_mockModule('../public/script.js', () => ({ saveSettingsDebounced: save }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn() }, event_types: { SETTINGS_LOADED: 'settings' } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: settings }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ setComposerValue: jest.fn() }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ callGenericPopup: jest.fn(), Popup: class {}, POPUP_RESULT: {}, POPUP_TYPE: {} }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: () => '' }));
jest.unstable_mockModule('../public/scripts/tool-calling.js', () => ({ ToolManager: {
    tools,
    registerFunctionTool: jest.fn(), unregisterFunctionTool: jest.fn(),
} }));

test('synchronous shell calls require one installed service and delegate to the same instance', async () => {
    const api = await import('../public/scripts/tool-bindings.js');
    expect(() => api.getToolBindings()).toThrow('Tool bindings service factory must be installed');
    expect(() => api.reloadUserToolBindings()).toThrow('Tool bindings service factory must be installed');
    expect(() => api.syncPipelineToolBindings(['reply'])).toThrow('Tool bindings service factory must be installed');
    await expect(api.init()).rejects.toThrow('Tool bindings service factory must be installed');
    const instance = { getBindings: jest.fn(() => [{ name: 'reply' }]), refresh: jest.fn(), syncPipeline: jest.fn() };
    const factory = jest.fn(() => instance);
    expect(api.installToolBindingsServiceFactory(factory)).toBe(instance);
    expect(api.installToolBindingsServiceFactory(factory)).toBe(instance);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(api.getToolBindings()).toEqual([{ name: 'reply' }]);
    expect(api.reloadUserToolBindings()).toBeUndefined();
    expect(api.syncPipelineToolBindings(['reply'], { activate: true })).toBeUndefined();
    expect(instance.refresh).toHaveBeenCalledTimes(2);
    expect(instance.syncPipeline).toHaveBeenCalledWith(['reply'], { activate: true });
    globalThis.document = { addEventListener: jest.fn(), getElementById: jest.fn(() => null) };
    try {
        await api.init();
        expect(instance.refresh).toHaveBeenCalledTimes(3);
    } finally {
        delete globalThis.document;
    }
});
