import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('message sanitization does not reparse unknown elements', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        let reparses = 0;
        Object.defineProperty(Element.prototype, 'innerHTML', {
            ...descriptor,
            set(value) {
                if (this.localName === 'unsafewidget') reparses++;
                return descriptor.set.call(this, value);
            },
        });
        try {
            const html = window.DOMPurify.sanitize('<unsafewidget>  first\nsecond<img src=x onerror="window.__xss=1"><pre> a\nb </pre>&nbsp;  </unsafewidget>', {
                MESSAGE_SANITIZE: true,
                ADD_TAGS: ['unsafewidget'],
            });
            const template = document.createElement('template');
            template.innerHTML = html;
            const widget = template.content.querySelector('unsafewidget');
            return { reparses, html, text: widget?.textContent, breaks: widget?.querySelectorAll('br').length };
        } finally {
            Object.defineProperty(Element.prototype, 'innerHTML', descriptor);
        }
    });
    expect(result.reparses).toBe(0);
    expect(result.html).not.toContain('onerror');
    expect(result.text).toContain('firstsecond');
    expect(result.text).toContain(' a\nb ');
    expect(result.text).toContain('\u00a0');
    expect(result.breaks).toBe(1);
});

test('macro completion help strips active markup before rendering', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {

        const { MacroAutoCompleteOption } = await import('/scripts/autocomplete/MacroAutoCompleteOption.js');
        const { VariableValueContextAutoCompleteOption } = await import('/scripts/autocomplete/EnhancedMacroAutoCompleteOption.js');
        const attack = '<img src="data:image/png;base64,AA==" onerror="window.__helpXss=1"><a href="javascript:alert(1)">link</a>';

        const macroHost = document.createElement('div');
        const macroOption = new MacroAutoCompleteOption('safety-macro', '{{safety-macro}}', attack);
        macroHost.append(macroOption.renderItem(), macroOption.renderDetails());
        const variableOption = new VariableValueContextAutoCompleteOption({ symbol: attack, name: attack, description: 'safe', needsValue: true });
        macroHost.append(variableOption.renderDetails());
        document.body.append(macroHost);

        macroHost.querySelectorAll('img').forEach(img => img.dispatchEvent(new Event('error')));
        return {
            macroHtml: macroHost.innerHTML,
            macroHasUnsafeMarkup: !!macroHost.querySelector('[onerror], a[href^="javascript:"]'),
            executed: window.__helpXss === 1,
        };
    });
    expect(result.executed).toBe(false);
    expect(result.macroHasUnsafeMarkup).toBe(false);
});
