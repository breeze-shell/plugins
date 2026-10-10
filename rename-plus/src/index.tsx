import * as shell from 'mshell';
import { makeActions, collectItems, requestModTimes } from './actions';
import { t } from './i18n';
import { attachRenameMenu, MenuLike } from './menu';
import { RenameItem } from './model';
import { AppSettings, defaultSettings, normalizeSettings } from './settings';
import { openRenameWindow } from './window';

const helper = plugin({ name: 'Rename+', url: import.meta.url }, defaultSettings() as unknown as object);
const CONFIG_FILE = helper.config_directory + 'config.json';
const E2E_MARKER = helper.config_directory + '.e2e';

let settings: AppSettings = normalizeSettings(helper.config.all());

const updateSettings = (patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch };
    try {
        shell.fs.write(CONFIG_FILE, JSON.stringify(settings, null, 4));
    } catch (error) {
        helper.log('无法保存配置', error);
    }
};

// breeze 的 toast 接口 (notification.*) 在插件的脚本线程上调用会把宿主进程的堆
// 搞坏 (沙箱 e2e 里稳定复现 0xC0000374), 所以结果只用日志回报, 反馈交给菜单里的
// 「撤销上次重命名」和窗口里的状态条。
const notify = (message: string) => helper.log(message);

const actions = makeActions({ settings: () => settings, save: updateSettings, log: notify });

const openWindow = (items: RenameItem[], presetId: string) => {
    openRenameWindow({
        items,
        settings: { ...settings, lastPreset: presetId },
        onSettings: updateSettings,
        requestModTimes
    });
};

const onMenu = (ctx: shell.menu_info_basic_js) => {
    const folderView = ctx.context.folder_view;
    if (!folderView) return;

    const selected = folderView.selected_files ?? [];
    const paths = selected.length > 0 ? selected : folderView.focused_file_path ? [folderView.focused_file_path] : [];
    if (paths.length === 0) return;

    const items = collectItems(paths);
    if (items.length === 0) return;

    attachRenameMenu(ctx.menu as unknown as MenuLike, items, settings, {
        openWindow,
        quickApply: actions.quickApply,
        undo: actions.undoLast,
        canUndo: actions.canUndo,
        lastBatchSize: actions.lastBatchSize
    });
};

shell.menu_controller.add_menu_listener(onMenu);

helper.set_on_menu(menu => {
    menu.append_menu({
        name: t('打开重命名 Plus 窗口…', 'Open Rename Plus window...'),
        action() {
            menu.close();
            openWindow([], settings.lastPreset);
        }
    });
    menu.append_menu({
        name: t('清除撤销记录', 'Clear undo history'),
        action() {
            updateSettings({ lastBatch: null });
            menu.close();
        }
    });
});

// 沙箱 e2e 的入口: 只有存在标记文件时才暴露, 正常安装时是关闭的。
if (shell.fs.exists(E2E_MARKER)) {
    (globalThis as Record<string, unknown>).__rename_plus = {
        collectItems,
        openWindow,
        quickApply: actions.quickApply,
        undoLast: actions.undoLast,
        onMenu,
        settings: () => settings
    };
    helper.log('e2e hook enabled');
}

helper.log('loaded');

export { };
