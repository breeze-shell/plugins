// @name: 插件图标主题色
// @description: 让部分插件添加的图标染上系统主题色 / Colorize icons added by other plugins with accent color
// @version: 0.0.3
// @author: Lukoning

import * as shell from "mshell"

const scriptsDir = `${shell.breeze.data_directory()}/scripts/`

const languages = {
    "en-US": {
        立即应用: "Apply now",
        主题色改变时自动应用: "Auto apply when accent color changes",
        在此选择需要修改图标的插件: "Select the plugin whose icons you want to colorize",
        "(高级)编辑需替换的颜色": "(Advanced) Edit the color you want to replace"
    },
    "ja-JP": {
        在此选择需要修改图标的插件: "ここでアイコンの変更が必要なプラグインを選択します",
    },
    "zh-CN": {
    },
};

const currentLang = Object.keys(languages).includes(
    shell.breeze.user_language()
)
    ? shell.breeze.user_language()
    : "en-US";

const t = (key) => {
    return languages[currentLang][key] || key;
};

// ---- CONFIG TEMPLATE ----
const CONFIG_FILE = 'accent-icons.json'
const PLUGIN_NAME = '插件图标主题色'
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`
const default_config = {
    autoApply: true,
    patchList: {},
    colorToReplace: {
        dark: "#4CC2FF",
        light: "#0078D4",
    },
    oldColor: {
        accent: "",
        colorization: "",
    },
    advanced: {
        plugins: {},
    },
}
let config = {};
const read_config = () => {
    const config_dir = shell.breeze.data_directory() + '/config/'
    shell.fs.mkdir(config_dir)
    if (shell.fs.exists(config_dir + CONFIG_FILE)) {
        try {
            config = JSON.parse(shell.fs.read(config_dir + CONFIG_FILE))
        } catch (e) {
            shell.println('配置文件解析失败', e, '\n', e.stack)
        }
    }
}

read_config()

const read_config_key = key => {
    const read = (keys, obj) => {
        if (keys.length === 1) {
            return obj[keys[0]]
        }
        if (!obj[keys[0]]) {
            return undefined
        }
        return read(keys.slice(1), obj[keys[0]])
    }

    return read(key.split('.'), config) ?? read(key.split('.'), default_config)
}

const write_config = () => {
    const config_dir = shell.breeze.data_directory() + '/config/'
    shell.fs.mkdir(config_dir)
    shell.fs.write(config_dir + CONFIG_FILE, JSON.stringify(config, null, 4))
}

const write_config_key = (key, value) => {
    read_config() //解决手动修改配置文件后写配置时，手动改的配置被缓存的旧配置覆盖的问题

    let obj = config

    const keys = key.split('.')
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) {
            obj[keys[i]] = {}
        }
        obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
    write_config()
}

on_plugin_menu[PLUGIN_NAME] = ((menu) => {
    read_config();
    const config_dir = shell.breeze.data_directory() + '/config/'
    const createToggleMenu = (menu, name, configKey, submenu) => {
        const menuItem = menu.append_menu({
            name,
            action() {
                try {
                    write_config_key(configKey, !read_config_key(configKey))
                    menuItem.set_data({
                        icon_svg: read_config_key(configKey) ? ICON_CHECKED : ICON_EMPTY
                    })
                } catch (e) {
                    shell.println(e, e.stack)
                }
            },
            icon_svg: read_config_key(configKey) ? ICON_CHECKED : ICON_EMPTY,
            submenu
        })
        return menuItem
    }

    async function editColorToReplace(key="colorToReplace") {
        if (key) {
            write_config_key(`${key}.dark`, read_config_key(`${key}.dark`) ?? read_config_key("colorToReplace.dark"));
            write_config_key(`${key}.light`, read_config_key(`${key}.light`) ?? read_config_key("colorToReplace.light"));
        }
        shell.subproc.run(`cmd /c ${config_dir+CONFIG_FILE}`);
    }

    menu.append_menu({
        name: t("立即应用"),
        action() {applyNow(); menuctx.menu.close()}
    })
    createToggleMenu(menu, t("主题色改变时自动应用"), "autoApply")
    menu.append_menu({
        name: t("(高级)编辑需替换的颜色"),
        action: ()=>{
            menuctx.menu.close();
            editColorToReplace();
        }
    })
    menu.append_spacer();
    menu.append_menu({
        name: t("在此选择需要修改图标的插件"),
        disabled: true
    })
    const pluginFiles = shell.fs.readdir(scriptsDir);
    for (let i=0; i<pluginFiles.length; i++) {
        const nameWithExt = pluginFiles[i].replace(scriptsDir, "")
        , name = nameWithExt.replace(".js", "")
        , nameConfig = name.replaceAll(".", "&#46");
        if (nameWithExt.substring(nameWithExt.lastIndexOf(".")+1)!="js" || name==PLUGIN_NAME) {continue}
        createToggleMenu(menu, name, `patchList.${nameConfig}`,
            (submenu)=>{
                submenu.append_menu({
                    name: t("(高级)编辑需替换的颜色"),
                    action: ()=>{
                        menuctx.menu.close();
                        editColorToReplace(`advanced.plugins.${nameConfig}.colorToReplace`);
                    }
                })
            }
        )
    }
})

// ---- CONFIG TEMPLATE ----

const REG = {
    path: "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\DWM",
    accent: "AccentColor", //弃用。这个注册表值更新不及时（系统内表现为窗口标题栏和边框上显示的主题色不正确）
    colorization: "ColorizationColor"
};

let menuctx

function compareVersions(v1, v2) { //新版, 旧版
    let arr1 = v1.split(".");
    let arr2 = v2.split(".");
    for (let i=0; i<Math.max(arr1.length, arr2.length); i++) {
        let num1 = parseInt(arr1[i] || 0);
        let num2 = parseInt(arr2[i] || 0);
        if (num1 < num2) {
            return -1;
        } else if (num1 > num2) {
            return 1;
        }
    }
    return 0;
}

function getVersionFromContent(content) {
    const keyword = "// @version:";
    const startIndex = content.indexOf(keyword);
    if (startIndex == -1) {return null};

    const versionStart = startIndex + keyword.length;
    const nextNewline = content.indexOf('\n', versionStart);
    const endIndex = nextNewline == -1 ? content.length : nextNewline;

    const rawVersion = content.substring(versionStart, endIndex).trim();
    return rawVersion
}

function applyAccentColor(color) {
    const patchList = read_config_key("patchList")
    const patchListKeys = Object.keys(patchList)
    let namesConfig = new Array();
    for (let i=0; i<patchListKeys.length; i++) {
        if (patchList[`${patchListKeys[i]}`]) {namesConfig.push(patchListKeys[i])}
    }
    if (namesConfig.length == 0) {return}
    for (let i=0; i<namesConfig.length; i++) {
        const file = scriptsDir + namesConfig[i].replaceAll("&#46", ".") + ".js";
        const fileBackup = file+".accent-icons-backup";
        let text = "", textBackup = "";
        if (shell.fs.exists(file)) {text = shell.fs.read(file)} else {continue;} 
        if (shell.fs.exists(fileBackup)) {
            textBackup = shell.fs.read(fileBackup);
            if (compareVersions(getVersionFromContent(text), getVersionFromContent(textBackup)) != 0) {
                textBackup = text
                shell.fs.write(fileBackup, text);
            }
        } else {
            textBackup = text
            shell.fs.write(fileBackup, text);
        }
        const key = `advanced.plugins.${namesConfig[i]}.colorToReplace`;
        shell.fs.write(file, textBackup
            .replaceAll(read_config_key(`${key}.dark`) ?? read_config_key("colorToReplace.dark"), color.colorization)
            .replaceAll(read_config_key(`${key}.light`) ?? read_config_key("colorToReplace.light"), color.colorization)
        );
    }
}

async function applyNow(isAuto=false) {
    function bgrToRgb(hex) {
        return hex.slice(4, 6) + hex.slice(2, 4) + hex.slice(0, 2)
    }
    try {
        shell.subproc.run_async(`reg query "${REG.path}" /v "${REG.colorization}"`, back=>{
            const out = back.out
            const colorization = out.substr(out.lastIndexOf("0x")+4, 6);
            const color = {
                //accent: `#${bgrToRgb(accent)}`,
                colorization: `#${colorization}`
            };
            if (isAuto && color.colorization == read_config_key("oldColor.colorization")) {return}
            write_config_key("oldColor.colorization", color.colorization)
            applyAccentColor(color)
        })
        //const colorizationOut = shell.subproc.run_async(`reg query "${REG.path}" /v "${REG.colorization}"`).out;
        //const colorization = colorizationOut.substr(colorizationOut.lastIndexOf("0x")+4, 6);
    } catch (error) {
        shell.println("获取注册表颜色失败:", error);
        return null;
    }
}

shell.menu_controller.add_menu_listener(ctx => {
    menuctx = ctx
    if (read_config_key("autoApply")) {applyNow(true)}
})