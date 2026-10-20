# 主聊天消息渲染重构方案（CARE）

> 起因：删除会话中某条回复卡片后，整个聊天内容消失数秒。根因经代码核对与 E2E 插桩双重验证。

## 已验证根因（React-dom 19.2.7 源码 + 插桩实测）

1. **行身份 = 数组下标**：`main-chat-store-projection.js` 把 `chat[]` 下标当 `id`，`workspace-panels.tsx` 用它当 React `key`。删除第 k 条后，k 之后所有消息 key 全变 → unmount/remount → iframe 销毁。
2. **`dangerouslySetInnerHTML` 按对象引用 diff**：`{ __html }` 每次渲染是新字面量 → `updateProperties` 通用循环用 `!==` 比较 → `setProp` 无条件执行 `el.innerHTML = ...`（react-dom 19 无 `__html` 字符串比较；18 有，19 重写后丢失）。插桩实测：**同一行被赋值 8 次、内容逐字节相同**。`innerHTML` 赋值即摧毁全部子节点 → 删除点之前的卡片 iframe 同样被杀。
3. **快照全量重建**：任何 UI 态变化（含 composer 每次按键）都触发 `mountReactMainChatMessageListPanel` → 每条可见消息重跑 `messageFormatting`。
4. **iframe 无初始高度 + 帧内 500ms 节流测量**：重建后高度塌缩 → `scrollHeight` 骤降 → 浏览器截断 `scrollTop` → 用户看到"会话消失"，且卡片真实内容（脚本/CDN）重载耗时放大到数秒。

## 不变量（写进测试防回归）

| 不变量 | 验收方式 |
|---|---|
| 内容未变的消息行，DOM 子树零触碰 | 删除第 k 条 → 其余行 innerHTML/srcdoc 赋值 = 0，行 DOM 节点引用不变 |
| iframe 高度塌缩被高度缓存消除 | remount 后 scrollTop 变化 ≤ 2px |
| 格式化调用与会话噪声解耦 | composer 打字 → formatMessage 调用 = 0 |

## 设计决策（含评审修正）

- **UID 双轨**：`uid` 仅作渲染身份（React key、frame 归属、块展开态），会话内稳定即可 → `WeakMap<messageObject, uid>`，消息对象原位修改（mes/extra）不改变 uid；删除/移动保留对象引用即保留身份。命令寻址、`mesid` 属性、下标不动。
- **行内容仍归 React**（不开 "React sole owner" 例外）：`<StaticHtml>` 用 ref + `useLayoutEffect` 自管 `innerHTML`，React 对该子树零 diff；iframe 受保护。`React.memo` + 自定义比较器挡掉无关重渲染。
- **投影记录复用**（不做内容哈希缓存，因 formatter 不纯——depth/宏/正则依赖会话态）：仅当 `chatId 相同 && chat 数组引用相同 && 长度相同 && message 对象引用相同 && message.mes/extra 引用相同 && uiState 引用相同 && formatEpoch 相同` 时复用整条 record（跳过 `formatMessage`）。会话成员变化（删除/新增）→ 全量重建一次（depth 必须重算，行为正确）；打字/菜单等热路径 O(1)。`formatEpoch` 在 `settings_updated` 时 bump（正则/显示设置变更失效）。store 侧 `normalizeMessages` 对引用相同的输入 record 直接复用已 normalize 的实例。
- **FramePool 修正版**：iframe 节点重新插入 DOM 必然重载（规范行为），"池化复用节点"不可行 → 不做节点池。实际交付：① 高度缓存 `Map<docSignature, px>` + 挂载前先写占位高；② 父侧 `ResizeObserver` 直接观察 `iframe.contentDocument`，废除帧内测高回路（保留 `--ed-viewport-height`/`EmberDeskFrame` 预定义）；③ `frameId` 改用 uid 派生（`ctx.frameIdSeed`），`expandedBlockKeys`/桥归属随消息身份而非下标；④ `EmberDeskFrame` 对帧暴露的 `messageId` 保持下标语义不变（兼容用户脚本）。
- **FramePool-lite 的范围外项**（评审确认后降级）：跨消息文档复用（需 postMessage 重绑身份）、detached-iframe 冻结协议、IntersectionObserver 懒挂载、全局 audit 广播删改——本轮不阻塞，列为后续。
- **虚拟化不做**：窗口上限 `CHAT_TRUNCATION=100` 已限 DOM 规模；`.mes[mesid]` 直系结构契约会与虚拟容器冲突。后续仅当以数据证明不足时再做，优先 `content-visibility` + `contain-intrinsic-size`。
- **Worker 投影不做**：formatter 非纯函数（DOMPurify 要 DOM、正则/宏依赖会话态），需先独立抽纯函数工程，价值/成本比不支持现在做。
- **结构化块不做 typed 化**：`status-cards`/`pipeline-card` 由用户正则驱动，typed 化会冻结可编辑契约；保留 HTML+沙箱通道。
- **同源信任模型如实表述**：不加 `sandbox` 伪硬化；`EmberDeskFrame` API 维持现状。

## 交付切片

- **S1** 高度稳定：`frontend-frame.js` 父侧 RO + docSignature 高度缓存 + 挂载前占位高。
- **S2** `<StaticHtml>` × 5 注入点 + `React.memo(Row)`。
- **S3** uid 渲染身份：`message-uid.js`、record.uid、row key、frameIdSeed、expandedBlockKeys。
- **S4** 投影/store 记录复用 + `formatEpoch`（settings_updated 失效）。
- **回归**：e2e 断言"删除一条含卡消息后其余行 iframe 元素引用不变、srcdoc 未重赋值、scrollTop 稳定"；单测覆盖 uid 稳定性、记录复用、高度缓存；`test:compat` + lint + 三个 React build。

## 实施状态

S1–S4 已完成并通过回归：`chat-message-frontend-frames.e2e.js` 新增"删除靠前消息后幸存 iframe 元素/srcdoc/高度全部保持"断言；`message-uid`、`main-chat-store-projection`、`main-chat-store`、`frontend-frame` 单测覆盖 uid 稳定性、record 复用、失效、高度缓存；`test:compat`、全量单测、`tsc --noEmit`、oxlint 全绿。遗留：FramePool-lite 范围外项（跨消息复用、冻结协议、懒挂载、audit 广播删改）与 formatter 纯度拆分列入后续阶段。
