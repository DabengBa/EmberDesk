import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

test('slash registration keeps aliases and reads the live selected world list', async () => {
    const { registerWorldInfoSlashCommands } = await import('../public/scripts/world-info-slash-adapter.js');
    const { setSelectedWorldInfo } = await import('../public/scripts/world-info-state.js');
    const commands = [];
    class Argument { static fromProps(props) { return props; } }
    const deps = {
        SlashCommandParser: { addCommandObject: command => commands.push(command) },
        SlashCommand: { fromProps: props => props }, SlashCommandArgument: Argument,
        SlashCommandNamedArgument: Argument, SlashCommandEnumValue: Argument,
        ARGUMENT_TYPE: { STRING: 'string', BOOLEAN: 'boolean', NUMBER: 'number' },
        commonEnumProviders: { boolean: () => () => [], characters: () => () => [], worlds: () => [] },
        enumIcons: { getDataTypeIcon: () => '' }, enumTypes: { enum: 'enum' },
        newWorldInfoEntryDefinition: {}, onWorldInfoChange: () => '',
    };
    registerWorldInfoSlashCommands(deps);
    const command = commands.find(item => item.name === 'getglobalbooks');
    expect(command.aliases).toEqual(['getgloballore', 'getglobalwi']);
    setSelectedWorldInfo(['first']);
    expect(await command.callback()).toBe('["first"]');
    setSelectedWorldInfo(['second']);
    expect(await command.callback()).toBe('["second"]');
    setSelectedWorldInfo([]);
});
