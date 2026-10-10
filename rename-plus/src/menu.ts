import * as shell from 'mshell';
import { t } from './i18n';
import { RenameItem } from './model';
import { findPreset } from './presets';
import { Plan, buildPlan } from './plan';
import { AppSettings } from './settings';
import { Icons } from './theme';

export type MenuAction = {
    openWindow: (items: RenameItem[], presetId: string) => void;
    quickApply: (items: RenameItem[], presetId: string) => void;
    undo: () => boolean;
    canUndo: () => boolean;
    lastBatchSize: () => number;
};

export type MenuEntry = {
    name: string;
    icon_svg?: string;
    disabled?: boolean;
    action?: () => void;
    submenu?: (menu: MenuLike) => void;
};

// menu_controller 里本插件用到的那部分, 抽出来方便在 node 里做测试替身。
export type MenuLike = {
    append_menu(entry: MenuEntry): unknown;
    append_menu_after(entry: MenuEntry, afterIndex: number): unknown;
    append_spacer(): void;
    close(): void;
    items?: { data(): { name?: string; origin_name?: string } | undefined }[];
};

export const PRESET_IDS = ['numbering', 'replace', 'affix', 'case', 'trim', 'cleanup', 'dateTime', 'extension'];

export const decorateIcon = (svg: string) =>
    svg.replace('<svg ', `<svg fill="${shell.breeze.is_light_theme() ? '#202020' : '#E9E9E9'}" `);

export const planFor = (
    items: RenameItem[],
    presetId: string,
    params: AppSettings['params'],
    settings: Pick<AppSettings, 'keepExt' | 'order'>,
    checkExisting: boolean
): Plan =>
    buildPlan(items, findPreset(presetId), params[presetId] ?? findPreset(presetId).defaults, {
        keepExt: settings.keepExt,
        order: settings.order,
        now: new Date(),
        checkExisting
    });

const previewText = (plan: Plan) => {
    const first = plan.changed[0];
    if (!first) return '';
    const skipped = plan.errors.length > 0 ? t(`（跳过 ${plan.errors.length} 项）`, ` (${plan.errors.length} skipped)`) : '';
    return `→ ${first.newName}${skipped}`;
};

export const renameMenuEntry = (items: RenameItem[], settings: AppSettings, actions: MenuAction): MenuEntry => {
    const single = items.length === 1;
    return {
        name: single ? t('重命名 Plus', 'Rename Plus') : t(`重命名 Plus（${items.length} 项）`, `Rename Plus (${items.length})`),
        icon_svg: decorateIcon(Icons.rename),
        submenu(menu: MenuLike) {
            menu.append_menu({
                name: single
                    ? t('重命名…（打开窗口）', 'Rename... (open window)')
                    : t(`批量重命名…（${items.length} 项）`, `Batch rename... (${items.length} items)`),
                icon_svg: decorateIcon(Icons.rename),
                action: () => actions.openWindow(items, single ? 'manual' : settings.lastPreset)
            });

            menu.append_spacer();

            menu.append_menu({
                name: t('常用预设', 'Presets'),
                icon_svg: decorateIcon(Icons.magic),
                submenu(presets: MenuLike) {
                    for (const presetId of PRESET_IDS) {
                        const preset = findPreset(presetId);
                        const plan = planFor(items, presetId, settings.params, settings, false);
                        const hint = previewText(plan);
                        presets.append_menu({
                            name: hint ? `${preset.title}  ${hint}` : preset.title,
                            icon_svg: decorateIcon(preset.icon),
                            disabled: plan.changed.length === 0,
                            action: () => {
                                presets.close();
                                actions.quickApply(items, presetId);
                            }
                        });
                    }

                    presets.append_spacer();
                    presets.append_menu({
                        name: t('在窗口中细调…', 'Fine-tune in window...'),
                        icon_svg: decorateIcon(Icons.settings),
                        action: () => actions.openWindow(items, settings.lastPreset)
                    });
                }
            });

            menu.append_spacer();

            const undoable = actions.canUndo();
            const count = actions.lastBatchSize();
            menu.append_menu({
                name: undoable
                    ? t(`撤销上次重命名（${count} 项）`, `Undo last rename (${count})`)
                    : t('撤销上次重命名', 'Undo last rename'),
                icon_svg: decorateIcon(Icons.undo),
                disabled: !undoable,
                action: () => {
                    menu.close();
                    actions.undo();
                }
            });
        }
    };
};

// 想让插件出现在原生「重命名」旁边, 找不到就排在末尾。
export const attachRenameMenu = (menu: MenuLike, items: RenameItem[], settings: AppSettings, actions: MenuAction) => {
    const entry = renameMenuEntry(items, settings, actions);
    const siblings = menu.items ?? [];
    const index = siblings.findIndex(item => {
        const data = item.data();
        const name = data?.name ?? '';
        return name === '重命名' || name === 'Rename' || data?.origin_name === '重命名';
    });
    if (index >= 0) menu.append_menu_after(entry, index);
    else menu.append_menu(entry);
    return entry;
};
