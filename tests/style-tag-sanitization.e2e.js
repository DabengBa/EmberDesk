import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test('decoded message styles cannot escape their style element', async ({ page }) => {
    await testSetup.awaitST({ page });

    const facts = await page.evaluate(async () => {
        const { decodeStyleTags } = await import('/scripts/chats.js');
        const style = 'a{content:"</style><img src=x onerror=window.__styleEscape=1>"}.probe{color:rgb(12,34,56)}';
        const encoded = `<custom-style>${encodeURIComponent(style)}</custom-style>`;
        const decoded = decodeStyleTags(encoded);
        const target = document.createElement('div');
        target.className = 'mes_text';
        const probe = document.createElement('div');
        probe.className = 'custom-probe';
        target.append(probe);
        const container = document.createElement('div');
        container.innerHTML = decoded;
        document.body.append(container, target);
        return {
            injectedImage: Boolean(document.querySelector('img[src="x"]')),
            closingStyleTags: decoded.match(/<\/style/gi)?.length ?? 0,
            color: getComputedStyle(probe).color,
        };
    });

    expect(facts.injectedImage).toBe(false);
    expect(facts.closingStyleTags).toBe(1);
    expect(facts.color).toBe('rgb(12, 34, 56)');
});
