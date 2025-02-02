// @name: Copy As Path Pro
// @description: Copy file path, file name, extension, multiple file paths...
// @author: MicroBlock
// @version: 0.0.1

import * as shell from "mshell"
shell.println(shell.breeze.user_language())
// ---- CONFIG TEMPLATE ----
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`
const CONFIG_FILE = "copy-file-path-pro.json"
const PLUGIN_NAME = "Copy As Path Pro"
const default_config = {
    multifile: {
        fullpath: true,
        filename: true,
        ext: false,
        winpath: false,

        enable: true,
        copyall_split: '\n'
    },
    singlefile: {
        fullpath: true,
        filename: true,
        ext: false,
        winpath: true,

        enable: true
    }
}
let config = {};
const read_config = () => {
    const config_dir = shell.breeze.data_directory() + '/config/'
    shell.fs.mkdir(config_dir)
    if (shell.fs.exists(config_dir + CONFIG_FILE)) {
        try {
            config = JSON.parse(shell.fs.read(config_dir + CONFIG_FILE))
        } catch (e) {
            shell.println('Failed to parse configuration file', e, '\n', e.stack)
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

    createToggleMenu(menu, 'Enable when multiple files are selected', 'multifile.enable', sub => {
        createToggleMenu(sub, 'File path', 'multifile.fullpath')
        createToggleMenu(sub, 'File name', 'multifile.filename')
        createToggleMenu(sub, 'Extension', 'multifile.ext')
        createToggleMenu(sub, 'Windows path', 'multifile.winpath')
        sub.append_menu({
            type: 'spacer'
        })

        const spliters = {
            '\n': 'Newline',
            ',': 'Comma',
            ';': 'Semicolon',
            ' ': 'Space',
        }
        const spliter = sub.append_menu({
            name: 'Multiple file path separator: ' + spliters[read_config_key('multifile.copyall_split')],
            action() {
                const keys = Object.keys(spliters)
                write_config_key('multifile.copyall_split', keys[(keys.indexOf(read_config_key('multifile.copyall_split')) + 1) % keys.length])
                spliter.set_data({
                    name: 'Multiple file path separator: ' + spliters[read_config_key('multifile.copyall_split')]
                })
            }
        })
    })

    createToggleMenu(menu, 'Enable when a single file is selected', 'singlefile.enable', sub => {
        createToggleMenu(sub, 'File path', 'singlefile.fullpath')
        createToggleMenu(sub, 'File name', 'singlefile.filename')
        createToggleMenu(sub, 'Extension', 'singlefile.ext')
        createToggleMenu(sub, 'Windows path', 'singlefile.winpath')
    })
})

// ---- CONFIG TEMPLATE ----

// fullpath/filename/ext/winpath
let copy_type = 'fullpath'
shell.menu_controller.add_menu_listener(ctx => {
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
                    }
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
                winpath
            }
        }

        if (selectedPaths.length === 0) {
            return
        }
        const items = ctx.menu.get_items()
        let target = items.findIndex(v => v.data().name === 'Copy file address')

        let menu;
        if (target === -1) {
            target = items.findIndex(v => v.data().name === 'Cut') - 1
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
                                }
                            })
                        }
                    }
                }
            })
        } else if (selectedPaths.length > 1) {
            menu.set_data({
                name: 'Multiple file paths...',
                action() {
                    shell.clipboard.set_text(selectedPaths.join(read_config_key('multifile.copyall_split')))
                    ctx.menu.close()
                },
                submenu(sub) {
                    const upd = () => updateMenusAsClipboard(sub, selectedPaths.map(v =>
                        parsePath(v)[copy_type]
                    ), 2)
                    const roll = ['fullpath', 'filename', 'ext', 'winpath'].filter(
                        v => read_config_key(`multifile.${v}`)
                    )
                    const typenames = {
                        fullpath: 'File path',
                        filename: 'File name',
                        ext: 'Extension',
                        winpath: 'Windows path'
                    }
                    const changeType = sub.append_menu({
                        name: typenames[copy_type],
                        action() {
                            copy_type = roll[(roll.indexOf(copy_type) + 1) % roll.length]
                            changeType.set_data({
                                name: typenames[copy_type]
                            })
                            upd()
                        }
                    })

                    sub.append_menu({
                        name: 'Copy all',
                        action() {
                            shell.clipboard.set_text(selectedPaths.map(v =>
                                parsePath(v)[copy_type]
                            ).join(read_config_key('multifile.copyall_split')))
                            ctx.menu.close()
                        }
                    })

                    for (let i = 0; i < selectedPaths.length; i++) {
                        sub.append_menu({
                            name: ''
                        })
                    }
                    upd()
                }
            })
        }
    }
})
