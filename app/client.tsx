import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Theme } from '@astryxdesign/core';
import { createRouter } from './router';
import { emberDeskTheme } from './lib/theme-tokens';
import { readStoredUiLocale } from '../public/scripts/ui-locale.js';
import { initializeUiLocale } from './compat/i18n.js';

const router = createRouter();
const queryClient = new QueryClient();

/**
 * Standalone React pages (/login, /setup, /settings) never load the legacy
 * shell, so this bundle owns the locale: it sets the document language from the
 * same saved value and loads the same locale JSON before the first render, so
 * no surface mounts with untranslated copy and then flips.
 */
document.documentElement.lang = readStoredUiLocale();

async function start() {
    await initializeUiLocale();

    const rootElement = document.getElementById('root');
    if (!rootElement) {
        return;
    }

    createRoot(rootElement).render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}

void start();
