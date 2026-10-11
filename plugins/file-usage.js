// @name: 文件占用查询
// @description: 右键查看文件/文件夹被哪个进程占用, 并能一键结束该进程 / Show which process is using the file or folder, and kill it from the menu
// @version: 0.2.0
// @author: breeze-shell

import * as shell from "mshell"

const zh = shell.breeze.user_language().startsWith("zh")

const T = zh
    ? {
          checking: "正在检查占用…",
          current: "当前进程",
          folder: "工作目录",
          done: "已结束",
          failed: "结束失败",
          count: n => `${n} 个进程`,
          one: (name, n) => `${name} 等 ${n} 个进程占用`,
          many: (files, n) => `${files} 个文件被 ${n} 个进程占用`,
      }
    : {
          checking: "Checking…",
          current: "current process",
          folder: "working folder",
          done: "closed",
          failed: "not closed",
          count: n => `${n} process(es)`,
          one: (name, n) => `Used by ${name} and ${n - 1} more`,
          many: (files, n) => `${files} items used by ${n} processes`,
      }

const LAYOUT = {
    gap: 6,
    text_gap: 4,
    min_button: 20,
    max_button: 28,
    min_width: 200,
    max_width: 380,
}

// 跟 fluent token 对齐: 文字 TextFillColor*, 图标 SystemFillColor*, 底色 SubtleFillColor*
const PALETTE = () => {
    const light = shell.breeze.is_light_theme()
    return {
        text: light ? [0, 0, 0, 0.89] : [1, 1, 1, 1],
        secondary: light ? [0, 0, 0, 0.62] : [1, 1, 1, 0.77],
        tertiary: light ? [0, 0, 0, 0.45] : [1, 1, 1, 0.53],
        row_hover: light ? [0, 0, 0, 0.157] : [1, 1, 1, 0.157],
        button_hover: light ? [0, 0, 0, 0.06] : [1, 1, 1, 0.08],
        button_pressed: light ? [0, 0, 0, 0.1] : [1, 1, 1, 0.13],
        clear: [0, 0, 0, 0],
        icon: light ? "#5b5b5b" : "#d8d8d8",
        icon_critical: light ? "#c42b1c" : "#ff99a4",
        icon_success: light ? "#0f7b0f" : "#6ccb5f",
        critical: light ? [0.769, 0.169, 0.11, 1] : [1, 0.6, 0.643, 1],
        success: light ? [0.059, 0.482, 0.059, 1] : [0.424, 0.796, 0.373, 1],
    }
}

const power_icon = color =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${color}" d="M8 1.4c.44 0 .8.36.8.8v5.4a.8.8 0 0 1-1.6 0V2.2c0-.44.36-.8.8-.8Z"/><path fill="${color}" d="M4.28 3.5a.8.8 0 1 0-1.13-1.13 7.4 7.4 0 1 0 9.7 0A.8.8 0 0 0 11.72 3.5a5.8 5.8 0 1 1-7.44 0Z"/></svg>`

const check_icon = color =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${color}" d="M13.5 4.4a.8.8 0 0 0-1.13 0L6.9 9.87 4.62 7.6A.8.8 0 0 0 3.5 8.73l2.84 2.84a.8.8 0 0 0 1.13 0l6.03-6.03a.8.8 0 0 0 0-1.13Z"/></svg>`

const flex = () => shell.breeze_ui.widgets_factory.create_flex_layout_widget()
const text = () => shell.breeze_ui.widgets_factory.create_text_widget()

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

// 估宽偏大一点: 文字控件放不下就会折行
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

// 结束按钮比菜单项矮一点, 正好落在菜单自己的网格上
const button_size = metrics =>
    clamp(Math.round(metrics.item_height) - 1, LAYOUT.min_button, LAYOUT.max_button)

const icon_size = metrics => Math.round(button_size(metrics) * 0.55)

const text_room = (metrics, row_width) =>
    row_width -
    metrics.text_offset -
    metrics.right_reserved -
    LAYOUT.gap -
    button_size(metrics)

const content_width = (metrics, title, title_size, meta, meta_size) =>
    metrics.text_offset +
    metrics.right_reserved +
    measure(title, title_size) +
    (meta ? LAYOUT.text_gap + measure(meta, meta_size) : 0) +
    LAYOUT.gap +
    button_size(metrics)

const fit_texts = (title, meta, room, title_size, meta_size) => {
    const title_width = measure(title, title_size)
    const meta_width = meta ? measure(meta, meta_size) : 0
    if (title_width + meta_width <= room)
        return {
            title: { width: 0, value: title },
            meta: meta ? { width: 0, value: meta } : null,
        }
    const scale = room / (title_width + meta_width)
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

const holder_title = entry => entry.name || entry.app_name || `PID ${entry.pid}`

const holder_detail = entry => {
    if (entry.is_current) return T.current
    if (entry.held_file) return base_name(entry.held_file)
    if (entry.working_directory) return T.folder
    return ""
}

// 整行按菜单自己的尺寸排: 行高 = 原生菜单项高度, 高亮背景一样内缩, 文字一样左偏移
const build_row = (menu, metrics, entry) => {
    const palette = PALETTE()
    const inset = metrics.background_inset
    const row_height = Math.round(metrics.item_height)
    const icon_box = button_size(metrics)
    const icon_px = icon_size(metrics)
    const title_text = holder_title(entry)
    const detail = holder_detail(entry)
    let meta_text = detail ? `· ${detail}` : ""

    const row = flex()
    row.height = row_height
    row.horizontal = true
    row.set_padding(inset, 0, 0, 0)

    const hover = flex()
    hover.height = row_height
    hover.horizontal = true
    hover.align_items = "center"
    hover.border_radius = metrics.item_radius
    hover.background_color = palette.clear
    hover.set_padding(
        Math.max(metrics.text_offset - inset, 0),
        Math.max(metrics.right_reserved - inset, 0),
        0,
        0,
    )
    hover.set_animation(".a", true)

    const body = flex()
    body.horizontal = true
    body.align_items = "center"
    body.flex_grow = 1
    body.gap = LAYOUT.text_gap
    body.crop_overflow = true

    const title = text()
    title.font_size = metrics.font_size
    title.font_weight = 400
    title.color = palette.text

    const meta = text()
    meta.font_size = Math.round(metrics.font_size * 0.86)
    meta.font_weight = 400
    meta.color = palette.secondary

    body.append_child(title)
    body.append_child(meta)
    hover.append_child(body)

    let button = null
    let icon = null
    if (!entry.is_current) {
        button = flex()
        button.width = icon_box
        button.height = icon_box
        button.border_radius = 4
        button.align_items = "center"
        button.justify_content = "center"
        button.background_color = palette.clear
        button.set_animation(".a", true)
        icon = shell.breeze_ui.widgets_factory.create_image_widget()
        icon.width = icon_px
        icon.height = icon_px
        icon.svg = power_icon(palette.icon)
        button.append_child(icon)
        hover.append_child(button)
    }
    row.append_child(hover)
    menu.append_widget_after(row, -1)

    let armed = false
    let settled = false

    const paint = (color, svg) => {
        button.background_color = color
        icon.svg = svg
    }

    hover.on_mouse_enter = () => {
        hover.background_color = palette.row_hover
    }
    hover.on_mouse_leave = () => {
        hover.background_color = palette.clear
    }

    if (!entry.is_current) {
        // 点击瞬间会闪一次 leave/enter, 所以移开要等一小会儿再复位
        let hover_token = 0
        button.on_mouse_enter = () => {
            hover_token++
            if (settled) return
            paint(
                armed ? palette.button_pressed : palette.button_hover,
                armed
                    ? check_icon(palette.icon_critical)
                    : power_icon(palette.icon_critical),
            )
        }
        button.on_mouse_leave = () => {
            const token = ++hover_token
            if (settled) return
            shell.infra.setTimeout(() => {
                if (token != hover_token || settled) return
                armed = false
                paint(palette.clear, power_icon(palette.icon))
            }, 250)
        }
        button.on_click = () => {
            if (settled) return
            if (!armed) {
                armed = true
                paint(palette.button_pressed, check_icon(palette.icon_critical))
                return
            }
            armed = false
            if (entry.terminate()) {
                settled = true
                paint(palette.clear, check_icon(palette.icon_success))
                meta_text = `· ${T.done}`
                meta.color = palette.success
            } else {
                paint(palette.clear, power_icon(palette.icon_critical))
                meta_text = `· ${T.failed}`
                meta.color = palette.critical
            }
            meta.text = meta_text
        }
    }

    const wanted = clamp(
        content_width(metrics, title_text, title.font_size, meta_text, meta.font_size),
        LAYOUT.min_width,
        LAYOUT.max_width,
    )
    const apply = width => {
        row.width = width
        hover.width = width - inset * 2
        const texts = fit_texts(
            title_text,
            meta_text,
            text_room(metrics, width),
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

const build_header = (menu, metrics, name, count) => {
    const palette = PALETTE()
    const inset = metrics.background_inset
    const row_height = Math.round(metrics.item_height)
    const size = Math.round(metrics.font_size * 0.86)

    const row = flex()
    row.height = row_height
    row.horizontal = true
    row.set_padding(inset, 0, 0, 0)

    const strip = flex()
    strip.height = row_height
    strip.horizontal = true
    strip.align_items = "center"
    strip.justify_content = "space_between"
    strip.set_padding(
        Math.max(metrics.text_offset - inset, 0),
        Math.max(metrics.right_reserved - inset, 0),
        0,
        0,
    )

    const title = text()
    title.font_size = size
    title.font_weight = 400
    title.color = palette.secondary

    const counter = text()
    counter.font_size = size
    counter.font_weight = 400
    counter.color = palette.tertiary
    counter.text = T.count(count)

    strip.append_child(title)
    strip.append_child(counter)
    row.append_child(strip)
    menu.append_widget_after(row, -1)

    const wanted = clamp(
        metrics.text_offset +
            metrics.right_reserved +
            measure(name, size) +
            measure(counter.text, size),
        LAYOUT.min_width,
        LAYOUT.max_width,
    )
    const apply = width => {
        row.width = width
        strip.width = width - inset * 2
        const room =
            width - metrics.text_offset - metrics.right_reserved - LAYOUT.gap
        title.max_width = Math.max(40, room - measure(counter.text, size))
        title.text = fit(name, title.max_width, size)
    }

    apply(wanted)
    return { width: wanted, apply }
}

// 菜单宽度定下来后把行拉满, 但不能比内容需要的窄 (窄了文字会折行)
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

const selected_paths = context =>
    (context.folder_view?.selected_files ?? []).filter(
        path => typeof path === "string" && path.length > 0,
    )

const summary = used => {
    const total = used.reduce((sum, item) => sum + item.processes.length, 0)
    if (used.length === 1) return T.one(holder_title(used[0].processes[0]), total)
    return T.many(used.length, total)
}

const add_rows = (menu, used, with_headers) => {
    const metrics = menu.metrics
    const rows = []
    used.forEach((item, index) => {
        if (with_headers) {
            if (index > 0) menu.append_spacer()
            rows.push(
                build_header(
                    menu,
                    metrics,
                    base_name(item.path),
                    item.processes.length,
                ),
            )
        }
        for (const entry of item.processes)
            rows.push(build_row(menu, metrics, entry))
    })
    sync_width(menu, rows)
}

shell.menu_controller.add_menu_listener(ctx => {
    const paths = selected_paths(ctx.context)
    if (!paths.length) return

    const menu = ctx.menu
    const placeholder = menu.append_item({ name: T.checking, disabled: true })

    // 查询可能比较慢, 先让菜单出来再补内容
    shell.infra.setTimeout(() => {
        try {
            if (!menu.valid()) return
            const used = paths
                .map(path => ({
                    path,
                    processes: [...shell.file_usage.query(path)],
                }))
                .filter(item => item.processes.length)
            placeholder.remove()
            if (!used.length) return

            const total = used.reduce((sum, item) => sum + item.processes.length, 0)
            if (used.length === 1 && total === 1) {
                add_rows(menu, used, false)
                return
            }
            menu.append_item({
                name: summary(used),
                // 菜单本来没有图标列就别加图标, 否则原生菜单项会整体右移
                icon_svg:
                    menu.metrics.icon_size > 0
                        ? power_icon(PALETTE().icon)
                        : undefined,
                submenu: sub => add_rows(sub, used, used.length > 1),
            })
        } catch (e) {
            shell.println(e, e.stack)
            try {
                placeholder.remove()
            } catch (inner) {}
        }
    }, 0)
})
