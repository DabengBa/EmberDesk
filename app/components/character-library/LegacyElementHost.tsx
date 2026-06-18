import { useEffect, useRef } from 'react';

interface LegacyElementHostProps {
    className?: string;
    factory: () => HTMLElement | Promise<HTMLElement | null> | null | undefined;
}

export function LegacyElementHost({ className, factory }: LegacyElementHostProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        const mountLegacyBlock = async () => {
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

        void mountLegacyBlock();
        return () => {
            cancelled = true;
        };
    }, [factory]);

    return <div ref={hostRef} className={className} />;
}
