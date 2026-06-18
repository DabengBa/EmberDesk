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
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {tabs.map(tab => {
                    const isActive = tab.id === activeTab;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            className={`inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium transition ${
                                isActive
                                    ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100'
                                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                            }`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <p className="text-sm text-zinc-400">{currentTab?.description}</p>
        </div>
    );
}
