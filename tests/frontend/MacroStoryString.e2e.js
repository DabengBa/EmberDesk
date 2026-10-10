import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

test.describe('MacroStoryString', () => {
    test.beforeEach(testSetup.awaitST);

    // Representative story-string templates (previously shipped as default
    // Context Template presets; the preset files were retired in B-cut-13).
    const storyStringTemplates = [
        {
            name: 'Default',
            story_string: '{{#if system}}{{system}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}',
        },
        {
            name: 'Minimal',
            story_string: '{{description}}\n{{persona}}',
        },
        {
            name: 'Anchors',
            story_string: '{{anchorBefore}}{{system}}\n{{description}}\n{{anchorAfter}}',
        },
    ];

    test('should produce equivalent story strings with new macro engine', async ({ page }) => {
        const output = await page.evaluate(async ([storyStringTemplates]) => {
            const { substituteParams, extension_prompt_types } = await import('./script.js');
            const { power_user, renderStoryString } = await import('./scripts/power-user.js');


            const context = {
                description: 'character description',
                persona: 'persona details',
                scenario: 'scenario setup',
                system: 'system instructions',
                char: 'character name',
                user: 'user name',
                wiBefore: 'world info before',
                wiAfter: 'world info after',
                loreBefore: 'lore before',
                loreAfter: 'lore after',
                anchorBefore: 'before anchor text',
                anchorAfter: 'after anchor text',
                mesExamples: 'example messages',
                mesExamplesRaw: 'raw example messages',
            };

            const customContextSettings = {
                story_string_position: extension_prompt_types.IN_PROMPT,
            };

            const result = [];

            function getMacroStoryString(templateString) {
                let output = substituteParams(templateString, { name1Override: context.user, name2Override: context.char, replaceCharacterCard: true, dynamicMacros: context });
                output = output.replace(/^\n+/, '');
                if (output.length > 0 && !output.endsWith('\n')) {
                    output += '\n';
                }
                return output;
            }

            for (const template of storyStringTemplates) {
                const classicStoryString = renderStoryString(context, { customStoryString: template.story_string, customContextSettings });
                const macroStoryString = getMacroStoryString(template.story_string);
                result.push({ name: template.name, classicStoryString, macroStoryString });
            }

            return result;
        }, [storyStringTemplates]);

        for (const { classicStoryString, macroStoryString, name } of output) {
            expect(macroStoryString, `Mismatch in template: ${name}`).toBe(classicStoryString);
        }
    });
});
