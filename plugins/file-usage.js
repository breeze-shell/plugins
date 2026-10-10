// @name: 文件占用查询
// @description: 右键查看文件/文件夹被哪个进程占用, 并能一键结束该进程 / Show which process is using the file or folder, and kill it from the menu
// @version: 0.0.1
// @author: breeze-shell

import * as shell from "mshell"

const zh = shell.breeze.user_language().startsWith("zh")

const T = zh
    ? {
          opened: (name, file) => `${name} 打开了 ${file}`,
          cwd: name => `${name} 的工作目录在此`,
          using: name => `${name} 正在使用`,
          killed: name => `${name} 已结束`,
          failed: name => `${name} 结束失败`,
          group: (name, count) => `${name} 被 ${count} 个进程占用`,
      }
    : {
          opened: (name, file) => `${name} has ${file} open`,
          cwd: name => `${name} works in this folder`,
          using: name => `${name} is using it`,
          killed: name => `${name} killed`,
          failed: name => `${name} could not be killed`,
          group: (name, count) => `${name} is used by ${count} process(es)`,
      }

const ROW_WIDTH = 240
const ROW_HEIGHT = 24
const BUTTON_SIZE = 18
const ICON_SIZE = 12
const HOVER_COLOR = [0.86, 0.2, 0.2, 1]
const CLEAR_COLOR = [0, 0, 0, 0]

const icons = () => {
    const fg = shell.breeze.is_light_theme() ? "#454545" : "#DCDCDC"
    return {
        kill: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${fg}" d="M8 1.25c.41 0 .75.34.75.75v6a.75.75 0 0 1-1.5 0V2c0-.41.34-.75.75-.75Z"/><path fill="${fg}" d="M4.22 3.4a.75.75 0 1 0-1.06-1.06 7.25 7.25 0 1 0 9.68 0 .75.75 0 0 0-1.06 1.06 5.75 5.75 0 1 1-7.56 0Z"/></svg>`,
        confirm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${fg}" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47 5.97-5.97a.75.75 0 0 1 1.06 0Z"/></svg>`,
    }
}

const base_name = path => path.replaceAll("\\", "/").split("/").pop()

const name_of = entry => entry.name || entry.app_name || `PID ${entry.pid}`

const describe = entry => {
    const name = name_of(entry)
    if (entry.working_directory) return T.cwd(name)
    if (entry.held_file) return T.opened(name, base_name(entry.held_file))
    return T.using(name)
}

const build_row = (menu, entry) => {
    const color = shell.breeze.is_light_theme()
        ? [0.24, 0.24, 0.24, 1]
        : [0.88, 0.88, 0.88, 1]
    const svg = icons()

    const row = shell.breeze_ui.widgets_factory.create_flex_layout_widget()
    row.horizontal = true
    row.align_items = "center"
    row.justify_content = "space_between"
    row.set_padding(8, 6, 1, 1)
    row.gap = 8
    row.width = ROW_WIDTH
    row.height = ROW_HEIGHT

    const label = shell.breeze_ui.widgets_factory.create_text_widget()
    label.text = describe(entry)
    label.color = color
    label.font_size = 13
    label.max_width = ROW_WIDTH - BUTTON_SIZE - 22

    const button = shell.breeze_ui.widgets_factory.create_flex_layout_widget()
    button.align_items = "center"
    button.justify_content = "center"
    button.width = BUTTON_SIZE
    button.height = BUTTON_SIZE
    button.border_radius = 4
    button.background_color = CLEAR_COLOR

    const icon = shell.breeze_ui.widgets_factory.create_image_widget()
    icon.width = ICON_SIZE
    icon.height = ICON_SIZE
    icon.svg = svg.kill

    button.append_child(icon)
    row.append_child(label)
    row.append_child(button)
    menu.append_widget_after(row, -1)

    let armed = false
    let done = false

    button.on_mouse_enter = () => {
        if (!done) button.background_color = HOVER_COLOR
    }
    button.on_mouse_leave = () => {
        if (done) return
        armed = false
        button.background_color = CLEAR_COLOR
        icon.svg = svg.kill
    }
    button.on_click = () => {
        if (done) return
        if (!armed) {
            armed = true
            icon.svg = svg.confirm
            return
        }
        armed = false
        if (entry.terminate()) {
            done = true
            button.background_color = CLEAR_COLOR
            icon.svg = svg.confirm
            label.text = T.killed(name_of(entry))
        } else {
            icon.svg = svg.kill
            label.text = T.failed(name_of(entry))
        }
    }
}

shell.menu_controller.add_menu_listener(ctx => {
    try {
        const folder_view = ctx.context.folder_view
        const paths = folder_view?.selected_files ?? []
        if (!paths.length) return

        const used = paths
            .map(path => ({ path, processes: [...shell.file_usage.query(path)] }))
            .filter(item => item.processes.length)
        if (!used.length) return

        if (used.length > 1)
            ctx.menu.append_spacer()

        for (const item of used) {
            if (used.length > 1)
                ctx.menu.append_item({
                    name: T.group(base_name(item.path), item.processes.length),
                    disabled: true,
                })
            for (const entry of item.processes) build_row(ctx.menu, entry)
        }
    } catch (e) {
        shell.println(e, e.stack)
    }
})
