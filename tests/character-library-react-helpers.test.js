import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import {
    CharacterLibraryFetchError,
    getCharacterLibraryFetchErrorData,
    hasCharacterLibraryPayloadChanged,
    parseCharacterLibraryFetchResponse,
    projectCharacterLibraryQueryAgainstDeletedAvatars,
} from '../public/scripts/character-library-react-sync.js';

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
        expect(toolbarSource).toContain('getCharacterLibraryBulkSelectionShortText');
        expect(toolbarSource).toContain('toolbarForm.reset(nextDefaults);');
        expect(toolbarSource).toContain('bridge.applySearchQuery');
        expect(toolbarSource).toContain('bridge.applySortOption');
        expect(toolbarSource).toContain('disabled?: boolean;');
        expect(toolbarSource).toContain("className={`menu_button character-list-action${disabled ? ' disabled' : ''}`}");
        expect(toolbarSource).toContain('disabled={disabled}');
        expect(toolbarSource).toContain('aria-disabled={disabled}');
        expect(toolbarSource).toContain('className="character-library-bulk-selected-count paginationjs-nav"');
        expect(toolbarSource).toContain('role="status"');
        expect(toolbarSource).toContain('aria-label={bulkSelectedLabel}');
        expect(toolbarSource).toContain('disabled={state.bulkSelectedCount === 0}');
        expect(helperSource).toContain('export const characterLibraryToolbarSchema = z.object(');
        expect(helperSource).toContain('export function getCharacterLibraryBulkSelectionShortText(');
        expect(helperSource).toContain('locale.toLowerCase().startsWith(\'zh\')');
    });

    test('keeps bogus-folder back block additive to virtualized character rows', () => {
        const panelSource = read('app/components/character-library/CharacterLibraryPanel.tsx');

        expect(panelSource).toContain('const showVirtualRows = !state.renderPlan.showEmptyBlock;');
        expect(panelSource).not.toContain('const showVirtualRows = !state.renderPlan.includeBackBlock && !state.renderPlan.showEmptyBlock;');
        expect(panelSource).toContain('{state.renderPlan.includeBackBlock ? <LegacyElementHost factory={backBlockFactory} /> : null}');
        expect(panelSource).toContain('const entity = state.pageEntities[item.index];');
    });

    test('bridges the legacy workspace shell into the React character-library panel bundle', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain('globalThis.__emberDeskCharacterLibraryPanelBridge');
        expect(scriptSource).toContain('/react/login/assets/character-library-panel.js');
        expect(scriptSource).toContain('const characterLibraryToolbarState = {');
        expect(scriptSource).toContain('updateCharacterLibraryToolbarOwnerState({ searchQuery });');
        expect(scriptSource).toContain('updateCharacterLibraryToolbarOwnerState({ sortValue: getSelectedCharacterLibrarySortValue() });');
        expect(scriptSource).toContain('void syncReactCharacterLibraryToolbarState();');
        expect(scriptSource).toContain('parseCharacterLibraryFetchResponse(response)');
        expect(scriptSource).toContain('getCharacterLibraryFetchErrorData(error)');
        expect(scriptSource).toContain('hasCharacterLibraryPayloadChanged(characters, normalizedCharacters)');
        expect(scriptSource).toContain('mountCharacterLibraryToolbar');
        expect(scriptSource).toContain('updateCharacterLibraryToolbar');
        expect(scriptSource).toContain('applySearchQuery(searchQuery)');
        expect(scriptSource).toContain('applySortOption(sortValue)');
        expect(scriptSource).toContain('createEntityElement(entity)');
        expect(scriptSource).toContain('mountReactCharacterLibraryPanel');
        expect(scriptSource).toContain('mountReactCharacterLibraryToolbar');
        expect(scriptSource).toContain('renderCharacterListPageReact');
    });

    test('preserves structured /api/characters/all overflow errors for the legacy popup path', async () => {
        const response = {
            ok: false,
            status: 413,
            statusText: 'Payload Too Large',
            json: async () => ({ overflow: true }),
        };

        await expect(parseCharacterLibraryFetchResponse(response)).rejects.toMatchObject({
            name: 'CharacterLibraryFetchError',
            status: 413,
            data: { overflow: true },
        });

        const error = await parseCharacterLibraryFetchResponse(response).catch(caughtError => caughtError);

        expect(error).toBeInstanceOf(CharacterLibraryFetchError);
        expect(getCharacterLibraryFetchErrorData(error)).toEqual({ overflow: true });
    });

    test('detects changed character payload fields outside the row summary fingerprint', () => {
        const currentCharacters = [{
            avatar: 'alpha.png',
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: ['old'],
        }];
        const nextCharacters = [{
            avatar: 'alpha.png',
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: ['new'],
        }];

        expect(hasCharacterLibraryPayloadChanged(currentCharacters, nextCharacters)).toBe(true);
        expect(hasCharacterLibraryPayloadChanged(nextCharacters, structuredClone(nextCharacters))).toBe(false);
    });

    test('suppresses deleted avatars from stale query payloads until the server snapshot catches up', () => {
        const staleQueryPayload = [
            { avatar: 'alpha.png', name: 'Alpha' },
            { avatar: 'beta.png', name: 'Beta' },
        ];

        expect(projectCharacterLibraryQueryAgainstDeletedAvatars(staleQueryPayload, ['beta.png'])).toEqual({
            characters: [{ avatar: 'alpha.png', name: 'Alpha' }],
            pendingDeletedAvatars: ['beta.png'],
        });

        expect(projectCharacterLibraryQueryAgainstDeletedAvatars([
            { avatar: 'alpha.png', name: 'Alpha' },
        ], ['beta.png'])).toEqual({
            characters: [{ avatar: 'alpha.png', name: 'Alpha' }],
            pendingDeletedAvatars: [],
        });
    });
});
