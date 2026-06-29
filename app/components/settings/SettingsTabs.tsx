type SettingsTab = {
    id: string;
    label: string;
    description: string;
};

type SettingsTabsProps = {
    tabs: SettingsTab[];
    activeTab: string;
    onChange: (tabId: string) => void;
};

export function SettingsTabs({ tabs, activeTab, onChange }: SettingsTabsProps) {
    const currentTab = tabs.find(tab => tab.id === activeTab) ?? tabs[0];

    return (
        <div className="settings-tabs">
            <div className="settings-tabs-list" aria-label="Settings sections">
                {tabs.map(tab => {
                    const isActive = tab.id === activeTab;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            aria-pressed={isActive}
                            data-active={isActive}
                            onClick={() => onChange(tab.id)}
                            className="settings-tab"
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <p className="settings-tabs-description">{currentTab?.description}</p>
        </div>
    );
}
