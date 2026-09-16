import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Theme } from '@astryxdesign/core';
import { createRouter } from './router';
import { emberDeskTheme } from './lib/theme-tokens';

const router = createRouter();
const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (rootElement) {
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
