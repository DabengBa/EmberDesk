import { useLayoutEffect } from 'react';

const stylesheetGroups = [
    ['/style.css', ['/css/brands.min.css', '/css/bright.min.css', '/css/toastr.min.css']],
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
        for (const path of ['/lib/structured-clone/monkey-patch.js', '/lib/eventemitter.js', '/scripts/i18n.js']) {
            await import(/* @vite-ignore */ path);
        }
        const runtimePath = '/script.js';
        const { startWorkspaceRuntime, workspaceInitialPanelMounts: mounts } = await import(/* @vite-ignore */ runtimePath);
        await mounts.mountChatComposer();
        await Promise.all([
            mounts.mountCharacterPopup(), mounts.mountRightNavPanel(), mounts.mountSelectChatPopup(),
            mounts.mountCharacterContextMenu(), mounts.mountOptionsMenu(), mounts.mountExportFormatPopup(),
            mounts.mountDialogueDelMesControls(),
        ]);
        await startWorkspaceRuntime(revealWorkspace);
    })();
}
