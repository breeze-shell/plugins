import * as shell from 'mshell';
import { t } from './i18n';
import { CapturedItem, MenuContextInfo, applyProfile, captureMenu, classifyMenu, makeSnapshot, nodesFromSnapshot } from './plan';
import { defaultSettings, normalizeSettings } from './settings';
import { MenuKind, Settings } from './types';
import { Icons } from './theme';
import { closeEditorWindow, isEditorOpen, openEditorWindow } from './window';

const helper = plugin({ name: 'context-menu-editor', url: import.meta.url }, defaultSettings());
const CONFIG_FILE = helper.config_directory + 'config.json';
const E2E_MARKER = helper.config_directory + '.e2e';

let settings: Settings = normalizeSettings(helper.config.all());
let saveTimer: number | null = null;
const signatures: Partial<Record<MenuKind, string>> = {};

const persist = () => {
    if (saveTimer !== null) shell.infra.clearTimeout(saveTimer);
    saveTimer = shell.infra.setTimeout(() => {
        saveTimer = null;
        try {
            shell.fs.write(CONFIG_FILE, JSON.stringify(settings, null, 4));
        } catch (error) {
            helper.log('保存配置失败', error);
        }
    }, 400);
};

const updateSettings = (next: Settings) => {
    settings = next;
    persist();
};

const clock = (at: number) => {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const captureStatus = (kind: MenuKind) => {
    const snapshot = settings.snapshots[kind];
    if (!snapshot) return t('还没有采集到该类型的菜单', 'No menu of this type captured yet');
    return t(`已载入 ${clock(snapshot.at)} 采集的菜单 (${snapshot.items.length} 项)`, `Loaded the menu captured at ${clock(snapshot.at)} (${snapshot.items.length} items)`);
};

const openEditor = (kind: MenuKind) => {
    closeEditorWindow();
    openEditorWindow({
        settings,
        initialKind: kind,
        status: captureStatus(kind),
        onSettings: updateSettings
    });
};

const toggleProfile = (kind: MenuKind) => {
    const profile = settings.profiles[kind];
    const enabled = !profile.enabled;
    settings = { ...settings, profiles: { ...settings.profiles, [kind]: { ...profile, enabled, updatedAt: Date.now() } } };
    persist();
    if (settings.logLevel !== 'off') helper.log(`${kind}: ${enabled ? 'enabled' : 'disabled'}`);
};

const importSnapshot = (kind: MenuKind) => {
    const snapshot = settings.snapshots[kind];
    if (!snapshot) return;
    const nodes = nodesFromSnapshot(snapshot);
    const profile = settings.profiles[kind];
    settings = {
        ...settings,
        profiles: { ...settings.profiles, [kind]: { ...profile, nodes, updatedAt: Date.now() } }
    };
    persist();
};

const appendEntry = (ctx: shell.menu_info_basic_js, kind: MenuKind) => {
    const profile = settings.profiles[kind];
    ctx.menu.append_item({
        type: 'button',
        name: t('右键菜单编辑器', 'Context Menu Editor'),
        icon_svg: Icons.list,
        submenu: (sub: shell.menu_controller) => {
            sub.append_item({
                type: 'button',
                name: t('编辑这个菜单…', 'Edit this menu...'),
                icon_svg: Icons.pencil,
                action: () => {
                    ctx.menu.close();
                    openEditor(kind);
                }
            });
            sub.append_item({
                type: 'button',
                name: t('打开编辑器', 'Open the editor'),
                icon_svg: Icons.sliders,
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
                icon_svg: profile.enabled ? Icons.ban : Icons.check,
                action: () => {
                    toggleProfile(kind);
                    ctx.menu.close();
                }
            });
            sub.append_item({
                type: 'button',
                name: t('把当前菜单导入为规则', 'Import this menu into the rules'),
                icon_svg: Icons.importFile,
                action: () => {
                    importSnapshot(kind);
                    ctx.menu.close();
                }
            });
        }
    });
};

const signatureOf = (captured: CapturedItem[]) => captured.map(item => `${item.key}|${item.name}|${item.hasSubmenu ? 's' : ''}`).join('\n');

const recordSnapshot = (info: MenuContextInfo, captured: CapturedItem[]) => {
    const signature = signatureOf(captured);
    if (signatures[info.kind] === signature && settings.snapshots[info.kind]) return;
    signatures[info.kind] = signature;
    settings = { ...settings, snapshots: { ...settings.snapshots, [info.kind]: makeSnapshot(captured, info) } };
    persist();
};

export const onMenu = (ctx: shell.menu_info_basic_js) => {
    const info = classifyMenu(ctx.context);
    const captured = captureMenu(ctx.menu);
    if (captured.length === 0) return;

    recordSnapshot(info, captured);

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
        settings: () => settings,
        setSettings: updateSettings,
        onMenu,
        openEditor,
        closeEditor: closeEditorWindow,
        isEditorOpen,
        captureMenu,
        classifyMenu,
        recordSnapshot,
        importSnapshot,
        nodesFromSnapshot,
        flush: () => {
            if (saveTimer !== null) shell.infra.clearTimeout(saveTimer);
            saveTimer = null;
            shell.fs.write(CONFIG_FILE, JSON.stringify(settings, null, 4));
        }
    };
    helper.log('e2e hook enabled');
}

helper.log('loaded');

export {};
