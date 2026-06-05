import { describe, test, expect } from '@jest/globals';

async function importFreshBackgroundPanelModule() {
    return import(`../public/scripts/background-panel-controller.js?cacheBust=${Date.now()}-${Math.random()}`);
}

class FakeClassList {
    constructor() {
        this.classes = new Set();
    }

    add(...classNames) {
        for (const className of classNames) {
            this.classes.add(className);
        }
    }

    contains(className) {
        return this.classes.has(className);
    }
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.id = '';
        this.classList = new FakeClassList();
        this.children = [];
        this.parentElement = null;
        this.textContent = '';
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    prepend(child) {
        child.parentElement = this;
        this.children.unshift(child);
        return child;
    }

    remove() {
        if (!this.parentElement) {
            return;
        }

        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }

    querySelector(selector) {
        if (!selector.startsWith('#')) {
            throw new Error(`Unsupported selector in fake DOM: ${selector}`);
        }

        return findById(this, selector.slice(1));
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body', this);
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }

    getElementById(id) {
        return findById(this.body, id);
    }

    querySelector(selector) {
        return this.body.querySelector(selector);
    }
}

function findById(element, id) {
    if (element.id === id) {
        return element;
    }

    for (const child of element.children) {
        const match = findById(child, id);
        if (match) {
            return match;
        }
    }

    return null;
}

function createBackgroundRoot() {
    const document = new FakeDocument();
    const panelRoot = document.createElement('section');
    const systemContent = document.createElement('div');
    const outsideContent = document.createElement('div');

    systemContent.id = 'bg_menu_content';
    outsideContent.id = 'bg_menu_content';
    panelRoot.appendChild(systemContent);
    document.body.appendChild(outsideContent);

    return { document, panelRoot, systemContent, outsideContent };
}

describe('background panel controller', () => {
    test('reports missing default browser root without throwing ReferenceError', async () => {
        const { createBackgroundPanelController } = await importFreshBackgroundPanelModule();
        const originalDocument = global.document;

        try {
            delete global.document;

            expect(() => createBackgroundPanelController()).toThrow(
                'Background panel controller requires a root',
            );
        } finally {
            if (originalDocument === undefined) {
                delete global.document;
            } else {
                global.document = originalDocument;
            }
        }
    });

    test('classifies disabled, loading, empty, success, and error states', async () => {
        const { getBackgroundPanelState } = await importFreshBackgroundPanelModule();

        expect(getBackgroundPanelState({ disabled: true })).toEqual({
            status: 'disabled',
            showLoading: false,
            showEmpty: false,
            showError: false,
        });
        expect(getBackgroundPanelState({ isLoading: true, itemCount: 0 })).toEqual({
            status: 'loading',
            showLoading: true,
            showEmpty: false,
            showError: false,
        });
        expect(getBackgroundPanelState({ itemCount: 0 })).toEqual({
            status: 'empty',
            showLoading: false,
            showEmpty: true,
            showError: false,
        });
        expect(getBackgroundPanelState({ itemCount: 2 })).toEqual({
            status: 'success',
            showLoading: false,
            showEmpty: false,
            showError: false,
        });
        expect(getBackgroundPanelState({ error: new Error('boom'), itemCount: 2 })).toEqual({
            status: 'error',
            showLoading: false,
            showEmpty: false,
            showError: true,
        });
    });

    test('fails fast when the required system background container is missing', async () => {
        const { createBackgroundPanelController } = await importFreshBackgroundPanelModule();
        const document = new FakeDocument();

        expect(() => createBackgroundPanelController(document)).toThrow(
            'Background panel controller requires #bg_menu_content',
        );
    });

    test('adds one root-scoped loading indicator and removes it when loading ends', async () => {
        const {
            BACKGROUND_STARTUP_LOADING_ID,
            createBackgroundPanelController,
        } = await importFreshBackgroundPanelModule();
        const { panelRoot, systemContent, outsideContent } = createBackgroundRoot();

        const controller = createBackgroundPanelController(panelRoot, {
            loadingText: 'Loading backgrounds...',
        });

        controller.setLoading(true);
        controller.setLoading(true);

        expect(systemContent.children).toHaveLength(1);
        expect(systemContent.children[0].id).toBe(BACKGROUND_STARTUP_LOADING_ID);
        expect(systemContent.children[0].children[1].textContent).toBe('Loading backgrounds...');
        expect(systemContent.children[0].classList.contains('wide100p')).toBe(true);
        expect(outsideContent.children).toHaveLength(0);

        controller.setLoading(false);

        expect(systemContent.children).toHaveLength(0);
    });

    test('cleanup is idempotent and removes controller-owned loading state', async () => {
        const { createBackgroundPanelController } = await importFreshBackgroundPanelModule();
        const { panelRoot, systemContent } = createBackgroundRoot();
        const controller = createBackgroundPanelController(panelRoot, {
            loadingText: 'Loading backgrounds...',
        });

        controller.setLoading(true);

        controller.cleanup();
        controller.cleanup();

        expect(systemContent.children).toHaveLength(0);
    });
});
