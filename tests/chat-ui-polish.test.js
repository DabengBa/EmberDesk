import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

describe('chat UI polish styles', () => {
    test('summary card readability and affordance', () => {
        const block = css.match(/\.turn-summary-pill\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(block).toMatch(/opacity:\s*1/);
        expect(block).toMatch(/cursor:\s*pointer/);
        expect(block).toMatch(/font-size:\s*calc\(var\(--mainFontSize\)\s*\*\s*0\.95\)/);
    });
    test('pipeline auxiliary block is grouped with message body', () => {
        const block = css.match(/\[data-pipeline-card\]\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(block).toMatch(/margin:\s*8px\s+0\s+0/);
        expect(block).toMatch(/border-left:/);
    });
});
