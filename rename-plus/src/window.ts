import * as shell from 'mshell';
import type { ReactElement } from 'react';
import { createElement } from './react';
import RenameApp, { WINDOW_HEIGHT, WINDOW_WIDTH } from './app';
import { RenameItem } from './model';
import { AppSettings } from './settings';
import { t } from './i18n';

export type RenameWindowOptions = {
    items: RenameItem[];
    settings: AppSettings;
    onSettings: (patch: Partial<AppSettings>) => void;
    requestModTimes: (paths: string[], done: (map: Record<string, Date>) => void) => void;
};

type OpenWindow = {
    win: shell.breeze_ui.window;
    renderer: { render: (element: ReactElement) => void; unmount: () => void };
    disposed: boolean;
};

let current: OpenWindow | null = null;

export const isRenameWindowOpen = () => current !== null;

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

export const closeRenameWindow = () => {
    if (current) dispose(current);
};

export const openRenameWindow = (options: RenameWindowOptions) => {
    closeRenameWindow();
    shell.breeze.allow_js_reload(false);

    const state = { disposed: false } as OpenWindow;
    state.win = shell.breeze_ui.window.create_ex(
        t('重命名 Plus', 'Rename Plus'),
        WINDOW_WIDTH,
        WINDOW_HEIGHT,
        () => dispose(state)
    );
    const root = shell.breeze_ui.widgets_factory.create_flex_layout_widget();
    state.renderer = createRenderer(root);
    current = state;

    state.renderer.render(
        createElement(RenameApp, {
            items: options.items,
            settings: options.settings,
            onSettings: options.onSettings,
            requestModTimes: options.requestModTimes,
            onClose: () => state.win.close()
        })
    );
    state.win.root_widget = root;
};
