// 按 breeze-shell/src/shell/script/binding_types.d.ts 手写的子集: 官方 breeze-shell-types 落后于运行时
declare module 'mshell' {
    export function println(...args: unknown[]): void;

    export class value_reset { }

    export class rgba_prop { }

    export class breeze_ui { }
    export namespace breeze_ui {
        export class js_widget {
            x: number;
            y: number;
            width: number;
            height: number;
            cursor: string | undefined;
            children(): js_widget[];
            append_child(child: js_widget): void;
            prepend_child(child: js_widget): void;
            remove_child(child: js_widget): void;
            append_child_after(child: js_widget, after_index: number): void;
            set_animation(variable_name: string, enabled: boolean): void;
            set_animation_curve(variable_name: string, duration: number, easing: string): void;
            downcast(): js_widget;
        }

        export class js_text_widget extends js_widget {
            text: string;
            font_size: number;
            font_weight: number;
            max_width: number;
            font_family: string;
            color: [number, number, number, number] | undefined;
        }

        export class js_textbox_widget extends js_widget {
            text: string;
            placeholder: string;
            font_size: number;
            font_weight: number;
            padding_x: number;
            padding_y: number;
            border_radius: number;
            min_height: number;
            preferred_multiline_height: number;
            line_height_multiplier: number;
            multiline: boolean;
            readonly: boolean;
            disabled: boolean;
            background_color: rgba_prop;
            border_color: rgba_prop;
            focus_border_color: rgba_prop;
            text_color: rgba_prop;
            placeholder_color: rgba_prop;
            selection_color: rgba_prop;
            caret_color: rgba_prop;
            on_change: (value: string) => void;
            on_focus: () => void;
            on_blur: () => void;
            on_key_down: (key: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean) => boolean;
            selection_start: number;
            selection_end: number;
            focus(): void;
            blur(): void;
            select_all(): void;
            select_range(start: number, end: number): void;
            set_selection(start: number, end: number): void;
            insert_text(new_text: string): void;
            delete_text(start: number, end: number): void;
            clear(): void;
            copy(): void;
            cut(): void;
            paste(): void;
        }

        export class js_flex_layout_widget extends js_widget {
            auto_size: boolean;
            horizontal: boolean;
            padding_left: number;
            padding_right: number;
            padding_top: number;
            padding_bottom: number;
            flex_grow: number;
            flex_shrink: number;
            max_height: number;
            enable_scrolling: boolean;
            enable_child_clipping: boolean;
            crop_overflow: boolean;
            padding: [number, number, number, number];
            on_click: (key: number) => void;
            on_mouse_move: (x: number, y: number) => void;
            on_mouse_enter: () => void;
            on_mouse_leave: () => void;
            on_mouse_down: () => void;
            on_mouse_up: () => void;
            justify_content: string;
            align_items: string;
            background_color: [number, number, number, number] | undefined;
            border_color: [number, number, number, number] | undefined;
            border_radius: number;
            border_width: number;
            opacity: number;
            gap: number;
            set_padding(left: number, right: number, top: number, bottom: number): void;
        }

        export class js_image_widget extends js_widget {
            svg: string;
        }

        export class js_spacer_widget extends js_widget {
            size: number;
        }

        export class widgets_factory {
            static create_text_widget(): js_text_widget;
            static create_textbox_widget(): js_textbox_widget;
            static create_flex_layout_widget(): js_flex_layout_widget;
            static create_image_widget(): js_image_widget;
            static create_spacer_widget(): js_spacer_widget;
        }

        export class breeze_paint {
            static from_color(color: string): breeze_paint;
        }

        export class window {
            root_widget: js_widget;
            static create(title: string, width: number, height: number): window;
            static create_ex(title: string, width: number, height: number, on_close: () => void): window;
            close(): void;
        }
    }

    export class folder_view_folder_item {
        index: number;
        parent_path: string;
        name(): string;
        modify_date(): string;
        path(): string;
        size(): number;
        type(): string;
        select(state: number): void;
    }

    export class folder_view_controller {
        current_path: string;
        focused_file_path: string;
        selected_files: string[];
        change_folder(new_folder_path: string): void;
        open_file(file_path: string): void;
        open_folder(folder_path: string): void;
        refresh(): void;
        copy(): void;
        cut(): void;
        paste(): void;
        items(): folder_view_folder_item[];
        select(index: number, state: number): void;
        select_none(): void;
    }

    export class window_titlebar_controller {
        is_click_in_titlebar: boolean;
        title: string;
        executable_path: string;
        hwnd: number;
    }

    export class input_box_controller {
        text: string;
        placeholder: string;
        multiline: boolean;
        readonly: boolean;
        disabled: boolean;
        focus(): void;
        blur(): void;
        select_all(): void;
    }

    export class js_menu_action_event_data { }

    export class js_menu_data {
        type?: string;
        name?: string;
        submenu?: ((menu: menu_controller) => void) | value_reset;
        action?: ((event: js_menu_action_event_data) => void) | value_reset;
        icon_svg?: string | value_reset;
        icon_bitmap?: number | value_reset;
        disabled?: boolean;
        wID?: number;
        name_resid?: string;
        origin_name?: string;
        hotkey?: string;
    }

    export class menu_item_controller {
        position: number;
        visible: boolean;
        update_data(data: js_menu_data): void;
        data(): js_menu_data;
        children(): menu_item_controller[];
        remove(): void;
        valid(): boolean;
    }

    export class menu_item_parent_item_controller {
        position: number;
        children(): menu_item_controller[];
        remove(): void;
        valid(): boolean;
        append_child_after(data: js_menu_data, after_index: number): menu_item_controller;
        append_child(data: js_menu_data): menu_item_controller;
        prepend_child(data: js_menu_data): menu_item_controller;
    }

    export class window_prop_data {
        key: string;
        value: number | string;
    }

    export class caller_window_data {
        props: window_prop_data[];
        x: number;
        y: number;
        width: number;
        height: number;
        maximized: boolean;
        minimized: boolean;
        focused: boolean;
        visible: boolean;
        executable_path: string;
        title: string;
        class_name: string;
    }

    export class js_menu_context {
        folder_view?: folder_view_controller;
        window_titlebar?: window_titlebar_controller;
        input_box?: input_box_controller;
        window_info: caller_window_data;
    }

    export class screenside_button_controller {
        add_button(icon_svg: string, on_click: () => void): void;
    }

    export class menu_info_basic_js {
        menu: menu_controller;
        context: js_menu_context;
        screenside_button: screenside_button_controller;
    }

    export class menu_controller {
        readonly widget?: breeze_ui.js_widget;
        readonly items: menu_item_controller[];
        valid(): boolean;
        append_item_after(data: js_menu_data, after_index: number): menu_item_controller;
        append_widget_after(widget: breeze_ui.js_widget, after_index: number): void;
        append_parent_item_after(after_index: number): menu_item_parent_item_controller;
        append_parent_item(): menu_item_parent_item_controller;
        prepend_parent_item(): menu_item_parent_item_controller;
        append_item(data: js_menu_data): menu_item_controller;
        prepend_item(data: js_menu_data): menu_item_controller;
        prepend_spacer(): void;
        append_spacer(): void;
        close(): void;
        clear(): void;
        get_item(index: number): menu_item_controller;
        static add_menu_listener(listener: (info: menu_info_basic_js) => void): () => void;
        prepend_menu(data: js_menu_data): menu_item_controller;
        append_menu(data: js_menu_data): menu_item_controller;
        append_menu_after(data: js_menu_data, after_index: number): menu_item_controller;
        static create_detached(): menu_controller;
        show_at(x: number, y: number): void;
        show_at_cursor(): void;
    }

    export class clipboard {
        static text: string;
        static read_text(): string;
        static write_text(text: string): void;
    }

    export class subproc_result_data {
        out: string;
        err: string;
        code: number;
    }

    export class subproc {
        static run(cmd: string): subproc_result_data;
        static run_async(cmd: string, callback: (result: subproc_result_data) => void): void;
        static open(path: string, args: string): void;
        static open_async(path: string, args: string, callback: () => void): void;
    }

    export class fs {
        static cwd(): string;
        static chdir(path: string): void;
        static exists(path: string): boolean;
        static isdir(path: string): boolean;
        static mkdir(path: string): void;
        static rmdir(path: string): void;
        static rename(old_path: string, new_path: string): void;
        static remove(path: string): void;
        static copy(src_path: string, dest_path: string): void;
        static move(src_path: string, dest_path: string): void;
        static read(path: string): string;
        static write(path: string, data: string): void;
        static readdir(path: string): string[];
        static watch(path: string, callback: (path: string, type: number) => void): () => void;
    }

    export class breeze {
        static version(): string;
        static data_directory(): string;
        static is_light_theme(): boolean;
        static user_language(): string;
        static can_reload_js(): boolean;
        static allow_js_reload(can: boolean): void;
        static should_show_settings_button(): boolean;
        static current_process_name(): string;
        static file_size(path: string): number;
    }

    export class win32 {
        static env(name: string): string | undefined;
        static simulate_hotkeys(keys: string[]): void;
    }

    export class notification {
        static send_basic(message: string): void;
        static send_with_buttons(title: string, message: string, buttons: [string, () => void][]): void;
    }

    export class infra {
        static setTimeout(callback: () => void, delay: number): number;
        static clearTimeout(id: number): void;
        static setInterval(callback: () => void, delay: number): number;
        static clearInterval(id: number): void;
        static atob(base64: string): string;
        static btoa(text: string): string;
    }
}
