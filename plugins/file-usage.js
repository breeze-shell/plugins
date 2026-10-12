// @name: 文件占用查询
// @description: 右键查看文件/文件夹被哪个进程占用, 并能一键结束该进程 / Show which process is using the file or folder, and kill it from the menu
// @version: 0.3.0
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
          confirm: "再点一次结束",
          count: n => `${n} 个进程`,
          one: (name, n) => `${name} 等 ${n} 个进程占用`,
          many: (files, n) => `${files} 个项目被 ${n} 个进程占用`,
      }
    : {
          checking: "Checking…",
          current: "current process",
          folder: "working folder",
          done: "closed",
          failed: "not closed",
          confirm: "click again to close",
          count: n => (n === 1 ? "1 process" : `${n} processes`),
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
        // 悬停/按下的浓淡对齐原生项 (20/255 与 40/255)
        row_hover: light ? [0, 0, 0, 0.078] : [1, 1, 1, 0.078],
        focus_ring: light ? [0, 0, 0, 0.5] : [1, 1, 1, 0.5],
        button_hover: light ? [0, 0, 0, 0.078] : [1, 1, 1, 0.078],
        button_pressed: light ? [0, 0, 0, 0.157] : [1, 1, 1, 0.157],
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

const file_icon = color =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${color}" d="M9.2 1.5H4.6A1.6 1.6 0 0 0 3 3.1v9.8a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6V5.3L9.2 1.5Zm-.2 1.6 2.9 2.9H9V3.1Z"/></svg>`

const folder_icon = color =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="${color}" d="M2 4.2c0-.9.7-1.6 1.6-1.6h2.5l1.4 1.6h4.9c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.6-1.6 1.6H3.6A1.6 1.6 0 0 1 2 12.4V4.2Z"/></svg>`

const reason_icon = (entry, color) =>
    entry.held_file ? file_icon(color) : folder_icon(color)

const flex = () => shell.breeze_ui.widgets_factory.create_flex_layout_widget()
const text = () => shell.breeze_ui.widgets_factory.create_text_widget()

const icon_cache = new Map()
const process_icon = path => {
    if (!icon_cache.has(path)) {
        if (icon_cache.size >= 64) icon_cache.clear()
        icon_cache.set(path, shell.win32.load_file_icon(path))
    }
    return icon_cache.get(path)
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

// 估宽偏大一点: 文字控件放不下就会折行
const measure = (value, font_size) =>
    [...value].reduce((width, ch) => width + char_em(ch) * font_size, 0) * 1.08

const clamp = (value, low, high) => Math.min(Math.max(value, low), high)

const width_of = (chars, font_size) =>
    chars.reduce((width, ch) => width + char_em(ch) * font_size, 0)

// 从中间截断: 进程名和文件名都得留住尾巴 (扩展名)
const fit = (value, budget, font_size) => {
    if (measure(value, font_size) <= budget) return value
    const chars = [...value]
    const dot = value.lastIndexOf(".")
    let tail = dot > 0 ? [...value.slice(dot)] : []
    if (width_of(tail, font_size) > budget * 0.45) tail = chars.slice(-3)
    const head = chars.slice(0, chars.length - tail.length)
    const room = budget - width_of(tail, font_size) - font_size
    const result = []
    let used = 0
    for (const ch of head) {
        const width = char_em(ch) * font_size
        if (used + width > room) break
        used += width
        result.push(ch)
    }
    return result.join("") + "…" + tail.join("")
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

// 结束失败时再查一次: 进程可能在我们点之前就自己退了
const still_holding = (path, pid) => {
    try {
        return [...shell.file_usage.query(path)].some(holder => holder.pid === pid)
    } catch (e) {
        return true
    }
}

const same_path = (a, b) => {
    const norm = path => path.replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase()
    return norm(a) === norm(b)
}

const holder_detail = (entry, header_path = "") => {
    if (entry.is_current) return T.current
    if (entry.held_file && !(header_path && same_path(entry.held_file, header_path)))
        return base_name(entry.held_file)
    if (entry.working_directory) return T.folder
    return ""
}

// 有原生图标列就跟着对齐; 菜单里没有原生菜单项时 (比如子菜单) 自己占一列
const icon_column = metrics =>
    Math.round(
        metrics.icon_size > 0
            ? metrics.icon_size
            : metrics.native_items == 0
              ? metrics.font_size + 2
              : 0,
    )

const icon_gap = (metrics, column) =>
    column > 0
        ? Math.max(metrics.text_offset - metrics.icon_offset - column, 12)
        : 0

const text_x = metrics => {
    const column = icon_column(metrics)
    return Math.round(
        column > 0
            ? metrics.icon_offset + column + icon_gap(metrics, column)
            : metrics.text_offset,
    )
}

// 同名的进程带上 pid, 不然分不清要结束哪一个
const build_row = (menu, metrics, entry, path, with_pid = false, under_header = false) => {
    const palette = PALETTE()
    const inset = metrics.background_inset
    const row_height = Math.round(metrics.item_height)
    const icon_box = button_size(metrics)
    const icon_px = icon_size(metrics)
    const name = holder_title(entry)
    const title_text = with_pid ? `${name} (${entry.pid})` : name
    const detail = holder_detail(entry, under_header ? path : "")
    let meta_text = detail ? `· ${detail}` : ""

    const row = flex()
    row.height = row_height
    row.horizontal = true
    row.set_padding(inset, 0, 0, 0)

    const column = icon_column(metrics)
    const hover = flex()
    hover.height = row_height
    hover.horizontal = true
    hover.align_items = "center"
    hover.border_radius = metrics.item_radius
    hover.background_color = palette.clear
    hover.set_padding(
        Math.max(
            (column > 0 ? metrics.icon_offset : metrics.text_offset) - inset,
            0,
        ),
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

    // 图标列里放进程自己的图标, 拿不到就退回"占用原因"的字形
    if (column > 0) {
        const slot = flex()
        slot.width = column
        slot.height = column
        slot.align_items = "center"
        slot.justify_content = "center"
        const icon_id = entry.path ? process_icon(entry.path) : 0
        const glyph = icon_id
            ? shell.breeze_ui.widgets_factory.create_icon_widget()
            : shell.breeze_ui.widgets_factory.create_image_widget()
        if (icon_id) glyph.icon = icon_id
        else glyph.svg = reason_icon(entry, palette.icon)
        glyph.width = column
        glyph.height = column
        slot.append_child(glyph)
        hover.append_child(slot)
        hover.gap = icon_gap(metrics, column)
    }
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
    let armed_at = 0
    let hover_token = 0
    let reason_meta = meta_text
    let armed_meta = `· ${T.confirm}`

    // 菜单关掉之后延时回调还会跑, 那时候控件已经销毁了
    const alive = () => menu.valid()

    const paint = (color, svg) => {
        if (!alive()) return
        button.background_color = color
        icon.svg = svg
    }
    const action_icon = () =>
        armed
            ? check_icon(palette.icon_critical)
            : power_icon(palette.icon_critical)
    // 悬停整行只让图标浮出来, 底盘留给光标真的停在按钮上的时候
    const show_action = over_button => {
        if (!button || settled || !alive()) return
        const hover_bg = armed
            ? palette.button_pressed
            : over_button
              ? palette.button_hover
              : palette.clear
        paint(hover_bg, action_icon())
    }
    const reset_action = () => {
        armed = false
        if (!alive()) return
        if (button) paint(palette.clear, power_icon(palette.icon))
        // 已经显示着原因就别再写一遍: 重复写会触发菜单项更新, 自绘的行会被重建掉
        if (meta_text !== reason_meta) {
            meta.color = palette.secondary
            meta_text = set_meta(reason_meta)
        }
    }
    // 第二次点击要离开第一次 300ms 才算确认, 免得手滑连点直接把进程结束掉
    const trigger = () => {
        if (settled || !alive()) return
        if (!armed) {
            armed = true
            armed_at = Date.now()
            paint(palette.button_pressed, check_icon(palette.icon_critical))
            meta_text = set_meta(armed_meta)
            return
        }
        if (Date.now() - armed_at < 300) return
        armed = false
        if (entry.terminate()) {
            settled = true
            hover.background_color = palette.row_hover
            paint(palette.clear, check_icon(palette.icon_success))
            meta_text = set_meta(`· ${T.done}`)
            meta.color = palette.success
        } else if (still_holding(path, entry.pid)) {
            paint(palette.clear, power_icon(palette.icon_critical))
            meta_text = set_meta(`· ${T.failed}`)
            meta.color = palette.critical
        } else {
            // 还没点到它就自己退出了, 按已结束处理
            settled = true
            hover.background_color = palette.row_hover
            paint(palette.clear, check_icon(palette.icon_success))
            meta_text = set_meta(`· ${T.done}`)
            meta.color = palette.success
        }
    }

    // 只有光标最上层那个控件收得到 enter/leave, 所以行、文字、按钮各挂一份
    const enter = () => {
        if (!alive()) return
        hover_token++
        hover.background_color = palette.row_hover
        show_action(false)
    }
    const leave = () => {
        if (!alive()) return
        hover.background_color = palette.clear
        // 点一下会闪一次 leave/enter, 所以复位要等一下
        const token = ++hover_token
        shell.infra.setTimeout(() => {
            if (token != hover_token || settled || !alive()) return
            reset_action()
        }, 250)
    }

    hover.on_mouse_enter = enter
    hover.on_mouse_leave = leave
    body.on_mouse_enter = enter
    body.on_mouse_leave = leave
    row.on_focus = () => {
        if (!alive()) return
        enter()
        hover.border_color = palette.focus_ring
        hover.border_width = 1
    }
    row.on_blur = () => {
        if (!alive()) return
        hover.border_width = 0
        leave()
    }
    if (!entry.is_current) {
        button.on_mouse_enter = () => {
            if (!alive()) return
            hover_token++
            hover.background_color = palette.row_hover
            show_action(true)
        }
        button.on_mouse_leave = () => {
            if (!alive()) return
            hover.background_color = palette.row_hover
            show_action(false)
        }
        body.on_click = trigger
        button.on_click = trigger
        // 回车 257/335, 空格 32, Esc 256
        row.on_key_down = key => {
            if (key == 257 || key == 335 || key == 32) trigger()
            else if (key == 256 && armed) reset_action()
        }
    }

    const set_meta = raw => {
        if (!alive()) return meta_text
        const fitted = fit_texts(
            title_text,
            raw,
            text_room(metrics, row.width),
            title.font_size,
            meta.font_size,
        )
        if (!fitted.meta) {
            meta.text = ""
            return ""
        }
        meta.max_width = fitted.meta.width
        meta.text = fitted.meta.value
        return fitted.meta.value
    }

    const wanted = clamp(
        Math.max(
            content_width(metrics, title_text, title.font_size, meta_text, meta.font_size),
            content_width(
                metrics,
                title_text,
                title.font_size,
                `· ${T.confirm}`,
                meta.font_size,
            ),
        ),
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
        if (!armed && !settled) {
            reason_meta = texts.meta.value
            armed_meta = fit_texts(
                title_text,
                `· ${T.confirm}`,
                text_room(metrics, width),
                title.font_size,
                meta.font_size,
            ).meta.value
            meta_text = reason_meta
        }
        meta.text = meta_text
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
        Math.max(text_x(metrics) - inset, 0),
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

const order = item =>
    [...item.processes].sort((a, b) => {
        if (!a.held_file != !b.held_file) return a.held_file ? -1 : 1
        const an = holder_title(a).toLowerCase()
        const bn = holder_title(b).toLowerCase()
        if (an != bn) return an < bn ? -1 : 1
        return a.pid - b.pid
    })

const summary = (used, metrics) => {
    const total = used.reduce((sum, item) => sum + item.processes.length, 0)
    // 进程名长短差很多, 不截断会把菜单撑到满屏; 只截名字, 后面的计数留着
    if (used.length === 1) {
        const budget =
            LAYOUT.max_width -
            metrics.text_offset -
            metrics.right_reserved -
            measure(T.one("", total), metrics.font_size)
        return T.one(
            fit(holder_title(order(used[0])[0]), Math.max(budget, 60), metrics.font_size),
            total,
        )
    }
    return T.many(used.length, total)
}

const add_rows = (menu, used, with_headers) => {
    const metrics = menu.metrics
    const names = new Map()
    for (const item of used)
        for (const entry of item.processes) {
            const name = holder_title(entry)
            if (!names.has(name)) names.set(name, new Set())
            names.get(name).add(entry.pid)
        }
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
        for (const entry of order(item))
            rows.push(
                build_row(
                    menu,
                    metrics,
                    entry,
                    item.path,
                    names.get(holder_title(entry)).size > 1,
                    with_headers,
                ),
            )
    })
    sync_width(menu, rows)
}

shell.menu_controller.add_menu_listener(ctx => {
    const paths = selected_paths(ctx.context)
    if (!paths.length) return

    const menu = ctx.menu
    // 一个都没被占用是最常见的情况: 一次会话就能判定。先摆占位项再撤掉会闪一下, 所以放在前面
    if (!shell.file_usage.any_in_use(paths)) return

    const placeholder = menu.append_item({ name: T.checking, disabled: true })

    const used = []
    let index = 0
    // 一次只查一个: 单次查询要 150ms 上下, 一次查完选中的上百个文件会把菜单卡死
    const collect = () => {
        try {
            if (!menu.valid()) return
            const processes = [...shell.file_usage.query(paths[index])]
            if (processes.length) used.push({ path: paths[index], processes })
            if (++index < paths.length) {
                shell.infra.setTimeout(collect, 0)
                return
            }
            placeholder.remove()
            if (!used.length) return

            const total = used.reduce((sum, item) => sum + item.processes.length, 0)
            if (used.length === 1 && total === 1) {
                add_rows(menu, used, false)
                return
            }
            menu.append_item({
                name: summary(used, menu.metrics),
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
    }
    shell.infra.setTimeout(collect, 0)
})
