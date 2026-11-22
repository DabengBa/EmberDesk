import { debounce, isDataURL } from './utils.js';
import { debounce_timeout } from './constants.js';
import { transitionOpacity } from './chat-ui-motion.js';
import { t } from './i18n.js';

export function bindMessageEditAutofit() {
    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        /**
         * Sets the scroll height of the edit textarea to fit the content.
         * @param {HTMLTextAreaElement} e Textarea element to auto-fit
         */
        function autoFitEditTextArea(e) {
            const chat = document.getElementById('chat');
            const scrollTop = chat.scrollTop;
            e.style.height = '0px';
            const newHeight = e.scrollHeight + 4;
            e.style.height = `${newHeight}px`;
            chat.scrollTop = scrollTop;
        }
        const autoFitEditTextAreaDebounced = debounce(autoFitEditTextArea, debounce_timeout.short);
        document.addEventListener('input', e => {
            if (e.target instanceof HTMLTextAreaElement && e.target.classList.contains('edit_textarea')) {
                const scrollbarShown = e.target.clientWidth < e.target.offsetWidth && e.target.offsetHeight >= window.innerHeight * 0.75;
                const immediately = (e.target.scrollHeight > e.target.offsetHeight && !scrollbarShown) || e.target.value === '';
                if (immediately) autoFitEditTextArea(e.target); else autoFitEditTextAreaDebounced(e.target);
            }
        });
    }
}

export function bindMessageAvatarPreview({ getCharacters, getDuration }) {
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const opener = target?.closest('.mes .avatar');
        if (!opener) return;
        const messageElement = opener.closest('.mes');
        const image = opener.querySelector(':scope > img');
        const thumbURL = image?.getAttribute('src');
        if (thumbURL == null) return;
        const charsPath = '/characters/';
        const targetAvatarImg = thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
        const charname = targetAvatarImg.replace('.png', '');
        const isValidCharacter = getCharacters().some(x => x.avatar === decodeURIComponent(targetAvatarImg));

        // Remove existing zoomed avatars for characters that are not the clicked character
        const previews = Array.from(document.querySelectorAll('.zoomed_avatar[forChar]'));
        previews.forEach(preview => {
            const currentForChar = preview.getAttribute('forChar');
            if (currentForChar !== charname) {
                console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
                preview.remove();
            }
        });

        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        const existing = previews.filter(preview => preview.getAttribute('forChar') === charname);
        if (existing.length) {
            console.debug('removing container as it already existed');
            existing.forEach(preview => transitionOpacity(preview, { opacity: 0, duration: getDuration(), complete: () => preview.remove() }));
        } else {
            console.debug('making new container from template');
            const newElement = document.querySelector('#zoomed_avatar_template .zoomed_avatar')?.cloneNode(true);
            if (!newElement) return;
            newElement.setAttribute('forChar', charname);
            newElement.id = `zoomFor_${charname}`;
            newElement.style.display = 'flex';
            newElement.style.opacity = '0';
            document.body.append(newElement);
            transitionOpacity(newElement, { opacity: 1, duration: getDuration() });
            const zoomedAvatarImgElement = newElement.querySelector('img');
            if (!zoomedAvatarImgElement) return;
            zoomedAvatarImgElement.setAttribute('alt', image.getAttribute('alt') || t`Avatar preview`);
            const closePreview = () => {
                transitionOpacity(newElement, { opacity: 0, duration: getDuration(), complete: () => { newElement.remove(); opener.focus(); } });
            };
            const close = newElement.querySelector('.dragClose');
            close?.addEventListener('click', closePreview);
            close?.focus();
            newElement.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closePreview();
                }
            });
            if (messageElement.getAttribute('is_user') == 'true' || (messageElement.getAttribute('is_system') == 'true' && !isValidCharacter)) {
                //handle user and system avatars
                zoomedAvatarImgElement.setAttribute('src', thumbURL);
            } else if (messageElement.getAttribute('is_user') == 'false') { //handle char avatars
                zoomedAvatarImgElement.setAttribute('src', avatarSrc);
            }
            zoomedAvatarImgElement.addEventListener('dragstart', e => {
                console.log('saw drag on avatar!');
                e.preventDefault();
                e.stopPropagation();
            });
        }
    });
}
