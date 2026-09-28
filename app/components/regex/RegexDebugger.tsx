import { ContractIconButton } from '../contract/ContractIconButton';

export function RegexDebugger() {
    return (
        <>
<div className="regex-debugger-container">
    {/* Rules List Column */}
    <div className="regex-debugger-rules-list">
        <h3>
            <i className="fa-solid fa-list-ol" />
            <span data-i18n="ext_regex_debugger_active_rules"
                >Active Rules</span
            >
        </h3>
        <div className="flex-container">
            <button
                id="regex_debugger_save_order"
                className="menu_button menu_button_icon interactable"
                data-i18n="[title]ext_regex_debugger_save_order_help"
                title="Save current rule order"
                tabIndex={0}
            >
                <i className="fa-solid fa-floppy-disk" />
                <span data-i18n="ext_regex_debugger_save_order"
                    >Save Order</span
                >
            </button>
        </div>
        <ul id="regex_debugger_rules" className="sortable-list">
            {/* Rules will be populated here by JavaScript */}
        </ul>
    </div>

    {/* Testing Area Column */}
    <div className="regex-debugger-tester">
        <h3>
            <i className="fa-solid fa-vial" />
            <span data-i18n="ext_regex_debugger_testing_area"
                >Testing Area</span
            >
        </h3>
        <div className="regex-debugger-io">
            <div className="regex-debugger-input">
                <label
                    htmlFor="regex_debugger_raw_input"
                    data-i18n="ext_regex_debugger_raw_input"
                    >Raw Input</label
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
                    title="Run the test pipeline"
                    tabIndex={0}
                >
                    <i className="fa-solid fa-play" />
                    <span data-i18n="ext_regex_debugger_run_test"
                        >Run Test</span
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
                            <span data-i18n="ext_regex_debugger_display_replace"
                                >Replace</span
                            ></label
                        >
                        <label
                            ><input
                                type="radio"
                                name="display_mode"
                                defaultValue="highlight"
                            />
                            <span
                                data-i18n="ext_regex_debugger_display_highlight"
                                >Highlight</span
                            ></label
                        >
                    </div>
                    <select
                        id="regex_debugger_render_mode"
                    >
                        <option
                            value="text"
                            data-i18n="ext_regex_debugger_render_text"
                        >
                            Render as Text
                        </option>
                        <option
                            value="message"
                            data-i18n="ext_regex_debugger_render_message"
                        >
                            Render as Message
                        </option>
                    </select>
                </div>
            </div>
            <div className="regex-debugger-results">
                <div className="results-header">
                    <h4>
                        <i className="fa-solid fa-shoe-prints" />
                        <span data-i18n="ext_regex_debugger_step_by_step"
                            >Step-by-step Transformation</span
                        >
                    </h4>
                    <div
                        id="regex_debugger_expand_steps"
                        className="menu_button menu_button_icon"
                        data-i18n="[title]Expand view"
                        title="Expand view"
                    >
                        <i className="fa-solid fa-expand" />
                    </div>
                </div>
                <div id="regex_debugger_steps_output" className="results-box"></div>

                <div className="results-header">
                    <h4>
                        <i className="fa-solid fa-flag-checkered" />
                        <span data-i18n="ext_regex_debugger_final_output"
                            >Final Output</span
                        >
                    </h4>
                    <div
                        id="regex_debugger_expand_final"
                        className="menu_button menu_button_icon"
                        data-i18n="[title]Expand view"
                        title="Expand view"
                    >
                        <i className="fa-solid fa-expand" />
                    </div>
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
<template id="regex_debugger_rule_template">
    <li className="regex-debugger-rule" draggable={true}>
        <i className="fa-solid fa-grip-vertical handle" />
        <label className="checkbox">
            <span className="sr-only">Rule enabled</span>
            <input type="checkbox" className="rule-enabled" defaultChecked />
        </label>
        <div className="rule-details">
            <span className="rule-name"></span>
            <code className="rule-regex"></code>
            <small className="rule-scope"></small>
        </div>
        <ContractIconButton className="menu_button menu_button_icon edit_rule" label="Edit Rule" title="Edit Rule" nativeTitle icon={<i className="fa-solid fa-pencil" aria-hidden="true" />} />
    </li>
</template>

{/* Template for a single transformation step */}
<template id="regex_debugger_step_template">
    <div className="step-result">
        <div className="step-header">
            <strong></strong>
        </div>
        <pre className="step-output"></pre>
    </div>
</template>
        </>
    );
}
