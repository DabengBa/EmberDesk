import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('onboarding template action chrome', () => {
    test('onboarding action buttons are React-owned contract buttons', () => {
        const source = read('app/components/onboarding/OnboardingActions.tsx');

        expect(source).toMatch(/<ContractButton[\s\S]*?className="menu_button menu_button_icon external_import_button"[\s\S]*?labelKey="onboarding_import"[\s\S]*?\/>/);
        expect(source).toMatch(/<ContractButton[\s\S]*?className="menu_button menu_button_icon open_characters_library"[\s\S]*?label="Sample characters"[\s\S]*?\/>/);
    });

    test('template keeps mount hosts and surrounding i18n text', () => {
        const index = read('public/index.html');

        expect(index).toContain('data-onboarding-host="import"');
        expect(index).toContain('data-onboarding-host="library"');
        expect(index).toContain('data-i18n="from supported sources or view"');
        expect(index).not.toContain('class="menu_button menu_button_icon external_import_button"');
        expect(index).not.toContain('class="open_characters_library menu_button menu_button_icon"');
    });

    test('mounts are wired through the shell bridge and startup stages', () => {
        const scriptSource = read('public/script.js');
        const domHandlersSource = read('public/scripts/dom-handlers.js');

        expect(domHandlersSource).toContain('mountOnboardingActions()');
        expect(scriptSource).toContain('mountOnboardingActions: (...args)');
        expect(scriptSource).toContain("measureStartupStage('mountOnboardingActions'");
    });
});
