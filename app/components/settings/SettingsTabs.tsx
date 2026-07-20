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

            {showDescription ? (
                <p className="settings-tabs-description">{currentTab?.description}</p>
            ) : (
                <p className="settings-tabs-description settings-tabs-description--visually-hidden">
                    {currentTab?.description}
                </p>
            )}
        </div>
    );
}
