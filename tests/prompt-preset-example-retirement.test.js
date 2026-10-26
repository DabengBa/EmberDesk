import fs from 'node:fs';
import { describe, expect, test } from '@jest/globals';
import { buildSettingsSavePayload } from '../app/lib/settings-helpers.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Exercise the real data service without importing the browser composition root.
const source = read('public/scripts/PromptManager.js')
    .replace(/^import .*;$/gm, '')
    .replace(/^export (?=const |class |function )/gm, '')
    .replace(/export \{[\s\S]*?\};\s*$/, '');
const { PromptManager, chatCompletionDefaultPrompts, removeRetiredExamplePrompts } = new Function(`${source}\nreturn { PromptManager, chatCompletionDefaultPrompts, removeRetiredExamplePrompts };`)();

describe('retired example-dialogue preset data', () => {
    test('imported and cached presets are normalized before persistence and survive export cleanly', () => {
        const openai = read('public/scripts/openai.js');
        const migration = openai.match(/function migrateChatCompletionSettings\(settings\) \{[\s\S]*?\n\}/)[0];
        const normalize = new Function('removeRetiredExamplePrompts', 'character_names_behavior', 'chat_completion_sources', 'normalizeReasoningEffort', `${migration}; return migrateChatCompletionSettings;`)(
            removeRetiredExamplePrompts, { COMPLETION: 1 }, { OPENAI: 'openai' }, value => value,
        );
        const custom = { identifier: 'custom', name: 'Chat Examples', content: 'keep' };
        const preset = {
            new_example_chat_prompt: 'retired', prompts: [{ identifier: 'dialogueExamples' }, custom],
            prompt_order: [{ character_id: 1, order: [{ identifier: 'dialogueExamples' }, { identifier: 'custom' }] }],
        };
        normalize(preset);
        const exported = JSON.parse(JSON.stringify(preset));
        normalize(exported);
        expect(exported).not.toHaveProperty('new_example_chat_prompt');
        expect(exported.prompts).toEqual([custom]);
        expect(exported.prompt_order[0].order).toEqual([{ identifier: 'custom' }]);
        const loadCache = openai.match(/openai_settings\.forEach\(function \(item, i\) \{[\s\S]*?\n {4}\}\);/)[0];
        const cache = [JSON.stringify({ prompts: [{ identifier: 'dialogueExamples' }, custom] })];
        new Function('openai_settings', 'migrateChatCompletionSettings', loadCache)(cache, normalize);
        expect(cache[0].prompts).toEqual([custom]);
        expect(openai).toMatch(/migrateChatCompletionSettings\(presetBody\);\s+const savePresetSettings = await fetch/);
    });

    test('settings saves discard the retired template without changing the new-chat template', () => {
        const saved = buildSettingsSavePayload({ oai_settings: {
            new_example_chat_prompt: 'retired', new_chat_prompt: 'keep',
        } }, {});
        expect(saved.oai_settings).not.toHaveProperty('new_example_chat_prompt');
        expect(saved.oai_settings.new_chat_prompt).toBe('keep');
    });

    test('loading removes retired markers from every bucket but preserves custom prompts and order', () => {
        const custom = { identifier: 'custom', name: 'Chat Examples', content: 'keep this', system_prompt: false };
        const manager = new PromptManager();
        manager.serviceSettings = {
            prompts: [{ identifier: 'dialogueExamples', marker: true }, custom],
            prompt_order: [100000, 7].map(character_id => ({ character_id, order: [
                { identifier: 'worldInfo', enabled: true },
                { identifier: 'dialogueExamples', enabled: true },
                { identifier: 'custom', enabled: false },
            ] })),
        };
        manager.sanitizeServiceSettings();
        expect(manager.serviceSettings.prompts).toContainEqual(custom);
        expect(manager.serviceSettings.prompts.some(p => p.identifier === 'dialogueExamples')).toBe(false);
        for (const bucket of manager.serviceSettings.prompt_order) {
            expect(bucket.order).toEqual([
                { identifier: 'worldInfo', enabled: true },
                { identifier: 'custom', enabled: false },
            ]);
        }
        const first = structuredClone(manager.serviceSettings);
        manager.sanitizeServiceSettings();
        expect(manager.serviceSettings).toEqual(first);
    });

    test('a retired-only global bucket is replaced with usable defaults without examples', () => {
        const manager = new PromptManager();
        manager.serviceSettings = {
            prompts: [{ identifier: 'dialogueExamples', marker: true }],
            prompt_order: [{ character_id: 100000, order: [{ identifier: 'dialogueExamples', enabled: true }] }],
        };
        manager.sanitizeServiceSettings();
        expect(manager.serviceSettings.prompts).toEqual(chatCompletionDefaultPrompts.prompts);
        expect(manager.serviceSettings.prompt_order).toEqual([{ character_id: 100000, order: [
            { identifier: 'worldInfo', enabled: true },
            { identifier: 'charDescription', enabled: true },
            { identifier: 'chatHistory', enabled: true },
        ] }]);
    });

    test.each(['default/templates/settings-defaults.json', 'default/content/presets/openai/Default.json', 'docs/presets/Latest-1st.json'])('%s omits retired data', path => {
        const document = JSON.parse(read(path));
        const preset = document.oai_settings ?? document;
        expect(preset).not.toHaveProperty('new_example_chat_prompt');
        expect(preset.prompts.some(p => p.identifier === 'dialogueExamples')).toBe(false);
        for (const bucket of preset.prompt_order) {
            expect(bucket.order.some(p => p.identifier === 'dialogueExamples')).toBe(false);
        }
    });

    test('template is neither a runtime default nor a serialized preset setting', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).not.toMatch(/new_example_chat_prompt\s*:/);
        expect(openai).not.toContain('default_new_example_chat_prompt');
        expect(openai).toContain('\'new_example_chat_prompt\',');
        expect(read('app/lib/settings-helpers.js')).not.toContain('\'oai_settings.new_example_chat_prompt\'');
    });
});
