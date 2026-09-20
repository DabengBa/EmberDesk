import * as stylex from '@stylexjs/stylex';
import { welcomePanelStyles as styles } from '../../styles/welcome-panel.styles';

export function WelcomePanel({ version }: { version: string }) {
    return (
        <>
            <div className={`welcomePanel ${stylex.props(styles.panel).className ?? ''}`}>
                <div className={`welcomeHeaderTitle ${stylex.props(styles.headerTitle).className ?? ''}`}>
                    <img src="img/logo.png" alt="EmberDesk Logo" data-i18n="[alt]EmberDesk Logo" className={`welcomeHeaderLogo ${stylex.props(styles.headerLogo).className ?? ''}`} />
                    <span className={`welcomeHeaderVersionDisplay ${stylex.props(styles.headerVersion).className ?? ''}`}>{version}</span>
                </div>
            </div>
            <div className="flex-container">
                <button type="button" className="menu_button menu_button_icon drawer-opener inline-flex" data-target="sys-settings-button">
                    <i className="fa-solid fa-plug" />
                    <span data-i18n="API Connections">API Connections</span>
                </button>
            </div>
        </>
    );
}
