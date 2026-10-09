import * as stylex from '@stylexjs/stylex';
import { settingsStyles } from '@/styles/settings-surface.styles';

type SettingsTab = {
    id: string;
    label: string;
    description: string;
};

type SettingsTabsProps = {
    tabs: SettingsTab[];
    activeTab: string;
    onChange: (tabId: string) => void;
    showDescription?: boolean;
};

export function SettingsTabs({ tabs, activeTab, onChange, showDescription = true }: SettingsTabsProps) {
    const currentTab = tabs.find(tab => tab.id === activeTab) ?? tabs[0];

    return (
        <div {...stylex.props(settingsStyles.tabs)}>
            <div {...stylex.props(settingsStyles.tabsList)} aria-label="设置分区">
                {tabs.map(tab => {
                    const isActive = tab.id === activeTab;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            className={`settings-tab ${stylex.props(settingsStyles.tab, isActive && settingsStyles.tabActive).className ?? ''}`}
                            aria-pressed={isActive}
                            data-active={isActive}
                            onClick={() => onChange(tab.id)}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {showDescription ? (
                <p {...stylex.props(settingsStyles.tabsDescription)}>{currentTab?.description}</p>
            ) : (
                <p {...stylex.props(settingsStyles.tabsDescription, settingsStyles.visuallyHidden)}>
                    {currentTab?.description}
                </p>
            )}
        </div>
    );
}
