import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const rowSource = fs.readFileSync(path.join(repoRoot, 'app/components/main-chat/MainChatMessageRow.tsx'), 'utf8');

function extractTemplateRegion(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    if (start === -1 || end === -1) {
        throw new Error(`Template region not found: ${startMarker} .. ${endMarker}`);
    }
    return source.slice(start, end);
}

describe('main chat message row i18n parity', () => {
    const template = extractTemplateRegion(indexHtml, 'id="message_template"', 'id="onboarding_template"');
    const templateSpecs = [...template.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);

    test('message template exposes data-i18n specs', () => {
        expect(templateSpecs.length).toBeGreaterThanOrEqual(25);
    });

    test.each(templateSpecs.map(spec => [spec]))('React row preserves spec: %s', (spec) => {
        // JSX writes multi-line attribute values with real newlines instead of &#10; entities.
        const jsxSpec = spec.replace(/&#10;/g, '\\n');
        const found = rowSource.includes(`data-i18n="${spec}"`)
            || rowSource.includes(`data-i18n="${jsxSpec}"`)
            || rowSource.includes(`data-i18n={'${jsxSpec}'}`);
        expect(found).toBe(true);
    });

    test('React row preserves template title attributes verbatim', () => {
        const templateTitles = [...new Set([...template.matchAll(/title="([^"]+)"/g)].map(m => m[1]))];
        for (const title of templateTitles) {
            expect(rowSource).toContain(`title="${title}"`);
        }
    });

    test('React row uses the shared i18n bridge for programmatic strings', () => {
        expect(rowSource).toContain("from '../../compat/i18n.js'");
        expect(rowSource).toContain("translate('Regenerate')");
        expect(rowSource).not.toContain('重新生成');
    });

    test('legacy empty-reply regenerate path no longer hardcodes Chinese', () => {
        const domHandlersSource = fs.readFileSync(path.join(repoRoot, 'public/scripts/dom-handlers.js'), 'utf8');
        expect(domHandlersSource).toContain(".attr('data-i18n', 'Regenerate').text(translate('Regenerate'))");
        expect(domHandlersSource).not.toContain(".text('重新生成')");
    });
});
