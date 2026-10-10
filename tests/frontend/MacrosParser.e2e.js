import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

// The experimental macro engine is now the only engine; the deprecated
// MacrosParser shim must keep bridging registrations into it.

test.describe('MacrosParser (legacy shim)', () => {
    test.beforeEach(testSetup.awaitST);

    test('should resolve registered macros through the macro engine', async ({ page }) => {
        const output = await page.evaluate(async () => {
            const { MacrosParser } = await import('./scripts/macros.js');
            const { substituteParams } = await import('./script.js');

            MacrosParser.registerMacro('engineParserTest', 'ENGINE_OK', 'Engine parser test');

            const result = substituteParams('Value: {{engineParserTest}}.', {});

            MacrosParser.unregisterMacro('engineParserTest');

            return result;
        });

        expect(output).toBe('Value: ENGINE_OK.');
    });

    test('unregistered macros pass through as literal text', async ({ page }) => {
        const output = await page.evaluate(async () => {
            const { MacrosParser } = await import('./scripts/macros.js');
            const { substituteParams } = await import('./script.js');

            MacrosParser.registerMacro('engineParserTestGone', 'ENGINE_GONE', 'Engine parser test');
            MacrosParser.unregisterMacro('engineParserTestGone');

            return substituteParams('Value: {{engineParserTestGone}}.', {});
        });

        // The unified engine preserves unknown macros verbatim instead of
        // resolving them to empty strings like the legacy regex engine did.
        expect(output).toBe('Value: {{engineParserTestGone}}.');
    });
});
