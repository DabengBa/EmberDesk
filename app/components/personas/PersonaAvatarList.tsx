import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { translate } from '../../compat/i18n.js';
import { personaPanelStyles as styles } from '../../styles/persona-panel.styles';

/**
 * React-owned persona avatar cards rendered inside the legacy
 * #user_avatar_block container, plus the pagination control portaled into
 * #persona_pagination_container. Replicates the #user_avatar_template markup
 * exactly so delegated document handlers (#user_avatar_block .avatar-container
 * select, .avatar_upload trigger), keyboard navigation (.avatar-container is a
 * registered interactable), lock-state CSS (.locked_to_chat /
 * .locked_to_character gate the state badges), and extension selectors keep
 * working unchanged.
 */
export interface PersonaAvatarItem {
    avatarId: string;
    name: string;
    description: string;
    descriptionMuted: boolean;
    title: string;
    avatarUrl: string;
    isDefault: boolean;
    lockedToChat: boolean;
    lockedToCharacter: boolean;
    selected: boolean;
}

export interface PersonaAvatarListPagination {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    /** Pre-formatted navigator label ("1-5 .. 12"), matching PAGINATION_TEMPLATE. */
    label: string;
    pageSizeOptions: number[];
}

export interface PersonaAvatarListState {
    items: PersonaAvatarItem[];
    gridView: boolean;
    pagination: PersonaAvatarListPagination | null;
}

export interface PersonaAvatarListBridge {
    setPage?(page: number): void;
    setPageSize?(pageSize: number): void;
}

function PersonaAvatarCard({ item }: { item: PersonaAvatarItem }) {
    const containerClass = [
        'avatar-container',
        item.isDefault ? 'default_persona' : '',
        item.lockedToChat ? 'locked_to_chat' : '',
        item.lockedToCharacter ? 'locked_to_character' : '',
        item.selected ? 'selected' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={containerClass} data-avatar-id={item.avatarId}>
            <div className="avatar" {...{ imgfile: '' }} data-avatar-id={item.avatarId} title={item.avatarId}>
                <img src={item.avatarUrl} alt="User Avatar" />
            </div>
            <div className="flex-container wide100pLess70px character_select_container">
                <div className="wide100p character_name_block">
                    <span className="ch_name flex1">{item.name}</span>
                    <small className="ch_additional_info">{item.title}</small>
                </div>
                <div className={`ch_description${item.descriptionMuted ? ' text_muted' : ''}`}>{item.description}</div>
                <div className="avatar_container_states buttons_block">
                    <div className="locked_to_chat_label avatar_state has_hover_label menu_button menu_button_icon disabled" title={translate('Persona is locked to the current chat')} data-i18n="[title]Persona is locked to the current chat">
                        <i className="icon fa-solid fa-lock fa-fw" />
                        <i className="label_icon icon fa-solid fa-comments fa-fw" />
                        <div className="label" data-i18n="Chat">{translate('Chat')}</div>
                    </div>
                    <div className="locked_to_character_label avatar_state has_hover_label menu_button menu_button_icon disabled" title={translate('Persona is locked to the current character')} data-i18n="[title]Persona is locked to the current character">
                        <i className="icon fa-solid fa-lock fa-fw" />
                        <i className="label_icon icon fa-solid fa-user fa-fw" />
                        <div className="label" data-i18n="Character">{translate('Character')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * React-owned pagination control mirroring the paginationjs DOM shape
 * (nav/pages/size-changer incl. J-paginationjs-* hooks) so theme CSS and
 * extension selectors keep matching. Rendered inside the legacy
 * #persona_pagination_container host via portal.
 */
function PersonaAvatarListPager({
    pagination,
    container,
    bridge,
}: {
    pagination: PersonaAvatarListPagination;
    container: HTMLElement;
    bridge: PersonaAvatarListBridge;
}) {
    const totalPages = Math.max(Math.ceil(pagination.totalCount / Math.max(pagination.pageSize, 1)), 1);
    const currentPage = pagination.currentPage;
    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;
    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            bridge.setPage?.(page);
        }
    };

    return createPortal(
        <div className="paginationjs" data-react-pagination-owner="react">
            <div className="paginationjs-nav J-paginationjs-nav">{pagination.label}</div>
            <div className="paginationjs-pages">
                <ul>
                    <li
                        className={`paginationjs-first${isFirstPage ? ' disabled' : ' J-paginationjs-first'}`}
                        data-num={isFirstPage ? undefined : 1}
                        title={isFirstPage ? undefined : 'First page'}
                        onClick={isFirstPage ? undefined : () => goToPage(1)}
                    >
                        <a>{'\u00AB'}</a>
                    </li>
                    <li
                        className={`paginationjs-prev${isFirstPage ? ' disabled' : ' J-paginationjs-previous'}`}
                        data-num={isFirstPage ? undefined : currentPage - 1}
                        title={isFirstPage ? undefined : 'Previous page'}
                        onClick={isFirstPage ? undefined : () => goToPage(currentPage - 1)}
                    >
                        <a>{'<'}</a>
                    </li>
                    <li
                        className={`paginationjs-next${isLastPage ? ' disabled' : ' J-paginationjs-next'}`}
                        data-num={isLastPage ? undefined : currentPage + 1}
                        title={isLastPage ? undefined : 'Next page'}
                        onClick={isLastPage ? undefined : () => goToPage(currentPage + 1)}
                    >
                        <a>{'>'}</a>
                    </li>
                    <li
                        className={`paginationjs-last${isLastPage ? ' disabled' : ' J-paginationjs-last'}`}
                        data-num={isLastPage ? undefined : totalPages}
                        title={isLastPage ? undefined : 'Last page'}
                        onClick={isLastPage ? undefined : () => goToPage(totalPages)}
                    >
                        <a>{'\u00BB'}</a>
                    </li>
                </ul>
            </div>
            <div className="paginationjs-size-changer">
                <select
                    className="J-paginationjs-size-select"
                    aria-label="Personas per page"
                    value={String(pagination.pageSize)}
                    onChange={event => bridge.setPageSize?.(Number(event.target.value))}
                >
                    {pagination.pageSizeOptions.map(option => (
                        <option key={option} value={String(option)}>{`${option} ${translate('/ page')}`}</option>
                    ))}
                </select>
            </div>
        </div>,
        container,
    );
}

export function PersonaAvatarList({ state, bridge }: { state: PersonaAvatarListState; bridge: PersonaAvatarListBridge }) {
    const pagerHost = document.getElementById('persona_pagination_container');

    return (
        <>
            <div className={`avatar_upload ${stylex.props(styles.avatarUpload).className ?? ''}`}>+</div>
            {state.items.map(item => (
                <PersonaAvatarCard key={item.avatarId} item={item} />
            ))}
            {state.pagination && pagerHost ? (
                <PersonaAvatarListPager pagination={state.pagination} container={pagerHost} bridge={bridge} />
            ) : null}
        </>
    );
}
