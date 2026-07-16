import { useEffect, useRef } from 'react';

interface HostedDomSlotProps {
    className?: string;
    factory: () => HTMLElement | Promise<HTMLElement | null> | null | undefined;
}

/**
 * Mounts an existing DOM node into React layout without claiming list ownership.
 * Used for extension/tag chrome that still live in the workspace shell.
 */
export function HostedDomSlot({ className, factory }: HostedDomSlotProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        const mount = async () => {
            const host = hostRef.current;
            if (!host) {
                return;
            }

            host.replaceChildren();
            const element = await factory();
            if (!cancelled && element) {
                host.appendChild(element);
            }
        };

        void mount();
        return () => {
            cancelled = true;
        };
    }, [factory]);

    return <div ref={hostRef} className={className} />;
}
