import { useLayoutEffect } from 'react';
import { installWorkspaceI18n } from '../../compat/i18n.js';

const stylesheetGroups = [
    ['/style.css', ['/css/brands.min.css', '/css/bright.min.css', '/css/notifications.css']],
    ['/css/user.css', ['/css/toggle-dependent.css', '/css/world-info.css', '/scripts/extensions/regex/style.css', '/css/mobile-styles.css', '/css/macros.css']],
] as const;

export function useWorkspacePresentation() {
    useLayoutEffect(() => {
        const { body, documentElement } = document;
        body.classList.remove('login');
        body.classList.add('no-blur');

        const links = stylesheetGroups.flatMap(([before, paths]) => {
            const anchor = document.head.querySelector(`link[rel="stylesheet"][href="${before}"]`);
            return paths.map(path => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = path;
                document.head.insertBefore(link, anchor);
                return link;
            });
        });

        const updateHeight = () => documentElement.style.setProperty('--doc-height', `${window.innerHeight}px`);
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => {
            for (const link of links) link.remove();
            window.removeEventListener('resize', updateHeight);
            documentElement.style.removeProperty('--doc-height');
            body.classList.remove('no-blur');
            body.classList.add('login');
        };
    }, []);
}

function loadClassicScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
        document.head.append(script);
    });
}

let startup: Promise<void> | undefined;

export function startWorkspace(revealWorkspace: () => void): Promise<void> {
    // StrictMode can run mount effects twice. The native workspace has one runtime per document.
    return startup ??= (async () => {
        const { prepareWorkspacePanels } = await import('../../compat/workspace-panels-entry');
        await prepareWorkspacePanels();

        await loadClassicScript('/lib/polyfill.js');
        // Use original URLs so dependencies and the browser entry share module state.
        // Preserve the original graph root: importing /script.js first breaks its i18n/power-user cycle.
        // Absolute URLs also prevent Vite dev from appending ?import to native module identities.
        const eventsPath = new URL('/lib/eventemitter.js', location.href).href;
        await import(/* @vite-ignore */ eventsPath);
        const i18nPath = new URL('/scripts/i18n.js', location.href).href;
        installWorkspaceI18n(await import(/* @vite-ignore */ i18nPath));
        const runtimePath = new URL('/script.js', location.href).href;
        const { startWorkspaceRuntime, workspaceFrontendFrames, workspaceInitialPanelMounts: mounts } = await import(/* @vite-ignore */ runtimePath);
        const { installFrontendFrameRuntime } = await import('../../compat/frontend-frames');
        installFrontendFrameRuntime(workspaceFrontendFrames);
        await mounts.mountChatComposer();
        await Promise.all([
            mounts.mountCharacterPopup(), mounts.mountRightNavPanel(), mounts.mountSelectChatPopup(),
            mounts.mountCharacterContextMenu(), mounts.mountOptionsMenu(), mounts.mountExportFormatPopup(),
            mounts.mountDialogueDelMesControls(),
        ]);
        await startWorkspaceRuntime(revealWorkspace);
    })();
}
