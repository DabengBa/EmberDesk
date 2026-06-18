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

describe('character library React panel scaffold', () => {
    test('ships a standalone React panel bundle with Query and Virtual wiring', () => {
        const packageSource = read('package.json');
        const viteSource = read('vite.config.ts');
        const panelEntrySource = read('app/character-library-panel.tsx');
        const panelSource = read('app/components/character-library/CharacterLibraryPanel.tsx');
        const toolbarSource = read('app/components/character-library/CharacterLibraryToolbar.tsx');
        const helperSource = read('app/lib/character-library-helpers.ts');

        expect(packageSource).toContain('"@tanstack/react-virtual"');
        expect(viteSource).toContain('const isCharacterLibraryPanelBuild = mode === \'character-library-panel\';');
        expect(viteSource).toContain('entry: path.resolve(process.cwd(), \'app/character-library-panel.tsx\')');
        expect(viteSource).toContain('fileName: () => \'assets/character-library-panel.js\'');
        expect(viteSource).toContain('emptyOutDir: false');
        expect(panelEntrySource).toContain('import { QueryClient, QueryClientProvider } from \'@tanstack/react-query\';');
        expect(panelEntrySource).toContain('export function mountCharacterLibraryToolbar(');
        expect(panelEntrySource).toContain('export function updateCharacterLibraryToolbar(');
        expect(panelEntrySource).toContain('export function mountCharacterLibraryPanel(');
        expect(panelEntrySource).toContain('export function updateCharacterLibraryPanel(');
        expect(panelSource).toContain('import { useVirtualizer } from \'@tanstack/react-virtual\';');
        expect(panelSource).toContain('import { useQuery } from \'@tanstack/react-query\';');
        expect(panelSource).toContain('queryKey: [\'character-library\', \'all\']');
        expect(panelSource).toContain('count: state.pageEntities.length');
        expect(panelSource).toContain('getScrollElement: () => scrollElementRef.current');
        expect(toolbarSource).toContain('import { useForm } from \'@tanstack/react-form\';');
        expect(toolbarSource).toContain('characterLibraryToolbarSchema');
        expect(toolbarSource).toContain('toolbarForm.reset(nextDefaults);');
        expect(toolbarSource).toContain('bridge.applySearchQuery');
        expect(toolbarSource).toContain('bridge.applySortOption');
        expect(toolbarSource).toContain('disabled?: boolean;');
        expect(toolbarSource).toContain("className={`menu_button character-list-action${disabled ? ' disabled' : ''}`}");
        expect(toolbarSource).toContain('disabled={disabled}');
        expect(toolbarSource).toContain('aria-disabled={disabled}');
        expect(toolbarSource).toContain('disabled={state.bulkSelectedCount === 0}');
        expect(helperSource).toContain('export const characterLibraryToolbarSchema = z.object(');
    });

    test('bridges the legacy workspace shell into the React character-library panel bundle', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain('globalThis.__emberDeskCharacterLibraryPanelBridge');
        expect(scriptSource).toContain('/react/login/assets/character-library-panel.js');
        expect(scriptSource).toContain('mountCharacterLibraryToolbar');
        expect(scriptSource).toContain('updateCharacterLibraryToolbar');
        expect(scriptSource).toContain('applySearchQuery(searchQuery)');
        expect(scriptSource).toContain('applySortOption(sortValue)');
        expect(scriptSource).toContain('createEntityElement(entity)');
        expect(scriptSource).toContain('mountReactCharacterLibraryPanel');
        expect(scriptSource).toContain('mountReactCharacterLibraryToolbar');
        expect(scriptSource).toContain('renderCharacterListPageReact');
    });
});
