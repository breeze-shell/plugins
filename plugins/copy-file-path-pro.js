// @name: 复制文件路径 Pro
// @description: 复制文件路径，文件名，拓展名，多个文件路径...
// @author: MicroBlock
// @version: 0.0.1

import * as shell from 'mshell'

// ---- CONFIG TEMPLATE ----
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`
const CONFIG_FILE = 'copy-file-path-pro.json'
const PLUGIN_NAME = '复制文件路径 Pro'
const default_config = {
    multifile: {
        fullpath: true,
        filename: true,
        ext: false,
        winpath: false,

        enable: true,
        copyall_split: '\n',
    },
    singlefile: {
        fullpath: true,
        filename: true,
        ext: false,
        winpath: true,

        enable: true,
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

    createToggleMenu(menu, '选中多个文件时启用', 'multifile.enable', (sub) => {
        createToggleMenu(sub, '文件路径', 'multifile.fullpath')
        createToggleMenu(sub, '文件名', 'multifile.filename')
        createToggleMenu(sub, '拓展名', 'multifile.ext')
        createToggleMenu(sub, 'Windows 路径', 'multifile.winpath')
        sub.append_menu({
            type: 'spacer',
        })

        const spliters = {
            '\n': '换行',
            ',': '英文/半角逗号',
            ';': '英文/半角分号',
            ' ': '空格',
            '、': '、',
            '，': '中文/全角逗号',
            '；': '中文/全角分号',
        }
        const spliter = sub.append_menu({
            name:
                '多个文件路径分隔符: ' +
                spliters[read_config_key('multifile.copyall_split')],
            action() {
                const keys = Object.keys(spliters)
                write_config_key(
                    'multifile.copyall_split',
                    keys[
                        (keys.indexOf(
                            read_config_key('multifile.copyall_split')
                        ) +
                            1) %
                            keys.length
                    ]
                )
                spliter.set_data({
                    name:
                        '多个文件路径分隔符: ' +
                        spliters[read_config_key('multifile.copyall_split')],
                })
            },
        })
    })

    createToggleMenu(menu, '选中单个文件时启用', 'singlefile.enable', (sub) => {
        createToggleMenu(sub, '文件路径', 'singlefile.fullpath')
        createToggleMenu(sub, '文件名', 'singlefile.filename')
        createToggleMenu(sub, '拓展名', 'singlefile.ext')
        createToggleMenu(sub, 'Windows 路径', 'singlefile.winpath')
    })
}

// ---- CONFIG TEMPLATE ----

// fullpath/filename/ext/winpath
let copy_type = 'fullpath'
shell.menu_controller.add_menu_listener((ctx) => {
    if (ctx.context.folder_view) {
        const fv = ctx.context.folder_view
        const selectedPaths = fv.selected_files

        const updateMenusAsClipboard = (menus, items, start = 0) => {
            for (let i = 0; i < items.length; i++)
                menus.get_item(i + start).set_data({
                    name: items[i],
                    action() {
                        shell.clipboard.set_text(items[i])
                        ctx.menu.close()
                    },
                })
        }

        const parsePath = (path) => {
            const filename = path.replaceAll('\\', '/').split('/').pop()
            const ext = filename.split('.').pop()
            const winpath = '"' + path.replaceAll('\\', '\\\\') + '"'
            return {
                filename,
                ext,
                fullpath: path,
                winpath,
            }
        }

        if (selectedPaths.length === 0) {
            return
        }
        const items = ctx.menu.get_items()
        let target = items.findIndex((v) => v.data().name === '复制文件地址')

        let menu
        if (target === -1) {
            target = items.findIndex((v) => v.data().name === '剪切') - 1
            menu = ctx.menu.append_menu_after({}, target)
        } else {
            menu = ctx.menu.get_item(target)
        }

        if (selectedPaths.length === 1) {
            const path = parsePath(selectedPaths[0])

            menu.set_data({
                name: `${path.filename}`,
                action() {
                    shell.clipboard.set_text(path.filename)
                    ctx.menu.close()
                },
                submenu(sub) {
                    for (const key in path) {
                        if (read_config_key(`singlefile.${key}`)) {
                            sub.append_menu({
                                name: path[key],
                                action() {
                                    shell.clipboard.set_text(path[key])
                                },
                            })
                        }
                    }
                },
            })
        } else if (selectedPaths.length > 1) {
            menu.set_data({
                name: '多个文件路径...',
                action() {
                    shell.clipboard.set_text(
                        selectedPaths.join(
                            read_config_key('multifile.copyall_split')
                        )
                    )
                    ctx.menu.close()
                },
                submenu(sub) {
                    const upd = () =>
                        updateMenusAsClipboard(
                            sub,
                            selectedPaths.map((v) => parsePath(v)[copy_type]),
                            2
                        )
                    const roll = [
                        'fullpath',
                        'filename',
                        'ext',
                        'winpath',
                    ].filter((v) => read_config_key(`multifile.${v}`))
                    const typenames = {
                        fullpath: '文件路径',
                        filename: '文件名',
                        ext: '拓展名',
                        winpath: 'Windows 路径',
                    }
                    const changeType = sub.append_menu({
                        name: typenames[copy_type],
                        action() {
                            copy_type =
                                roll[
                                    (roll.indexOf(copy_type) + 1) % roll.length
                                ]
                            changeType.set_data({
                                name: typenames[copy_type],
                            })
                            upd()
                        },
                    })

                    sub.append_menu({
                        name: '复制全部',
                        action() {
                            shell.clipboard.set_text(
                                selectedPaths
                                    .map((v) => parsePath(v)[copy_type])
                                    .join(
                                        read_config_key(
                                            'multifile.copyall_split'
                                        )
                                    )
                            )
                            ctx.menu.close()
                        },
                    })

                    for (let i = 0; i < selectedPaths.length; i++) {
                        sub.append_menu({
                            name: '',
                        })
                    }
                    upd()
                },
            })
        }
    }
})
