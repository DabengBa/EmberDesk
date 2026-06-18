import type { ReactNode } from 'react';

type SettingsSectionProps = {
    title: string;
    description: string;
    children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
    return (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-5">
            <header className="mb-4 space-y-1">
                <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
                <p className="text-sm text-zinc-400">{description}</p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">{children}</div>
        </section>
    );
}
