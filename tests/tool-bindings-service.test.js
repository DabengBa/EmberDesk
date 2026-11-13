import { beforeAll, describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

let createService;
beforeAll(async () => {
    ({ createToolBindingsService: createService } = await loadTsModule('app/lib/tool-bindings-service.ts'));
});

function fixture() {
    const settings = { tool_bindings: [], tool_choice_required: false };
    const tools = [{ name: 'code_tool' }];
    let saves = 0;
    const service = createService({
        settings, save: () => saves++,
        names: () => tools.map(tool => tool.name),
        register: tool => tools.push(tool),
        unregister: name => { const index = tools.findIndex(tool => tool.name === name); if (index >= 0) tools.splice(index, 1); },
    });
    return { settings, tools, service, saves: () => saves };
}

describe('tool bindings service', () => {
    test('edits, toggles, deletes and publishes settings without disturbing code tools', () => {
        const { service, settings, tools, saves } = fixture();
        let changes = 0;
        const unsubscribe = service.subscribe(() => changes++);
        const binding = { id: 'one', name: 'hello', enabled: true, displayName: '', description: '', parameters: {}, actionBody: '', formatMessageBody: '', stealth: false };
        service.save(binding);
        expect(settings.tool_bindings).toEqual([binding]);
        expect(tools.map(tool => tool.name)).toEqual(['code_tool', 'hello']);
        service.save({ ...binding, enabled: false });
        expect(tools.map(tool => tool.name)).toEqual(['code_tool']);
        service.setForceTool(true);
        expect(settings.tool_choice_required).toBe(true);
        service.delete('one');
        expect(settings.tool_bindings).toEqual([]);
        expect(saves()).toBe(4);
        expect(changes).toBe(4);
        unsubscribe();
    });

    test('pipeline sync is synchronous, respects foreign tools and refresh observes external settings', () => {
        const { service, settings, tools } = fixture();
        service.syncPipeline(['code_tool', 'reply']);
        expect(tools.map(tool => tool.name)).toEqual(['code_tool', 'reply']);
        expect(settings.tool_bindings.map(binding => binding.name)).toEqual(['reply']);
        settings.tool_bindings[0].enabled = false;
        service.refresh();
        expect(tools.map(tool => tool.name)).toEqual(['code_tool']);
        service.syncPipeline(['reply'], { activate: true });
        expect(tools.map(tool => tool.name)).toEqual(['code_tool', 'reply']);
    });
});
