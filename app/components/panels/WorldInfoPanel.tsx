import { WorkspacePanelChrome } from './WorkspacePanelChrome';
import { translate, useTranslated } from '@/compat/i18n.js';

export function WorldInfoPanel() {
    useTranslated('');
    return (
        <WorkspacePanelChrome
            title={translate('World book')}
            icon="fa-solid fa-book-atlas"
            grabberId="WorldInfoheader"
        >
                <div id="wi-holder" className="margin5 wi-workbench">
                    <section id="wiGlobalPanel" className="wi-section wi-global-panel" aria-labelledby="wiGlobalPanelTitle">
                        <div className="wi-section-header">
                            <div className="wi-section-heading">
                                <span id="wiGlobalPanelTitle" className="wi-section-title" >{translate('Global World Info')}</span>
                                <span className="wi-section-subtitle" >{translate('Applies to all chats')}</span>
                                <span id="wiGlobalCount" className="wi-global-count" aria-live="polite">0 active</span>
                            </div>
                        </div>
                        <div id="wiTopBlock" className="wi-global-grid inline-drawer wide100p">
                            <div id="WIMultiSelector" className="wi-global-control">
                                <select id="world_info" multiple aria-label="Global World Info active in all chats" data-placeholder="No global worlds active. Select one or more worlds.">
                                    <option value="" >{translate('-- World Info not found --')}</option>
                                </select>
                            </div>
                        </div>
                    </section>
                    <section id="wiEditorPanel" className="wi-section wi-editor-panel" aria-labelledby="wiEditorPanelTitle">
                        <div className="wi-section-header">
                            <div className="wi-section-heading">
                                <span id="wiEditorPanelTitle" className="wi-section-title" >{translate('World Info Editor')}</span>
                                <span className="wi-section-subtitle" >{translate('Edit entries')}</span>
                            </div>
                        </div>
                        <div id="world_popup" data-deferred-panel="world-info-body">
                            <div className="deferred-panel-placeholder" style={{ "padding": "1em", "color": "var(--SmartThemeQuoteColor)", "textAlign": "center" }}>
                                <i className="fa-solid fa-spinner fa-spin" /> <span >{translate('Loading…')}</span>
                            </div>
                        </div>
                    </section>
                </div>
        </WorkspacePanelChrome>
    );
}
