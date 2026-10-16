export function ToolBindingEditor() {
    return (
<div id="tool_binding_editor_template">
    <div className="regex_editor">
        <h3 className="flex-container justifyCenter alignItemsBaseline">
            <strong>工具绑定编辑器</strong>
        </h3>
        <small className="flex-container extensions_info">
            把函数工具注册进生成请求。模型调用时执行 action（仅接收 args），结果写回为 tool 消息并继续生成。
        </small>
        <hr />

        <div className="flex-container flexFlowColumn">
            <div className="flex1">
                <label htmlFor="tb_name" className="title_restorable">
                    <small>工具名（tools[].function.name）</small>
                </label>
                <div>
                    <input id="tb_name" className="text_pole textarea_compact" type="text" required aria-describedby="tb_name_error" aria-label="Tool name" />
                    <small id="tb_name_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_display_name" className="title_restorable">
                    <small>显示名（可选）</small>
                </label>
                <div>
                    <input id="tb_display_name" className="text_pole textarea_compact" type="text" aria-label="Display name" />
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_description" className="title_restorable">
                    <small>描述（发给模型）</small>
                </label>
                <div>
                    <textarea id="tb_description" className="text_pole wide100p textarea_compact" rows={2} aria-label="Description" placeholder="模型据此决定何时调用本工具"></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_parameters" className="title_restorable">
                    <small>参数 JSON Schema</small>
                </label>
                <div>
                    <textarea id="tb_parameters" className="text_pole wide100p textarea_compact" rows={6} aria-describedby="tb_parameters_error" aria-label="Parameters JSON Schema" placeholder='{"type":"object","properties":{}}'></textarea>
                    <small id="tb_parameters_error" className="regex-validation-error" role="alert" hidden></small>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_action_body" className="title_restorable">
                    <small>Action（async (args) =&gt; result，仅接收 args）</small>
                </label>
                <div>
                    <textarea id="tb_action_body" className="text_pole wide100p textarea_compact" rows={6} aria-label="Action body" placeholder={'return JSON.stringify({ ok: true });'} spellCheck={false}></textarea>
                </div>
            </div>
            <div className="flex1">
                <label htmlFor="tb_format_message" className="title_restorable">
                    <small>调用提示格式（可选，(parameters) =&gt; string）</small>
                </label>
                <div>
                    <textarea id="tb_format_message" className="text_pole wide100p textarea_compact" rows={3} aria-label="Format message body" spellCheck={false}></textarea>
                </div>
            </div>
        </div>

        <div className="flex-container regex-editor-options marginTop5">
            <div className="flex1 regex-editor-option-group">
                <h4>选项</h4>
                <label className="checkbox flex-container" title="启用后随生成请求发送该工具">
                    <input type="checkbox" name="tb_enabled" defaultChecked />
                    <span>启用</span>
                </label>
                <label className="checkbox flex-container" title="调用痕迹不显示在聊天中，且不进行后续生成">
                    <input type="checkbox" name="tb_stealth" />
                    <span>Stealth（隐藏调用，不续写）</span>
                </label>
            </div>
        </div>
    </div>
</div>
    );
}
