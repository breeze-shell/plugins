// @name: 文件占用查询
// @description: 右键查看文件/文件夹被哪个进程占用, 并能一键结束该进程 / Show which process is using the file or folder, and kill it from the menu
// @version: 0.0.2
// @author: breeze-shell

import * as shell from "mshell"

const zh = shell.breeze.user_language().startsWith("zh")

const T = zh
    ? {
          folder: "工作目录",
          done: "已结束",
          failed: "结束失败",
          count: n => `${n} 个进程`,
      }
    : {
          folder: "working folder",
          done: "closed",
          failed: "not closed",
          count: n => `${n} process(es)`,
      }

const LAYOUT = {
    row: 26,
    header: 24,
    button: 24,
    icon: 14,
    radius: 5,
    inset: 5,
    text_left: 14,
    gap: 6,
    min_width: 220,
    max_width: 380,
}

const THEME = () => {
    const light = shell.breeze.is_light_theme()
    return {
        text: light ? [0, 0, 0, 0.89] : [1, 1, 1, 1],
        text_secondary: light ? [0, 0, 0, 0.62] : [1, 1, 1, 0.77],
        text_tertiary: light ? [0, 0, 0, 0.45] : [1, 1, 1, 0.53],
        hover: light ? [0, 0, 0, 0.157] : [1, 1, 1, 0.157],
        clear: [0, 0, 0, 0],
        critical: [0.769, 0.169, 0.11, 1],
        critical_text: light ? [0.769, 0.169, 0.11, 1] : [1, 0.6, 0.643, 1],
        success_text: light ? [0.059, 0.482, 0.059, 1] : [0.424, 0.796, 0.373, 1],
        icon: light ? "#5b5b5b" : "#d8d8d8",
        icon_hot: "#ffffff",
        icon_done: light ? "#0f7b0f" : "#6ccb5f",
    }
}

const ICONS = theme => ({
    kill: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${theme.icon}" d="M8 1.4c.44 0 .8.36.8.8v5.4a.8.8 0 0 1-1.6 0V2.2c0-.44.36-.8.8-.8Z"/><path fill="${theme.icon}" d="M4.28 3.5a.8.8 0 1 0-1.13-1.13 7.4 7.4 0 1 0 9.7 0A.8.8 0 0 0 11.72 3.5a5.8 5.8 0 1 1-7.44 0Z"/></svg>`,
    kill_hot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${theme.icon_hot}" d="M8 1.4c.44 0 .8.36.8.8v5.4a.8.8 0 0 1-1.6 0V2.2c0-.44.36-.8.8-.8Z"/><path fill="${theme.icon_hot}" d="M4.28 3.5a.8.8 0 1 0-1.13-1.13 7.4 7.4 0 1 0 9.7 0A.8.8 0 0 0 11.72 3.5a5.8 5.8 0 1 1-7.44 0Z"/></svg>`,
    check_hot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${theme.icon_hot}" d="M13.5 4.4a.8.8 0 0 0-1.13 0L6.9 9.87 4.62 7.6A.8.8 0 0 0 3.5 8.73l2.84 2.84a.8.8 0 0 0 1.13 0l6.03-6.03a.8.8 0 0 0 0-1.13Z"/></svg>`,
    check_done: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${theme.icon_done}" d="M13.5 4.4a.8.8 0 0 0-1.13 0L6.9 9.87 4.62 7.6A.8.8 0 0 0 3.5 8.73l2.84 2.84a.8.8 0 0 0 1.13 0l6.03-6.03a.8.8 0 0 0 0-1.13Z"/></svg>`,
})

const CHECK_MARK = "M13.5 4.4"

const flex = () => shell.breeze_ui.widgets_factory.create_flex_layout_widget()
const text = value => {
    const widget = shell.breeze_ui.widgets_factory.create_text_widget()
    widget.text = value
    return widget
}
const image = svg => {
    const widget = shell.breeze_ui.widgets_factory.create_image_widget()
    widget.width = LAYOUT.icon
    widget.height = LAYOUT.icon
    widget.svg = svg
    return widget
}

const base_name = path => path.replaceAll("\\", "/").split("/").pop()

const char_em = ch => {
    const code = ch.codePointAt(0)
    if (code >= 0x2e80) return 1.0
    if (code === 32) return 0.28
    if (code >= 48 && code <= 57) return 0.56
    if (code >= 65 && code <= 90) return 0.68
    if (code >= 97 && code <= 122) return 0.52
    if (".:;,!'|Iilfj".includes(ch)) return 0.3
    return 0.6
}

/* 估宽宁可偏大: 文字控件放不下就会折行 */
const measure = (value, font_size) =>
    [...value].reduce((width, ch) => width + char_em(ch) * font_size, 0) * 1.08

const clamp = (value, low, high) => Math.min(Math.max(value, low), high)

const fit = (value, budget, font_size) => {
    if (measure(value, font_size) <= budget) return value
    let result = ""
    let used = font_size
    for (const ch of value) {
        const width = char_em(ch) * font_size
        if (used + width > budget) break
        used += width
        result += ch
    }
    return result + "…"
}

/* 内层容器里除了文字以外的固定开销: 缩进 + 右侧留白 + 间距 + 结束按钮 */
const fixed_width =
    LAYOUT.text_left + 4 + LAYOUT.gap + LAYOUT.button

/* 行的内容需要的宽度 */
const content_width = (title, title_size, meta, meta_size) =>
    LAYOUT.inset * 2 +
    fixed_width +
    measure(title, title_size) +
    (meta ? 4 + measure(meta, meta_size) : 0)

/* 只有内容实在放不下 (超过上限) 才截断 */
const layout_texts = (
    title,
    meta,
    inner_width,
    title_size,
    meta_size,
) => {
    const budget = inner_width - fixed_width - (meta ? 4 : 0)
    const title_width = measure(title, title_size)
    const meta_width = meta ? measure(meta, meta_size) : 0
    if (title_width + meta_width <= budget)
        return {
            title: { width: 0, value: title },
            meta: meta ? { width: 0, value: meta } : null,
        }
    const scale = budget / (title_width + meta_width)
    return {
        title: {
            width: title_width * scale,
            value: fit(title, title_width * scale, title_size),
        },
        meta: meta
            ? {
                  width: meta_width * scale,
                  value: fit(meta, meta_width * scale, meta_size),
              }
            : null,
    }
}

const holder_name = entry => entry.name || entry.app_name || `PID ${entry.pid}`

const holder_detail = entry => {
    if (entry.working_directory) return T.folder
    if (entry.held_file) return base_name(entry.held_file)
    return ""
}

const build_row = (menu, entry) => {
    const theme = THEME()
    const icons = ICONS(theme)

    const row = flex()
    row.height = LAYOUT.row
    row.horizontal = true

    const inner = flex()
    inner.height = LAYOUT.row
    inner.horizontal = true
    inner.align_items = "center"
    inner.border_radius = LAYOUT.radius
    inner.background_color = theme.clear
    inner.set_padding(LAYOUT.text_left, 4, 0, 0)
    inner.gap = LAYOUT.gap

    const body = flex()
    body.horizontal = true
    body.align_items = "center"
    body.flex_grow = 1
    body.gap = 4
    body.crop_overflow = true

    const name = holder_name(entry)
    const detail = holder_detail(entry)
    let meta_value = detail ? `· ${detail}` : ""

    const title = text(name)
    title.font_size = 14
    title.font_weight = 600
    title.color = theme.text

    const meta = text(meta_value)
    meta.font_size = 12
    meta.font_weight = 400
    meta.color = theme.text_secondary

    const button = flex()
    button.width = LAYOUT.button
    button.height = LAYOUT.button
    button.border_radius = 4
    button.align_items = "center"
    button.justify_content = "center"
    button.background_color = theme.clear

    const icon = image(icons.kill)

    body.append_child(title)
    if (meta_value) body.append_child(meta)
    button.append_child(icon)
    inner.append_child(body)
    inner.append_child(button)
    row.append_child(inner)
    menu.append_widget_after(row, -1)

    let armed = false
    let done = false

    const set_icon = svg => {
        icon.svg = svg
    }
    const rest = () => {
        button.background_color = theme.clear
        set_icon(icons.kill)
    }
    const hot = () => {
        button.background_color = theme.critical
        set_icon(armed ? icons.check_hot : icons.kill_hot)
    }

    inner.on_mouse_enter = () => {
        if (!done) inner.background_color = theme.hover
    }
    inner.on_mouse_leave = () => {
        inner.background_color = theme.clear
    }
    button.on_mouse_enter = () => {
        if (!done) hot()
    }
    button.on_mouse_leave = () => {
        if (done) return
        armed = false
        rest()
    }
    button.on_click = () => {
        if (done) return
        if (!armed) {
            armed = true
            set_icon(icons.check_hot)
            return
        }
        if (entry.terminate()) {
            done = true
            armed = false
            button.background_color = theme.clear
            set_icon(icons.check_done)
            meta_value = `· ${T.done}`
            meta.color = theme.success_text
            meta.text = meta_value
        } else {
            armed = false
            set_icon(icons.kill_hot)
            meta_value = `· ${T.failed}`
            meta.color = theme.critical_text
            meta.text = meta_value
        }
    }

    const wanted = clamp(
        content_width(name, title.font_size, meta_value, meta.font_size),
        LAYOUT.min_width,
        LAYOUT.max_width,
    )

    const apply = width => {
        const inner_width = width - LAYOUT.inset * 2
        row.width = width
        inner.width = inner_width
        const texts = layout_texts(
            name,
            meta_value,
            inner_width,
            title.font_size,
            meta.font_size,
        )
        title.max_width = texts.title.width
        title.text = texts.title.value
        if (!texts.meta) return
        meta.max_width = texts.meta.width
        meta.text = texts.meta.value
    }

    apply(wanted)
    return { width: wanted, apply }
}

const build_header = (menu, name, count) => {
    const theme = THEME()

    const row = flex()
    row.height = LAYOUT.header
    row.horizontal = true

    const inner = flex()
    inner.height = LAYOUT.header
    inner.horizontal = true
    inner.align_items = "center"
    inner.border_radius = LAYOUT.radius
    inner.set_padding(LAYOUT.text_left, 6, 0, 0)

    const strip = flex()
    strip.horizontal = true
    strip.align_items = "center"
    strip.justify_content = "space_between"
    strip.flex_grow = 1

    const title = text(name)
    title.font_size = 12
    title.font_weight = 600
    title.color = theme.text_secondary

    const counter = text(T.count(count))
    counter.font_size = 12
    counter.font_weight = 400
    counter.color = theme.text_tertiary

    strip.append_child(title)
    strip.append_child(counter)
    inner.append_child(strip)
    row.append_child(inner)
    menu.append_widget_after(row, -1)

    const apply = width => {
        const inner_width = width - LAYOUT.inset * 2
        row.width = width
        inner.width = inner_width
        const budget = inner_width - LAYOUT.text_left - 6
        const name_width = measure(name, title.font_size)
        const count_width = measure(counter.text, counter.font_size)
        const total = name_width + count_width
        const scale = total > budget ? budget / total : 1
        title.max_width = name_width * scale
        title.text = fit(name, name_width * scale, title.font_size)
        counter.max_width = count_width * scale
    }

    const wanted = clamp(
        content_width(name, title.font_size, counter.text, counter.font_size),
        LAYOUT.min_width,
        LAYOUT.max_width,
    )

    apply(wanted)
    return { width: wanted, apply }
}

/* 菜单宽度定下来后把每一行拉满 (不能比内容需要的窄, 否则文字会折行) */
const sync_width = (menu, rows) => {
    const wanted = Math.max(...rows.map(row => row.width))
    const apply = () => {
        if (!menu.valid()) return true
        const width = menu.widget?.width ?? 0
        if (width < 80) return false
        const row_width = Math.min(
            Math.max(width, wanted, LAYOUT.min_width),
            LAYOUT.max_width,
        )
        for (const row of rows) row.apply(row_width)
        return true
    }
    const delays = [16, 50, 120, 260, 500]
    const retry = attempt => {
        if (apply() || attempt >= delays.length) return
        shell.infra.setTimeout(() => retry(attempt + 1), delays[attempt])
    }
    retry(0)
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

        const rows = []
        used.forEach((item, index) => {
            if (used.length > 1) {
                if (index > 0) ctx.menu.append_spacer()
                rows.push(
                    build_header(
                        ctx.menu,
                        base_name(item.path),
                        item.processes.length,
                    ),
                )
            }
            for (const entry of item.processes)
                rows.push(build_row(ctx.menu, entry))
        })
        sync_width(ctx.menu, rows)
    } catch (e) {
        shell.println(e, e.stack)
    }
})
