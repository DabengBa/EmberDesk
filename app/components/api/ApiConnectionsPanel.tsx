/**
 * API Connections drawer markup (React-owned shell inside #rm_api_block).
 * Behavior stays legacy: openai.js/secrets.js bind inputs and fill datalists
 * after the synchronous mount.
 */
export function ApiConnectionsPanel() {
    return (
        <>
                <h3 className="margin0" id="title_api" data-i18n="API Connections">API 连接</h3>
                <div className="flex-container flexFlowColumn">
                    <div id="api_connection_form">
                        <div className="api-primary-path">
                            <div className="chat-completion-select">
                                <div className="chat-completion-row">
                                    <label className="chat-completion-field provider-field" htmlFor="chat_completion_source">
                                        <span className="field-label" data-i18n="Provider">Provider</span>
                                        <select id="chat_completion_source">
                                            <option value="openai">OpenAI</option>
                                            <option value="claude">Claude</option>
                                            <option value="makersuite">Google</option>
                                        </select>
                                    </label>
                                    <div id="openai_form" className="chat-completion-field model-field" data-source="openai">
                                        <label className="field-label" htmlFor="model_openai_select" data-i18n="Model">Model</label>
                                        <input id="model_openai_select" list="model_openai_list" className="text_pole" placeholder="Select or type a model" />
                                        <datalist id="model_openai_list"></datalist>
                                    </div>
                                    <div id="claude_form" className="chat-completion-field model-field" data-source="claude">
                                        <label className="field-label" htmlFor="model_claude_select" data-i18n="Model">Model</label>
                                        <input id="model_claude_select" list="model_claude_list" className="text_pole" placeholder="Select or type a model" />
                                        <datalist id="model_claude_list"></datalist>
                                    </div>
                                    <div id="makersuite_form" className="chat-completion-field model-field" data-source="makersuite">
                                        <label className="field-label" htmlFor="model_google_select" data-i18n="Model">Model</label>
                                        <input id="model_google_select" list="model_google_list" className="text_pole" placeholder="Select or type a model" />
                                        <datalist id="model_google_list"></datalist>
                                    </div>
                                </div>
                                <div id="api_key_section">
                                    <div className="flex-container width100p">
                                        <input id="api_key_unified" type="text" className="text_pole flex1 api-key-masked" autoComplete="off" data-lpignore="true" data-1p-ignore data-bwignore data-i18n="[placeholder]API Key" placeholder="API Key" />
                                        <button type="button" id="api_key_unified_manage" className="menu_button menu_button_icon manage-api-keys" title="Manage API keys" aria-label="Manage API keys" data-i18n="[title][aria-label]Manage API keys">
                                            <i className="fa-solid fa-key" aria-hidden="true" />
                                        </button>
                                        <div id="api_key_unified_show" title="Peek a password" data-i18n="[title]Peek a password" className="menu_button fa-solid fa-eye-slash fa-fw"></div>
                                    </div>
                                </div>
                            </div>
                            <div className="base-url-field wide100p" data-source="openai,claude,makersuite">
                                <label className="chat-completion-field wide100p" htmlFor="openai_reverse_proxy">
                                    <span className="field-label" data-i18n="Base URL">Base URL</span>
                                    <input id="openai_reverse_proxy" type="text" className="text_pole" aria-label="Base URL" aria-describedby="base_url_status" placeholder="Optional endpoint" />
                                </label>
                                <small id="base_url_status" className="base-url-status" role="status" aria-live="polite" data-mode="direct" data-i18n="Direct provider endpoint. API key stays in the API Key field.">
                                    Direct provider endpoint. API key stays in the API Key field.
                                </small>
                            </div>
                        </div>
                        <section id="fallback_provider_section" className="fallback-provider-section" data-doc-id="feature.fallback_provider" data-source="openai">
                            <div className="fallback-provider-header">
                                <label className="checkbox_label margin0 widthFreeExpand" htmlFor="fallback_provider_enabled">
                                    <input id="fallback_provider_enabled" type="checkbox" />
                                    <span data-i18n="Fallback provider">Fallback provider</span>
                                </label>
                                <span id="fallback_provider_status" className="fallback-provider-status" role="status" aria-live="polite" data-i18n="Disabled">Disabled</span>
                            </div>
                            <div className="fallback-provider-details">
                                <div className="fallback-provider-fields">
                                    <label className="fallback-provider-field" htmlFor="fallback_provider_base_url">
                                        <span className="field-label" data-i18n="Base URL">Base URL</span>
                                        <input id="fallback_provider_base_url" type="text" className="text_pole" aria-label="Fallback provider Base URL" placeholder="https://api.openai.com/v1" />
                                    </label>
                                    <label className="fallback-provider-field" htmlFor="fallback_provider_model">
                                        <span className="field-label" data-i18n="Model">Model</span>
                                        <input id="fallback_provider_model" type="text" className="text_pole" placeholder="gpt-4.1-mini" />
                                    </label>
                                </div>
                                <div className="fallback-provider-key-row">
                                    <input id="fallback_provider_api_key" type="text" className="text_pole flex1 api-key-masked" autoComplete="off" data-lpignore="true" data-1p-ignore data-bwignore data-i18n="[placeholder]Fallback API Key" placeholder="Fallback API Key" />
                                    <div id="fallback_provider_api_key_show" className="menu_button menu_button_icon fallback_provider_api_key_show fa-solid fa-eye-slash fa-fw" title="Show fallback API key" data-i18n="[title]Show fallback API key" role="button" aria-label="Show fallback API key" tabIndex={0}></div>
                                    <div id="fallback_provider_save_key" className="menu_button menu_button_icon fallback_provider_save_key fa-solid fa-save fa-fw" title="Save fallback API key" data-i18n="[title]Save fallback API key" role="button" aria-label="Save fallback API key" tabIndex={0}></div>
                                    <div id="fallback_provider_clear_key" className="menu_button menu_button_icon fallback_provider_clear_key fa-solid fa-trash-can fa-fw" title="Clear fallback API key" data-i18n="[title]Clear fallback API key" role="button" aria-label="Clear fallback API key" tabIndex={0}></div>
                                </div>
                                <div id="fallback_provider_cost_warning" className="info-block warning fallback-provider-warning" role="note" data-i18n="Fallback provider may use a different billing account and model pricing.">
                                    Fallback provider may use a different billing account and model pricing.
                                </div>
                            </div>
                        </section>
                        <div className="chat-completion-provider-options" data-source="makersuite">
                            <label className="checkbox_label margin-top-5px">
                                <input id="use_vertexai" type="checkbox" />
                                <span data-i18n="Use Vertex AI">Use Vertex AI</span>
                            </label>
                            <div id="vertexai_config">
                                <div className="vertexai-fields-row">
                                    <div className="vertexai-field-col">
                                        <label className="field-label" data-i18n="Auth Mode">Credential Type</label>
                                        <select id="vertexai_auth_mode" className="text_pole">
                                            <option value="express" data-i18n="API Key">API Key</option>
                                            <option value="full" data-i18n="Service Account JSON">Service Account JSON</option>
                                        </select>
                                    </div>
                                    <div className="vertexai-field-col">
                                        <label className="field-label" data-i18n="Region">Region</label>
                                        <input id="vertexai_region" type="text" className="text_pole" defaultValue="us-central1" />
                                    </div>
                                </div>
                                <div id="vertexai_express_fields">
                                    <label className="field-label" data-i18n="Project ID">Project ID</label>
                                    <input id="vertexai_express_project_id" type="text" className="text_pole" placeholder="my-gcp-project" />
                                </div>
                                <div id="vertexai_full_fields">
                                    <label className="field-label" data-i18n="Service Account JSON">Service Account JSON</label>
                                    <div className="vertexai-sa-wrapper">
                                        <textarea id="vertexai_service_account_json" className="text_pole vertexai-sa-textarea sa-masked" rows={4} spellCheck={false}></textarea>
                                        <div id="vertexai_sa_show" title="Toggle visibility" data-i18n="[title]Toggle visibility" className="menu_button vertexai-sa-toggle fa-solid fa-eye-slash fa-fw"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="prompt_post_processing_form" className="inline-drawer wide100p">
                            <div className="inline-drawer-toggle inline-drawer-header">
                                <b data-i18n="Prompt Post-Processing">Prompt Post-Processing</b>
                                <div className="flex-container gap3px alignItemsCenter">
                                    <a href="usage/api-connections/openai/#prompt-post-processing" className="notes-link" target="_blank">
                                        <span className="fa-solid fa-circle-question note-link-span"></span>
                                    </a>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                            </div>
                            <div className="inline-drawer-content">
                                <select id="custom_prompt_post_processing" className="text_pole" title="Applies additional processing to the prompt before sending it to the API." data-i18n="[title]Applies additional processing to the prompt before sending it to the API.">
                                    <option data-i18n="prompt_post_processing_none" value="">None</option>
                                    <optgroup label="With Tools" data-i18n="[label]With Tools">
                                        <option data-i18n="prompt_post_processing_merge_tools" value="merge_tools">Merge consecutive roles (with tools)</option>
                                        <option data-i18n="prompt_post_processing_semi_tools" value="semi_tools">Semi-strict (alternating roles; with tools)</option>
                                        <option data-i18n="prompt_post_processing_strict_tools" value="strict_tools">Strict (user first, alternating roles; with tools)</option>
                                    </optgroup>
                                    <optgroup label="No Tools" data-i18n="[label]No Tools">
                                        <option data-i18n="prompt_post_processing_merge" value="merge">Merge consecutive roles (no tools)</option>
                                        <option data-i18n="prompt_post_processing_semi" value="semi">Semi-strict (alternating roles; no tools)</option>
                                        <option data-i18n="prompt_post_processing_strict" value="strict">Strict (user first, alternating roles; no tools)</option>
                                        <option data-i18n="prompt_post_processing_single" value="single">Single user message (no tools)</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                        <div className="flex-container flex chat-completion-actions">
                            <div id="api_button_openai" className="api_button menu_button menu_button_icon" data-i18n="Connect">Connect</div>
                            <div className="api_loading menu_button menu_button_icon" style={{ "opacity": "0.6" }} data-i18n="Cancel">Cancel</div>
                            <div data-source="openai" id="customize_additional_parameters" className="menu_button menu_button_icon api-action-secondary" data-i18n="Additional Parameters">Parameters</div>
                            <div id="test_api_button" className="api_button menu_button menu_button_icon" title="Send a short test message to verify your connection." data-i18n="[title]Send a short test message to verify your connection.;Test">Test</div>
                        </div>
                        <div className="online_status">
                            <div className="online_status_indicator"></div>
                            <div className="online_status_text" data-i18n="Not connected">Not connected</div>
                        </div>
                    </div>
                </div>
        </>
    );
}
