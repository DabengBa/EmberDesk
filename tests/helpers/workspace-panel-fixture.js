import { expect } from '@playwright/test';

// Exercise the real SPA's portal outlet without running the workspace controllers.
export async function openWorkspacePanelFixture(page, markup = '', { script = '' } = {}) {
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: script }));
    await page.route(url => url.pathname === '/', async route => {
        const app = await page.request.get('/login');
        await route.fulfill({ response: app });
    });
    await page.goto('/');
    await expect.poll(() => page.evaluate(async () => {
        const { loadWorkspacePanelsModule } = await import('/scripts/workspace-panels-react-bridge.js');
        return loadWorkspacePanelsModule().then(() => true, () => false);
    }), { timeout: 20_000 }).toBe(true);

    await page.evaluate(markup => {
        // Keep the React root mounted for its providers and outlet. Remove only
        // duplicate IDs so native fixture controllers find their own hosts.
        const app = document.getElementById('root');
        const fixture = document.createElement('template');
        fixture.innerHTML = markup;
        for (const { id } of fixture.content.querySelectorAll('[id]')) {
            app.querySelector(`#${CSS.escape(id)}`)?.removeAttribute('id');
        }
        app.hidden = true;
        document.body.append(fixture.content);
    }, markup);
}
