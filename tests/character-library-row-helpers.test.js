import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// Helpers are TypeScript source; validate via compiled-free source contract + lightweight dynamic transpile is not available.
// Assert source contracts and re-implement pure expectations by reading exported function bodies presence.

describe('character library React row helpers', () => {
    test('exports pure row projection and selector builders', () => {
        const helperSource = fs.readFileSync(path.join(repoRoot, 'app/lib/character-library-row-helpers.ts'), 'utf8');
        const rowSource = fs.readFileSync(path.join(repoRoot, 'app/components/character-library/CharacterLibraryCharacterRow.tsx'), 'utf8');
        const panelSource = fs.readFileSync(path.join(repoRoot, 'app/components/character-library/CharacterLibraryPanel.tsx'), 'utf8');

        expect(helperSource).toContain('export function buildCharacterRowClassName');
        expect(helperSource).toContain('export function buildCharacterRowDomId');
        expect(helperSource).toContain('export function projectCharacterEntityToRowModel');
        expect(helperSource).toContain('export function selectVisibleCharacterTags');
        expect(helperSource).toContain("character_select entity_block flex-container wide100p alignitemsflexstart");
        expect(helperSource).toContain('CharID');

        expect(rowSource).toContain('className="ch_fav"');
        expect(rowSource).toContain('className="tags tags_inline"');
        expect(rowSource).toContain('className="bulk_select_checkbox"');
        expect(rowSource).toContain("setAttribute('chid'");
        expect(rowSource).toContain('data-chid={String(model.id)}');
        expect(rowSource).toContain('character_selected');

        expect(panelSource).toContain('CharacterLibraryCharacterRow');
        expect(panelSource).toContain('projectCharacterEntityToRowModel');
        expect(panelSource).toContain("entity.type === 'character' && entity.item");
    });

    test('keeps protected selector contract names available for retirement gate', () => {
        const rowSource = fs.readFileSync(path.join(repoRoot, 'app/components/character-library/CharacterLibraryCharacterRow.tsx'), 'utf8');
        for (const marker of [
            'character_select',
            'data-chid',
            'ch_fav',
            'tags_inline',
            'bulk_select_checkbox',
            'character_selected',
        ]) {
            expect(rowSource).toContain(marker);
        }
    });
});
