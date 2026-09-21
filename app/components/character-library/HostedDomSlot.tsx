import { useEffect, useRef } from 'react';

interface HostedDomSlotProps {
    className?: string;
    factory: () => HTMLElement | Promise<HTMLElement | null> | null | undefined;
}

/**
 * Mounts an existing DOM node into React layout without claiming list ownership.
 * Used for extension/tag chrome that still live in the workspace shell.
 * On unmount the hosted element is restored to its original DOM position so
 * remounts and legacy fallbacks can pick it back up.
 */
export function HostedDomSlot({ className, factory }: HostedDomSlotProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let hosted: { element: HTMLElement; parent: Node | null; nextSibling: Node | null } | null = null;

        const mount = async () => {
            const host = hostRef.current;
            if (!host) {
                return;
            }

            host.replaceChildren();
            const element = await factory();
            if (!cancelled && element) {
                hosted = {
                    element,
                    parent: element.parentNode,
                    nextSibling: element.nextSibling,
                };
                host.appendChild(element);
            }
        };

        void mount();
        return () => {
            cancelled = true;
            if (hosted?.element && hosted.parent && hosted.element.parentNode !== hosted.parent) {
                const anchor = hosted.nextSibling && hosted.nextSibling.parentNode === hosted.parent
                    ? hosted.nextSibling
                    : null;
                hosted.parent.insertBefore(hosted.element, anchor);
            }
            hosted = null;
        };
    }, [factory]);

    return <div ref={hostRef} className={className} />;
}
