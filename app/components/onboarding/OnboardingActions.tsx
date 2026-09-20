import { ContractButton } from '../contract/ContractButton';

/**
 * Onboarding popup action buttons (React-owned inside #onboarding_template's
 * .onboarding markup). The template element is moved — not cloned — into the
 * callGenericPopup content area on first run, so the mounted React host moves
 * along with it. Clicks are document-level delegated by class
 * (.external_import_button / .open_characters_library) in dom-handlers.js.
 */
export function OnboardingActions({ which }: { which: 'import' | 'library' }) {
    if (which === 'import') {
        return (
            <ContractButton
                className="menu_button menu_button_icon external_import_button"
                icon={<i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" />}
                label="Import"
                labelKey="onboarding_import"
            />
        );
    }
    return (
        <ContractButton
            className="menu_button menu_button_icon open_characters_library"
            icon={<i className="fa-solid fa-image-portrait" aria-hidden="true" />}
            label="Sample characters"
        />
    );
}
