import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContractIconButton } from '../contract/ContractIconButton';
import { ContractButton } from '../contract/ContractButton';

import { translate, useTranslated } from '@/compat/i18n.js';
function DebuggerTemplate({ id, children }: { id: string; children: ReactNode }) {
    const [template, setTemplate] = useState<HTMLTemplateElement | null>(null);
    return <><template id={id} ref={setTemplate} />{template ? createPortal(children, template.content) : null}</>;
}

export function RegexDebugger() {
    useTranslated('');
    return (
        <>
<div className="regex-debugger-container">
    {/* Rules List Column */}
    <div className="regex-debugger-rules-list">
        <h3>
            <i className="fa-solid fa-list-ol" />
            <span
>{translate('Active Rules')}</span
            >
        </h3>
        <div className="flex-container">
            <button
                id="regex_debugger_save_order"
                className="menu_button menu_button_icon interactable"
                data-i18n="[title]ext_regex_debugger_save_order_help"
                title={translate("Save current rule order")}
                tabIndex={0}
            >
                <i className="fa-solid fa-floppy-disk" />
                <span
>{translate('Save Order')}</span
                >
            </button>
        </div>
        <div id="regex_debugger_empty" className="regex-debugger-no-rules" role="status" hidden>
            <p >{translate('Create a regex rule before testing transformations.')}</p>
            <ContractButton id="regex_debugger_create_rule" label="New global regex script" labelKey="ext_regex_new_global_script" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
        </div>
        <ul id="regex_debugger_rules" className="sortable-list">
            {/* Rules will be populated here by JavaScript */}
        </ul>
    </div>

    {/* Testing Area Column */}
    <div className="regex-debugger-tester">
        <h3>
            <i className="fa-solid fa-vial" />
            <span
>{translate('Testing Area')}</span
            >
        </h3>
        <div className="regex-debugger-io">
            <div className="regex-debugger-input">
                <label
                    htmlFor="regex_debugger_raw_input"

>{translate('Raw Input')}</label
                >
                <textarea
                    id="regex_debugger_raw_input"
                    className="text_pole autoSetHeight"
                    rows={4}
                ></textarea>
            </div>
            <div
                id="regex_debugger_run_test_header"
                className="flex-container"
            >
                <button
                    id="regex_debugger_run_test"
                    className="menu_button menu_button_icon interactable"
                    data-i18n="[title]ext_regex_debugger_run_test_help"
                    title={translate("Run the test pipeline")}
                    tabIndex={0}
                >
                    <i className="fa-solid fa-play" />
                    <span
>{translate('Run Test')}</span
                    >
                </button>
                <div className="flex-container gap10px">
                    <div className="radio_group">
                        <label
                            ><input
                                type="radio"
                                name="display_mode"
                                defaultValue="replace"
                                defaultChecked
                            />
                            <span
>{translate('Replace')}</span
                            ></label
                        >
                        <label
                            ><input
                                type="radio"
                                name="display_mode"
                                defaultValue="highlight"
                            />
                            <span

>{translate('Highlight')}</span
                            ></label
                        >
                    </div>
                    <select
                        id="regex_debugger_render_mode"
                        aria-label={translate('Render mode')}
                        data-i18n="[aria-label]Render mode"
                    >
                        <option
                            value="text"

>{translate('Render as Text')}</option>
                        <option
                            value="message"

>{translate('Render as Message')}</option>
                    </select>
                </div>
            </div>
            <p id="regex_debugger_result_hint"  role="status">{translate('Run a test to see each transformation and the final output.')}</p>
            <div className="regex-debugger-results" hidden>
                <div className="results-header">
                    <h4>
                        <i className="fa-solid fa-shoe-prints" />
                        <span
>{translate('Step-by-step Transformation')}</span
                        >
                    </h4>
                    <ContractIconButton id="regex_debugger_expand_steps" className="menu_button menu_button_icon" label="Expand transformation steps" title={translate("Expand view")} nativeTitle icon={<i className="fa-solid fa-expand" aria-hidden="true" />} />
                </div>
                <div id="regex_debugger_steps_output" className="results-box"></div>

                <div className="results-header">
                    <h4>
                        <i className="fa-solid fa-flag-checkered" />
                        <span
>{translate('Final Output')}</span
                        >
                    </h4>
                    <ContractIconButton id="regex_debugger_expand_final" className="menu_button menu_button_icon" label="Expand final output" title={translate("Expand view")} nativeTitle icon={<i className="fa-solid fa-expand" aria-hidden="true" />} />
                </div>
                <div
                    id="regex_debugger_final_output"
                    className="results-box final-output"
                ></div>
            </div>
        </div>
    </div>
</div>

{/* Template for a single rule item */}
<DebuggerTemplate id="regex_debugger_rule_template">
    <li className="regex-debugger-rule" draggable={true}>
        <i className="fa-solid fa-grip-vertical handle" />
        <label className="checkbox">
            <span className="sr-only">{translate("Rule enabled")}</span>
            <input type="checkbox" className="rule-enabled" defaultChecked />
        </label>
        <div className="rule-details">
            <span className="rule-name"></span>
            <code className="rule-regex"></code>
            <small className="rule-scope"></small>
        </div>
        <ContractIconButton className="menu_button menu_button_icon edit_rule" label="Edit Rule" title={translate("Edit Rule")} nativeTitle icon={<i className="fa-solid fa-pencil" aria-hidden="true" />} />
    </li>
</DebuggerTemplate>

{/* Template for a single transformation step */}
<DebuggerTemplate id="regex_debugger_step_template">
    <div className="step-result">
        <div className="step-header">
            <strong></strong>
        </div>
        <pre className="step-output"></pre>
    </div>
</DebuggerTemplate>
        </>
    );
}
