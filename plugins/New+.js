// @name: New+
// @description: 根据模板创建文件/文件夹
// @author: leafmoes
// @version: 1.0.0
import * as shell from "mshell";

const { plugin } = globalThis;

const {
    i18n,
    config,
    config_directory,
    set_on_menu,
    log,
} = plugin({
    name: "New+",
    url: import.meta.url,
}, {
    hide_old_new_item: false,
    hide_template_file_prefix: true,
    hide_template_file_extensions: false,
    template_items_order: [],
});

config.read_config();

const ICON_CHECKED =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`;
const ICON_EMPTY =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`;
const ICON_ADD =
    `<svg t="1740912251331" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2470" width="32" height="32"><path d="M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z" fill="#5A98D2" p-id="2471"></path><path d="M739.555556 568.888889H284.444444c-34.133333 0-56.888889-22.755556-56.888888-56.888889s22.755556-56.888889 56.888888-56.888889h455.111112c34.133333 0 56.888889 22.755556 56.888888 56.888889s-22.755556 56.888889-56.888888 56.888889z" fill="#FFFFFF" p-id="2472"></path><path d="M512 796.444444c-34.133333 0-56.888889-22.755556-56.888889-56.888888V284.444444c0-34.133333 22.755556-56.888889 56.888889-56.888888s56.888889 22.755556 56.888889 56.888888v455.111112c0 34.133333-22.755556 56.888889-56.888889 56.888888z" fill="#FFFFFF" p-id="2473"></path></svg>`;
const ICON_OPEN_TEMPLATE =
    `<svg t="1740912347269" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3468" width="32" height="32"><path d="M938.666667 512a42.666667 42.666667 0 0 0-42.666667 42.666667v298.666666c0 23.573333-19.093333 42.666667-42.666667 42.666667H170.666667c-23.573333 0-42.666667-19.093333-42.666667-42.666667V170.666667c0-23.573333 19.093333-42.666667 42.666667-42.666667h298.666666a42.666667 42.666667 0 0 0 0-85.333333H170.666667C99.978667 42.666667 42.666667 99.978667 42.666667 170.666667v682.666666c0 70.688 57.312 128 128 128h682.666666c70.688 0 128-57.312 128-128V554.666667a42.666667 42.666667 0 0 0-42.666666-42.666667z m42.666666-426.666667v256a42.666667 42.666667 0 0 1-85.333333 0V188.330667l-349.557333 349.546666a42.666667 42.666667 0 0 1-60.32-60.330666L835.658667 128H682.666667a42.666667 42.666667 0 0 1 0-85.333333h256a42.666667 42.666667 0 0 1 42.666666 42.666666z" p-id="3469" fill="#1296db"></path></svg>`;

const PathUtils = {
    toWin32: (path) => path.replaceAll("/", "\\"),
    basename: (path) => path.split("\\").pop(),
    resolve: (...paths) => paths.join("/").replace(/\/+/g, "\\"),
};

const CONFIG_FILE_PATH = PathUtils.resolve(config_directory, "/config.json");

i18n.define("zh-CN", {
    "menu.originalNew": "新建",
    "menu.new": "新建+",
    "menu.open_template": "打开模板目录",
    "menu.hide_old_new_item": "在New+插件菜单隐藏旧的新建项目",
    "menu.hide_template_file_prefix": "隐藏模板文件名前缀符号(数字/空格/点)",
    "menu.hide_template_file_extensions": "隐藏模板文件名拓展名",
    "menu.template_items_order": "模板菜单项顺序配置",
});

i18n.define("en-US", {
    "menu.originalNew": "New",
    "menu.new": "New+",
    "menu.open_template": "Open Template Directory",
    "menu.hide_old_new_item":
        "Hide the legacy New Project item in the New+ plugin menu",
    "menu.hide_template_file_prefix":
        "Hide template filename prefix symbols (numbers, spaces, dots)",
    "menu.hide_template_file_extensions": "Hide template file extensions",
    "menu.template_items_order": "Template menu item order configuration",
});

i18n.define("ja-JP", {
    "menu.originalNew": "新規",
    "menu.new": "新規+",
    "menu.open_template": "テンプレートディレクトリを開く",
    "menu.hide_old_new_item":
        "New+プラグインのメニューから従来の新規プロジェクト項目を非表示にします",
    "menu.hide_template_file_prefix":
        "テンプレートファイル名の接頭辞記号を非表示（数字・スペース・ドット）",
    "menu.hide_template_file_extensions":
        "テンプレートファイルの拡張子を非表示",
    "menu.template_items_order": "テンプレートメニュー項目の順序設定",
});

const TemplateManager = {
    templateItems: [],
    getTemplateFolder() {
        return PathUtils.resolve(config_directory, "Template");
    },
    refresh() {
        try {
            const templatePath = this.getTemplateFolder();
            if (!shell.fs.exists(templatePath)) {
                shell.fs.mkdir(templatePath);
            }
            this.templateItems = shell.fs.readdir(templatePath).map((item) =>
                PathUtils.toWin32(item)
            );
        } catch (e) {
            log("模板加载失败:", e);
            this.templateItems = [];
        }
    },
};

const FilenameUtils = {
    parse(filename) {
        const lastDotIndex = filename.lastIndexOf(".");
        return lastDotIndex === -1 || lastDotIndex === 0
            ? { name: filename, extension: "" }
            : {
                name: filename.slice(0, lastDotIndex),
                extension: filename.slice(lastDotIndex + 1),
            };
    },
    formatDisplayName(templatePath) {
        const baseName = PathUtils.basename(templatePath);
        const { name, extension } = shell.fs.isdir(templatePath)
            ? { name: baseName, extension: "" }
            : this.parse(baseName);
        const displayName = config.get("hide_template_file_prefix")
            ? name.replace(/^[\d\s._-]+/g, "")
            : name;
        return !config.get("hide_template_file_extensions") && extension
            ? `${displayName}.${extension}`
            : displayName;
    },
};

const FileOperations = {
    createFromTemplate(targetDir, templatePath, callback) {
        shell.fs.copy_shfile(templatePath, targetDir, (ok, path) => {
            callback?.(ok, path);
        });
    },
    generateUniquePath(targetDir, baseName) {
        let counter = 1;
        let { name, extension } = FilenameUtils.parse(baseName);
        let candidate = extension ? `${name}.${extension}` : name;
        while (shell.fs.exists(PathUtils.resolve(targetDir, candidate))) {
            candidate = extension
                ? `${name} (${counter++}).${extension}`
                : `${name} (${counter++})`;
        }
        return PathUtils.resolve(targetDir, candidate);
    },
};

const MenuBuilder = {
    createTemplateSubmenu(sub, fv) {
        TemplateManager.refresh();
        const currentPath = fv.current_path;
        const orderedItems = TemplateManager.templateItems.sort((a, b) => {
            const configOrder = config.get("template_items_order");
            const nameA = PathUtils.basename(a).trim();
            const nameB = PathUtils.basename(b).trim();
            const indexA = configOrder.indexOf(nameA);
            const indexB = configOrder.indexOf(nameB);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return nameA.localeCompare(nameB);
        });
        orderedItems.forEach((templatePath) => {
            const displayName = FilenameUtils.formatDisplayName(templatePath);
            sub.append_menu({
                icon_bitmap: shell.win32.load_file_icon(
                    PathUtils.toWin32(templatePath),
                ),
                name: displayName,
                action: () => {
                    FileOperations.createFromTemplate(
                        currentPath,
                        templatePath,
                        async (ok, path) => {
                            if (ok) {
                                const sleep = (ms) =>
                                    new Promise((resolve) =>
                                        shell.infra.setTimeout(resolve, ms)
                                    );
                                while (1) {
                                    const target_item = fv.items().find(
                                        (item) => item.path() == path,
                                    );
                                    if (target_item) {
                                        fv.select_none();
                                        target_item.select(3);
                                        break;
                                    }
                                    await sleep(100);
                                }
                            } else {
                                log(`创建失败: 内部 Api 出错！`);
                            }
                        },
                    );
                    sub.close();
                },
            });
        });
        sub.append_menu({ type: "spacer" });
        sub.append_menu({
            name: i18n.t("menu.open_template"),
            icon_svg: ICON_OPEN_TEMPLATE,
            action: () => {
                shell.subproc.run_async(
                    `explorer.exe "${TemplateManager.getTemplateFolder()}"`,
                    () => {},
                );
            },
        });
        return sub;
    },
};

set_on_menu((m) => {
    const createToggleMenu = (name, key) => {
        const menuItem = m.append_menu({
            name,
            action() {
                config.set(key, !config.get(key));
                menuItem.set_data({
                    icon_svg: config.get(key) ? ICON_CHECKED : ICON_EMPTY,
                });
            },
            icon_svg: config.get(key) ? ICON_CHECKED : ICON_EMPTY,
        });
        return menuItem;
    };
    createToggleMenu(
        i18n.t("menu.hide_old_new_item"),
        "hide_old_new_item",
    );
    createToggleMenu(
        i18n.t("menu.hide_template_file_prefix"),
        "hide_template_file_prefix",
    );
    createToggleMenu(
        i18n.t("menu.hide_template_file_extensions"),
        "hide_template_file_extensions",
    );
    m.append_menu({
        name: i18n.t("menu.template_items_order"),
        action: () => {
            if (
                shell.fs.exists(CONFIG_FILE_PATH) &&
                !config.get("template_items_order").length
            ) {
                TemplateManager.refresh();
                config.set(
                    "template_items_order",
                    TemplateManager.templateItems.map(
                        (item) => PathUtils.basename(item),
                    ),
                );
                config.write_config();
            }

            shell.subproc.run_async(
                `cmd.exe /c start "" "${CONFIG_FILE_PATH}"`,
                () => {},
            );
        },
        icon_svg: ICON_OPEN_TEMPLATE,
    });
});

shell.menu_controller.add_menu_listener((ctx) => {
    const { folder_view: fv } = ctx.context;
    if (!fv) return;

    const originalNewMenu = ctx.menu.get_items().find((item) =>
        item.data().name == i18n.t("menu.originalNew")
    );

    if (originalNewMenu) {
        const originalNewMenuSub = originalNewMenu.data().submenu;
        originalNewMenu.set_data({
            name: i18n.t("menu.new"),
            icon_svg: ICON_ADD,
            submenu: (sub) => {
                if (!config.get("hide_old_new_item")) {
                    originalNewMenuSub?.(sub);
                    sub.append_menu({ type: "spacer" });
                }
                MenuBuilder.createTemplateSubmenu(sub, fv);
            },
        });
    }
});
