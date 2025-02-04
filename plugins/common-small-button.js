// @name: 常用功能小图标 - Copy paste etc. in one line
// @description: 将复制，剪切等常用功能按钮添加到右键菜单的第一行小图标，需要本体版本 0.1.7+
// @version: 0.0.1
// @author: MicroBlock

import * as shell from "mshell"

// ---- CONFIG TEMPLATE ----
const ICON_CHECKED = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"><path fill="currentColor" d="M9.765 3.205a.75.75 0 0 1 .03 1.06l-4.25 4.5a.75.75 0 0 1-1.075.015L2.22 6.53a.75.75 0 0 1 1.06-1.06l1.705 1.704l3.72-3.939a.75.75 0 0 1 1.06-.03"/></svg>`
const ICON_EMPTY = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 12 12"></svg>`
const CONFIG_FILE = "common-small-button.json"
const PLUGIN_NAME = "常用功能小图标"
const default_config = {
    remove_original: false,
    use_original_icon_if_exists: true,
    show_name: false,
    show_icon: true
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

    createToggleMenu(menu, '移除原始按钮', 'remove_original')
    createToggleMenu(menu, '使用原始图标', 'use_original_icon_if_exists')
    createToggleMenu(menu, '显示名称', 'show_name')
    createToggleMenu(menu, '显示图标', 'show_icon')
})

// ---- CONFIG TEMPLATE ----
const icons = {
    dark: {
        copy: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#E0DFDF" d="M5 4H3.5A2.5 2.5 0 0 0 1 6.5v6A2.5 2.5 0 0 0 3.5 15h4a2.5 2.5 0 0 0 2.45-2H8.915A1.5 1.5 0 0 1 7.5 14h-4A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H5V4Z"/>
    <path fill="#4CC2FF" d="M8.5 2A1.5 1.5 0 0 0 7 3.5v6A1.5 1.5 0 0 0 8.5 11h4A1.5 1.5 0 0 0 14 9.5v-6A1.5 1.5 0 0 0 12.5 2h-4ZM6 3.5A2.5 2.5 0 0 1 8.5 1h4A2.5 2.5 0 0 1 15 3.5v6a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 6 9.5v-6Z"/>
  </svg>
  `,
        cut: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <g clip-path="url(#a)">
      <path fill="#E0DFDF" d="M3.228.08a.5.5 0 0 1 .691.148l6.821 10.494a.5.5 0 0 1-.838.545L3.08.772a.5.5 0 0 1 .147-.691Z"/>
      <path fill="#E0DFDF" d="m7.854 6.743-2.595 4a.5.5 0 0 0 .838.544L8.45 7.661l-.596-.918Zm1.34-.23L12.92.773a.5.5 0 1 0-.838-.545L8.598 5.595l.597.918Z"/>
      <path fill="#4CC2FF" d="M4 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm11-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z"/>
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h16v16H0z"/>
      </clipPath>
    </defs>
  </svg>
  `, delete: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <g clip-path="url(#a)">
      <path fill="#E0DFDF" d="M15 2a.5.5 0 0 1 0 1h-.554L13.15 14.23A2 2 0 0 1 11.163 16H4.837a2 2 0 0 1-1.987-1.77L1.553 3H1a.5.5 0 0 1-.492-.41L.5 2.5A.5.5 0 0 1 1 2h14Zm-1.562 1H2.561l1.283 11.115a1 1 0 0 0 .993.885h6.326a1 1 0 0 0 .993-.885L13.438 3Z"/>
      <path fill="#E0DFDF" d="M8 1a1.5 1.5 0 0 0-1.5 1.5h-1a2.5 2.5 0 0 1 5 0h-1A1.5 1.5 0 0 0 8 1ZM6.5 6a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Z"/>
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h16v16H0z"/>
      </clipPath>
    </defs>
  </svg>
  `, paste: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#E0DFDF" d="M2.5 2a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 1 14.5v-12A1.5 1.5 0 0 1 2.5 1h2a.5.5 0 0 1 0 1h-2ZM9 1.5a.5.5 0 0 1 .5-.5h2A1.5 1.5 0 0 1 13 2.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1-.5-.5Z"/>
    <path fill="#E0DFDF" d="M4 1.5A1.5 1.5 0 0 1 5.5 0h3a1.5 1.5 0 1 1 0 3h-3A1.5 1.5 0 0 1 4 1.5ZM5.5 1a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
    <path fill="#4CC2FF" d="M7 6.5A1.5 1.5 0 0 1 8.5 5h5A1.5 1.5 0 0 1 15 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 7 14.5v-8ZM8.5 6a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-5Z"/>
  </svg>
  `
    },
    light: {
        copy: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#FAFAFA" d="M5 4.5H3.5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4A2 2 0 0 0 9.437 13H8a3 3 0 0 1-3-3V4.5Z"/>
    <path fill="#555" d="M5 4H3.5A2.5 2.5 0 0 0 1 6.5v6A2.5 2.5 0 0 0 3.5 15h4a2.5 2.5 0 0 0 2.45-2H8.915A1.5 1.5 0 0 1 7.5 14h-4A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H5V4Z"/>
    <path fill="#FAFAFA" d="M6.5 9.5v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z"/>
    <path fill="#0078D4" d="M8.5 2A1.5 1.5 0 0 0 7 3.5v6A1.5 1.5 0 0 0 8.5 11h4A1.5 1.5 0 0 0 14 9.5v-6A1.5 1.5 0 0 0 12.5 2h-4ZM6 3.5A2.5 2.5 0 0 1 8.5 1h4A2.5 2.5 0 0 1 15 3.5v6a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 6 9.5v-6Z"/>
  </svg>
  `,
        cut: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#555" d="M3.228.08a.5.5 0 0 1 .691.148l6.821 10.494a.5.5 0 0 1-.838.545L3.08.772a.5.5 0 0 1 .147-.691Z"/>
    <path fill="#555" d="m7.854 6.743-2.595 4a.5.5 0 0 0 .838.544L8.45 7.661l-.596-.918Zm1.34-.23L12.92.773a.5.5 0 1 0-.838-.545L8.598 5.595l.597.918Z"/>
    <path fill="#0078D4" d="M4 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm11-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z"/>
  </svg>
  `,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#FAFAFA" d="M14 2.5H2l1.347 11.672a1.5 1.5 0 0 0 1.49 1.328h6.326a1.5 1.5 0 0 0 1.49-1.328L14 2.5Z"/>
    <path fill="#555" d="M15 2a.5.5 0 0 1 0 1h-.554L13.15 14.23A2 2 0 0 1 11.163 16H4.837a2 2 0 0 1-1.987-1.77L1.553 3H1a.5.5 0 0 1-.492-.41L.5 2.5A.5.5 0 0 1 1 2h14Zm-1.562 1H2.561l1.283 11.115a1 1 0 0 0 .993.885h6.326a1 1 0 0 0 .993-.885L13.438 3Z"/>
    <path fill="#555" d="M8 1a1.5 1.5 0 0 0-1.5 1.5h-1a2.5 2.5 0 0 1 5 0h-1A1.5 1.5 0 0 0 8 1ZM6.5 6a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Z"/>
  </svg>
  `,
        paste: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
    <path fill="#FAFAFA" d="M2.5 1.5h2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1h2a1 1 0 0 1 1 1V4H8a2 2 0 0 0-2 2v9.5H2.5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"/>
    <path fill="#555" d="M2.5 2a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 1 14.5v-12A1.5 1.5 0 0 1 2.5 1h2a.5.5 0 0 1 0 1h-2ZM9 1.5a.5.5 0 0 1 .5-.5h2A1.5 1.5 0 0 1 13 2.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1-.5-.5Z"/>
    <path fill="#555" d="M4 1.5A1.5 1.5 0 0 1 5.5 0h3a1.5 1.5 0 1 1 0 3h-3A1.5 1.5 0 0 1 4 1.5ZM5.5 1a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
    <path fill="#FAFAFA" d="M13.5 5.5h-5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1Z"/>
    <path fill="#0078D4" d="M7 6.5A1.5 1.5 0 0 1 8.5 5h5A1.5 1.5 0 0 1 15 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 7 14.5v-8ZM8.5 6a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-5Z"/>
  </svg>
  `
    }
}
shell.menu_controller.add_menu_listener(ctx => {
    try {
        const light_theme = shell.breeze.is_light_theme();
        const icos = icons[light_theme ? 'light' : 'dark']

        const small_buttons = [
            {
                icon: 'copy',
                orig_resid: '4162@SHELL32.dll',
                orig_name: ['复制']
            }, {
                icon: 'cut',
                orig_resid: '33576@SHELL32.dll',
                orig_name: ['剪切']
            }, {
                icon: 'delete',
                orig_resid: '4163@SHELL32.dll',
                orig_name: ['删除']
            }, {
                icon: 'paste',
                orig_resid: '33578@SHELL32.dll',
                orig_name: ['粘贴']
            },
        ]

        const remove_original = read_config_key('remove_original')
        const use_original_icon_if_exists = read_config_key('use_original_icon_if_exists')
        const show_name = read_config_key('show_name')
        const show_icon = read_config_key('show_icon')

        const items = ctx.menu.get_items()
        const icon_menu = ctx.menu.prepend_parent_item();

        for (const button of small_buttons) {
            const corresponding_item = items.find(v => {
                const data = v.data()
                if (!data.name) return false
                if (button.orig_resid && data.resid === button.orig_resid) return true
                if (button.orig_name && button.orig_name.includes(data.name)) return true
                return false
            })

            if (!corresponding_item || corresponding_item.data().disabled)
                continue

            const data = corresponding_item.data()
            const icon = (
                use_original_icon_if_exists && data.icon_svg
                    ? data.icon_svg
                    : icos[button.icon]
            )
            const action = data.action

            icon_menu.append_child_after({
                icon_svg: show_icon ? icon : null,
                action,
                name: show_name ? data.name : null
            }, -1)

            if (remove_original)
                corresponding_item.remove()
        }

        if (icon_menu.children().length === 0)
            icon_menu.remove()
        else
            ctx.menu.append_item_after({
                type: 'spacer'
            }, 1)

        const items2 = ctx.menu.get_items()
        let is_last_spacer = false
        for (const item of items2) {
            if (item.data().type === 'spacer') {
                if (is_last_spacer) {
                    item.remove()
                }
                is_last_spacer = true
            } else is_last_spacer = false
        }
    } catch (e) {
        shell.println(e, e.stack)
    }
})

