import type { ReactNode } from 'react';

type SettingsSectionProps = {
    title: string;
    description?: string;
    children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
    return (
        <section className="settings-section">
            <header className="settings-section-header">
                <h2 className="settings-section-title">{title}</h2>
                {description && <p className="settings-section-description">{description}</p>}
            </header>
            <div className="settings-grid">{children}</div>
        </section>
    );
}
