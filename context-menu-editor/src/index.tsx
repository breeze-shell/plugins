import * as shell from 'mshell';
import { t } from './i18n';
import { CapturedItem, MenuContextInfo, adoptUnmanaged, applyProfile, captureMenu, classifyMenu, makeSnapshot, nodesFromSnapshot } from './plan';
import { defaultSettings, normalizeSettings } from './settings';
import { createStore } from './store';
import { MenuKind } from './types';
import { Icons, menuIcon } from './theme';
import { closeEditorWindow, isEditorOpen, openEditorWindow } from './window';

const helper = plugin({ name: '右键菜单编辑器', url: import.meta.url }, defaultSettings());
const CONFIG_FILE = helper.config_directory + 'config.json';
const E2E_MARKER = helper.config_directory + '.e2e';

const store = createStore(normalizeSettings(helper.config.all()), settings => {
    try {
        shell.fs.write(CONFIG_FILE, JSON.stringify(settings, null, 4));
    } catch (error) {
        helper.log('保存配置失败', error);
    }
});
const signatures: Partial<Record<MenuKind, string>> = {};

const clock = (at: number) => {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const captureStatus = (kind: MenuKind) => {
    const snapshot = store.get().snapshots[kind];
    if (!snapshot) return t('还没有采集到该类型的菜单', 'No menu of this type captured yet');
    return t(`已载入 ${clock(snapshot.at)} 采集的菜单 (${snapshot.items.length} 项)`, `Loaded the menu captured at ${clock(snapshot.at)} (${snapshot.items.length} items)`);
};

const openEditor = (kind: MenuKind) => {
    closeEditorWindow();
    openEditorWindow({
        settings: store.get(),
        initialKind: kind,
        status: captureStatus(kind),
        onProfile: store.updateProfile,
        subscribe: store.subscribe,
        onClosed: store.flush
    });
};

const toggleProfile = (kind: MenuKind) => {
    const profile = store.get().profiles[kind];
    const enabled = !profile.enabled;
    store.updateProfile(kind, { ...profile, enabled, updatedAt: Date.now() });
    if (store.get().logLevel !== 'off') helper.log(`${kind}: ${enabled ? 'enabled' : 'disabled'}`);
};

const importSnapshot = (kind: MenuKind) => {
    const snapshot = store.get().snapshots[kind];
    if (!snapshot) return;
    const profile = store.get().profiles[kind];
    const { nodes, added } = adoptUnmanaged(profile, snapshot);
    if (added === 0) return;
    store.updateProfile(kind, { ...profile, nodes, updatedAt: Date.now() });
};

const appendEntry = (ctx: shell.menu_info_basic_js, kind: MenuKind) => {
    const profile = store.get().profiles[kind];
    ctx.menu.append_item({
        type: 'button',
        name: entryName(),
        icon_svg: menuIcon(Icons.list),
        submenu: (sub: shell.menu_controller) => {
            sub.append_item({
                type: 'button',
                name: t('编辑这个菜单…', 'Edit this menu...'),
                icon_svg: menuIcon(Icons.pencil),
                action: () => {
                    ctx.menu.close();
                    openEditor(kind);
                }
            });
            sub.append_item({ type: 'spacer' });
            sub.append_item({
                type: 'button',
                name: profile.enabled
                    ? t('停用该类型的规则', 'Disable rules for this type')
                    : t('启用该类型的规则', 'Enable rules for this type'),
                icon_svg: menuIcon(profile.enabled ? Icons.ban : Icons.check),
                action: () => {
                    toggleProfile(kind);
                    ctx.menu.close();
                }
            });
            sub.append_item({
                type: 'button',
                name: t('把未纳入的原生项收进规则', 'Add unmanaged native items to the rules'),
                icon_svg: menuIcon(Icons.importFile),
                action: () => {
                    importSnapshot(kind);
                    ctx.menu.close();
                }
            });
        }
    });
};

const entryName = () => t('右键菜单编辑器', 'Context Menu Editor');

const signatureOf = (captured: CapturedItem[]) => captured.map(item => `${item.key}|${item.name}|${item.hasSubmenu ? 's' : ''}`).join('\n');

const recordSnapshot = (info: MenuContextInfo, captured: CapturedItem[]) => {
    const signature = signatureOf(captured);
    const settings = store.get();
    if (signatures[info.kind] === signature && settings.snapshots[info.kind]) return;
    signatures[info.kind] = signature;
    store.replace({ ...settings, snapshots: { ...settings.snapshots, [info.kind]: makeSnapshot(captured, info) } });
};

export const onMenu = (ctx: shell.menu_info_basic_js) => {
    const info = classifyMenu(ctx.context);
    const captured = captureMenu(ctx.menu);
    if (captured.length === 0) return;

    recordSnapshot(info, captured);

    const settings = store.get();
    const result = applyProfile(ctx.menu, settings.profiles[info.kind], info, captured);
    if (settings.logLevel === 'verbose') helper.log(`${info.kind}: ${result.reason} (native=${result.captured})`);

    if (settings.showMenuEntry) appendEntry(ctx, info.kind);
};

shell.menu_controller.add_menu_listener(onMenu);

helper.set_on_menu(menu => {
    menu.append_menu({
        name: t('右键菜单编辑器…', 'Context Menu Editor...'),
        action() {
            menu.close();
            openEditor('files');
        }
    });
});

if (shell.fs.exists(E2E_MARKER)) {
    (globalThis as Record<string, unknown>).__ctx_menu_editor = {
        settings: store.get,
        setSettings: store.replace,
        onMenu,
        openEditor,
        closeEditor: closeEditorWindow,
        isEditorOpen,
        captureMenu,
        classifyMenu,
        recordSnapshot,
        importSnapshot,
        nodesFromSnapshot,
        log: (message: string) => helper.log(String(message)),
        flush: store.save
    };
    helper.log('e2e hook enabled');
}

helper.log('loaded');

export {};
