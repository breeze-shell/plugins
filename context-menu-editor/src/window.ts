import * as shell from 'mshell';
import { createElement, ReactElement } from './react';
import { ContextMenuEditor, WINDOW_HEIGHT, WINDOW_WIDTH } from './app';
import { Settings, MenuKind } from './types';
import { t } from './i18n';

type EditorWindowOptions = {
    settings: Settings;
    initialKind: MenuKind;
    status: string;
    onSettings: (next: Settings) => void;
};

type OpenWindow = {
    win: shell.breeze_ui.window;
    renderer: { render: (element: ReactElement) => void; unmount: () => void };
    disposed: boolean;
};

let current: OpenWindow | null = null;

export const isEditorOpen = () => current !== null;

const dispose = (state: OpenWindow) => {
    if (state.disposed) return;
    state.disposed = true;
    try {
        state.renderer.unmount();
    } catch {
    }
    try {
        state.win.close();
    } catch {
    }
    if (current === state) {
        current = null;
        shell.breeze.allow_js_reload(true);
    }
};

export const closeEditorWindow = () => {
    if (current) dispose(current);
};

export const openEditorWindow = (options: EditorWindowOptions) => {
    closeEditorWindow();
    shell.breeze.allow_js_reload(false);

    const state = { disposed: false } as OpenWindow;
    state.win = shell.breeze_ui.window.create_ex(t('右键菜单编辑器', 'Context Menu Editor'), WINDOW_WIDTH, WINDOW_HEIGHT, () =>
        dispose(state)
    );
    const root = shell.breeze_ui.widgets_factory.create_flex_layout_widget();
    state.renderer = createRenderer(root);
    current = state;

    state.renderer.render(
        createElement(ContextMenuEditor, {
            settings: options.settings,
            initialKind: options.initialKind,
            status: options.status,
            onSettings: options.onSettings,
            onClose: () => state.win.close()
        })
    );
    state.win.root_widget = root;
};
