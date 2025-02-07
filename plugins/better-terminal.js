// @name: better-terminal
// @description: 增加管理员方式打开终端
// @author: Enlysure
// @version: 0.0.1

import * as shell from 'mshell'
const CONFIG_FILE = 'better-terminal.json'
const PLUGIN_NAME = 'better-terminal'
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`

const languages = {
    'en-US': {
        '以Cmd打开': 'Open as Cmd',
        '以PS打开': 'Open as PowerShell',
        '使用新版 Terminal': 'Use new Terminal',
        '以管理员打开': 'Open as admin',
        '禁用原本的终端打开方式': 'Disable original terminal open method',
    }, 'zh-CN': {
    }
}

const currentLang = shell.breeze.user_language() === 'zh-CN' ? 'zh-CN' : 'en-US'

const t = (key) => {
    return languages[currentLang][key] || key
}



const default_config = {
    terminal: {
        wt: true,
        admin: true,
        disableOriginal: false,
    },
}
let config = {}
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

const read_config_key = (key) => {
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

on_plugin_menu[PLUGIN_NAME] = (menu) => {
    const createToggleMenu = (menu, name, configKey, submenu) => {
        const menuItem = menu.append_menu({
            name,
            action() {
                try {
                    write_config_key(configKey, !read_config_key(configKey))
                    menuItem.set_data({
                        icon_svg: read_config_key(configKey)
                            ? ICON_CHECKED
                            : ICON_EMPTY,
                    })
                } catch (e) {
                    shell.println(e, e.stack)
                }
            },
            icon_svg: read_config_key(configKey) ? ICON_CHECKED : ICON_EMPTY,
            submenu,
        })
        return menuItem
    }

    createToggleMenu(menu, t('使用新版 Terminal'), 'terminal.wt')
    createToggleMenu(menu, t('以管理员打开'), 'terminal.admin')
    createToggleMenu(menu, t('禁用原本的终端打开方式'), 'terminal.disableOriginal')
}

const PS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#E0DFDF" d="M1.437 11.696 2.467 5h11.989l-.55 3.574.93.531.715-4.649A3 3 0 0 0 12.586 1H4.645A3 3 0 0 0 1.68 3.544l-1.231 8A3 3 0 0 0 3.414 15h3.364a2.323 2.323 0 0 1-.028-.361V14H3.414a2 2 0 0 1-1.977-2.304ZM4.645 2h7.94a2 2 0 0 1 2.001 2H2.621l.047-.304A2 2 0 0 1 4.645 2Z"/>
    <path fill="#4CC2FF" d="M9.496 7.493A1 1 0 0 0 8 8.362v6.276a1 1 0 0 0 1.496.869l5.492-3.139a1 1 0 0 0 0-1.736L9.496 7.493Z"/>
  </svg>
  `

shell.menu_controller.add_menu_listener((ctx) => {
    const fv = ctx.context.folder_view
    const current_path = fv.current_path
    const selectedPaths = fv.selected_files

    if (read_config_key('terminal.disableOriginal')) {
        const items = ctx.menu.get_items();
        const ori = "在终端中打开";
        const ori_menu = items.find((v) => v.data().name === ori);
        if (ori_menu) {
            ori_menu.remove();
        }
    }

    if (selectedPaths.length === 0 || selectedPaths.length === 1) { // 空白位置或选中一个文件
        const items = ctx.menu.get_items();
        let targetIndex = items.findIndex((v) => v.data().name === '复制') + 1;
        if (targetIndex === 0) {
            targetIndex = items.findIndex((v) => v.data().name === '新建') + 1;
        }

        shell.println(current_path);
        const runCommand = async (command) => {
            try {
                await shell.subproc.run(command);
            } catch (error) {
                shell.println("执行命令时出错:", error);
            } finally {
                ctx.menu.close();
            }
        };

        function appendMenuButton(type, nameSuffix, command, targetIndex) {
            ctx.menu.append_menu_after({
                type: "button",
                name: t(`以${type}打开`) + nameSuffix,
                icon_svg: PS_ICON,
                action: () => runCommand(command),
            }, targetIndex);
        }

        const isAdmin = read_config_key('terminal.admin');
        const isWT = read_config_key('terminal.wt');
        const nameSuffix = isAdmin ? (isWT ? "(A T)" : "(A)") : (isWT ? "(T)" : "");

        if (isAdmin) {
            if (isWT) {
                appendMenuButton("PS", nameSuffix, `powershell -Command "Start-Process wt.exe -ArgumentList 'powershell -NoExit -Command \\"Set-Location ''${current_path}''\\"' -Verb RunAs"`, targetIndex);
                appendMenuButton("Cmd", nameSuffix, `powershell -Command "Start-Process wt.exe -ArgumentList '-d \\"${current_path}\\" cmd.exe' -Verb RunAs"`, targetIndex);
            } else {
                appendMenuButton("PS", nameSuffix, `powershell -Command "Start-Process powershell -ArgumentList '-NoExit -Command \\"Set-Location ''${current_path}''\\"' -Verb RunAs"`, targetIndex);
                appendMenuButton("Cmd", nameSuffix, `powershell -Command "Start-Process cmd -ArgumentList '/k cd /d ${current_path}' -Verb RunAs"`, targetIndex);
            }
        } else {
            if (isWT) {
                appendMenuButton("PS", nameSuffix, `wt.exe powershell -NoExit -Command "Set-Location '${current_path}'"`, targetIndex);
                appendMenuButton("Cmd", nameSuffix, `wt.exe -d "${current_path}" cmd.exe`, targetIndex);
            } else {
                appendMenuButton("PS", nameSuffix, `Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '${current_path}'"`, targetIndex);
                appendMenuButton("Cmd", nameSuffix, `powershell -Command "Start-Process cmd.exe -ArgumentList '/k','cd /d ${current_path}'"`, targetIndex);
            }
        }

    } else {
        // 选中了多个文件
        return
    }

});