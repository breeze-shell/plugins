// breeze-shell 在加载插件脚本前挂到 globalThis 上的运行时对象。
import type * as ReactNS from 'react';
import type { breeze_ui, menu_controller, menu_info_basic_js } from 'mshell';

export type PluginConfig<T> = {
    i18n: {
        define(lang: string, data: Record<string, string>): void;
        t(key: string): string;
    };
    set_on_menu(callback: (menu: menu_controller) => void): void;
    readonly config_directory: string;
    config: {
        read_config(): void;
        write_config(): void;
        get(key: string): unknown;
        set(key: string, value: unknown): void;
        all(): T;
    };
    log(...args: unknown[]): void;
};

declare global {
    var plugin: <T extends object>(import_meta: { name: string; url: string }, default_config?: T) => PluginConfig<T>;
    var on_plugin_menu: Record<string, (menu: menu_controller) => void>;
    var React: typeof ReactNS;
    var createRenderer: (host: breeze_ui.js_flex_layout_widget) => {
        render: (element: ReactNS.ReactElement) => void;
        unmount: () => void;
    };

    function setTimeout(callback: () => void, delay: number): number;
    function clearTimeout(id: number): void;
    function setInterval(callback: () => void, delay: number): number;
    function clearInterval(id: number): void;

    interface ImportMeta {
        url: string;
    }
}

export { };
