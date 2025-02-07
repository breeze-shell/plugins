// @name: 右键菜单清理 - Context Menu Cleaner
// @description: 多功能、可配置的右键菜单清理工具 / A versatile and configurable context menu cleaner
// @author: MicroBlock
// @version: 0.0.8

import * as shell from 'mshell'
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`

const languages = {
    'en-US': {
        '合并 "用...打开"': 'Merge "Open with"',
        '不合并使用 Code 打开': 'Do not merge open with Code',
        不合并在终端中打开: 'Do not merge open in terminal',
        合并视图操作: 'Merge view operation',
        合并不常用菜单: 'Merge uncommon menu',
        不合并使用: 'Do not merge open with',
        打开方式: 'Open with',
        视图操作: 'View operation',
        不常用: 'Uncommon',
        右键菜单清理: 'Context Menu Cleaner',
    },
    'ja-JP': {
        '合并 "用...打开"': '「プログラムから開く」をマージ',
        '不合并使用 Code 打开': '「Code で聞く」をマージしない',
        不合并在终端中打开: '「Windows ターミナルで聞く」をマージしない',
        合并视图操作: 'ビュー操作をマージ',
        合并不常用菜单: '他のメニューをマージ',
        不合并使用: '「プログラムから開く」をマージしない',
        打开方式: 'プログラムから開く',
        视图操作: 'ビュー操作',
        不常用: '他のメニュー',
        右键菜单清理: 'コンテキスト メニュー クリーナー',
    },
    'zh-CN': {},
}

const currentLang = Object.keys(languages).includes(
    shell.breeze.user_language(),
)
    ? shell.breeze.user_language()
    : 'en-US'
const t = (key) => {
    return languages[currentLang][key] || key
}

const config_name = 'contextmenu-cleaner.json'
const default_config = {
    merge: {
        open_with: true,
        view_operation: true,
        uncommon: true,
    },
}
let config = {}
const read_config = () => {
    const config_dir = shell.breeze.data_directory() + '/config/'
    shell.fs.mkdir(config_dir)
    if (shell.fs.exists(config_dir + config_name)) {
        try {
            config = JSON.parse(shell.fs.read(config_dir + config_name))
        } catch (e) {
            shell.println('[右键菜单清理] 配置文件解析失败', e)
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
    shell.fs.write(config_dir + config_name, JSON.stringify(config, null, 4))
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

on_plugin_menu['右键菜单清理 - Context Menu Cleaner'] = (menu) => {
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

    createToggleMenu(
        menu,
        t('合并 "用...打开"'),
        'merge.open_with',
        (submenu) => {
            createToggleMenu(
                submenu,
                t('不合并使用 Code 打开'),
                'merge.open_with_allow.code',
            )
            createToggleMenu(
                submenu,
                t('不合并在终端中打开'),
                'merge.open_with_allow.terminal',
            )
        },
    )
    createToggleMenu(menu, t('合并视图操作'), 'merge.view_operation')
    createToggleMenu(menu, t('合并不常用菜单'), 'merge.uncommon')
}

shell.menu_controller.add_menu_listener((ctx) => {
    try {
        const mergedMenus = []
        const mergeMenuItems = (menuItems, newMenuName) => {
            const items = menuItems.filter((menu) => menu)
            if (items.length > 1) {
                const itemDatas = items.map((v) => v.data())
                mergedMenus.push({
                    name: newMenuName,
                    submenu(sub) {
                        for (const menu of itemDatas) {
                            sub.append_menu(menu)
                        }
                    },
                })
                for (const menu of items) {
                    menu.remove()
                }
            }
        }

        if (read_config_key('merge.open_with')) {
            const ignore = []
            const ignoreResid = []
            if (read_config_key('merge.open_with_allow.code')) {
                ignore.push('通过 Code 打开', 'Code で聞く')
            }

            if (read_config_key('merge.open_with_allow.terminal')) {
                ignore.push(
                    '在终端中打开',
                    'Open in Terminal',
                    'Windows Terminal here',
                    'Windows Terminal here as administrator',
                    'Windows ターミナルで聞く',
                )
            }

            mergeMenuItems(
                ctx.menu.get_items().filter((menu) => {
                    const data = menu.data()
                    const blacklist = []
                    const blacklistResid = [
                        '51623@SHELL32.dll', // 打开
                        '5393@SHELL32.dll', // 打开方式
                        '8535@windows.storage.dll', // 在新标签页中打开
                        '8533@windows.storage.dll', // 在新窗口中打开
                    ]
                    const whitelist = [
                        // common matches
                        '使用',
                        '播放列表',
                        '播放队列',
                        '编辑',
                        'edit',
                        'open',
                        'here',
                        // specific softwares
                        'adobe bridge',
                        'adobe acrobat',
                        'jetbrains',
                        'intellij',
                        'ida pro',
                        'hhd hex editor neo',
                        'x32dbg',
                        'x64dbg',
                        'mediainfo',
                    ]
                    const fullmatch = ['WizTree']
                    const fullmatchResid = [
                        // common matches
                        '51623@SHELL32.dll', // 打开
                    ]

                    if (ignore.includes(data.name)) return false
                    if (ignoreResid.includes(data.name_resid)) return false
                    if (blacklist.includes(data.name)) return false
                    if (blacklistResid.includes(data.name_resid)) return false
                    return (
                        whitelist.some((name) =>
                            data.name?.toLowerCase().includes(name),
                        ) ||
                        fullmatch.some((name) => data.name === name) ||
                        fullmatchResid.some(
                            (resid) => data.name_resid === resid,
                        )
                    )
                }),
                t('打开方式'),
            )
        }

        if (read_config_key('merge.view_operation')) {
            mergeMenuItems(
                ctx.menu.get_items().filter((menu) => {
                    const data = menu.data()
                    const fullmatch = [
                        // zh-CN
                        '排序方式',
                        '分组依据',
                        // en-US
                        'Sort by',
                        'Group by',
                        // ja-JP
                        '並べ替え',
                        'グループで表示',
                    ]
                    const fullmatchResid = [
                        '31161@SHELL32.dll', // 查看
                    ]
                    return (
                        fullmatch.some((name) => name === data.name) ||
                        fullmatchResid.some(
                            (resid) => data.name_resid === resid,
                        )
                    )
                }),
                t('视图操作'),
            )
        }

        if (read_config_key('merge.uncommon')) {
            mergeMenuItems(
                ctx.menu.get_items().filter((menu) => {
                    const data = menu.data()
                    const fullmatch = [
                        // zh-CN
                        '自定义文件夹...',
                        '授予访问权限',
                        '还原以前的版本',
                        '添加到收藏夹',
                        '共享',
                        // en-US
                        'Customize folder...',
                        'Restore previous versions',
                        'Add to favorites',
                        'Share',
                        'Send to',
                        'Give access to',
                        // ja-JP
                        'このフォルダーのカスタマイズ...',
                        '以前のバージョンの復元',
                        'アクセスを許可する',
                        'お気に入りに追加',
                    ]
                    const fullmatchResid = [
                        '119@ntshrui.dll', // 授予访问权限
                        '34609@SHELL32.dll', // 包含到库中
                        '51622@SHELL32.dll', // 固定到“开始”
                        '30328@SHELL32.dll', // 发送
                        '51624@SHELL32.dll', // 添加到收藏夹
                    ]
                    const partial = ['发送', '送る', '上传', '百度网盘']
                    return (
                        fullmatch.some((name) => data.name === name) ||
                        fullmatchResid.some(
                            (resid) => data.name_resid === resid,
                        ) ||
                        partial.some((name) => data.name?.includes(name))
                    )
                }),
                t('不常用'),
            )
        }

        // merge duplicate spacer
        const items = ctx.menu.get_items()
        let is_last_spacer = false
        for (const item of items) {
            if (item.data().type === 'spacer') {
                if (is_last_spacer) {
                    item.remove()
                }
                is_last_spacer = true
            } else is_last_spacer = false
        }

        // adjust position
        if (mergedMenus.length) {
            for (const menu of ctx.menu.get_items()) {
                const dupname = mergedMenus.find(
                    (v) => v.name === menu.data().name,
                )
                if (dupname) {
                    const orig_submenu = menu.data().submenu
                    menu.set_data({
                        submenu(sub) {
                            orig_submenu?.(sub)
                            sub.append_menu({
                                type: 'spacer',
                            })
                            dupname.submenu(sub)
                        },
                    })

                    mergedMenus.splice(mergedMenus.indexOf(dupname), 1)
                }
            }
            const target = ctx.menu
                .get_items()
                .findIndex((v) => v.data().type == 'spacer')
            for (const menu of mergedMenus) {
                ctx.menu.append_menu_after(menu, target)
            }
            ctx.menu.append_menu_after(
                {
                    type: 'spacer',
                },
                target,
            )
        }
    } catch (e) {
        shell.println(e, e.stack)
    }
})
