import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { settingsStyles } from '@/styles/settings-surface.styles';

type SettingsSectionProps = {
    title: string;
    description?: string;
    children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
    return (
        <section {...stylex.props(settingsStyles.section)}>
            <header {...stylex.props(settingsStyles.sectionHeader)}>
                <h2 {...stylex.props(settingsStyles.sectionTitle)}>{title}</h2>
                {description && <p {...stylex.props(settingsStyles.mutedText, settingsStyles.sectionDescription)}>{description}</p>}
            </header>
            <div {...stylex.props(settingsStyles.grid)}>{children}</div>
        </section>
    );
}
