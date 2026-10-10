import * as shell from 'mshell';
import { memo, useEffect, useState, type ReactNode } from './react';
import { COLOR_VARS, Control, FAST, FluentTokens, Font, Icons, Radius, Space, Tone, fluent, toneColor } from './theme';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'accent' | 'danger' | 'success' | 'warning';

const toneColorOf = (tone: TextTone, c: FluentTokens) => {
    switch (tone) {
        case 'secondary':
            return c.textSecondary;
        case 'tertiary':
            return c.textTertiary;
        case 'disabled':
            return c.textDisabled;
        case 'accent':
            return c.accent;
        case 'danger':
            return toneColor('danger', c).fg;
        case 'success':
            return toneColor('success', c).fg;
        case 'warning':
            return toneColor('warning', c).fg;
        default:
            return c.text;
    }
};

export const iconElement = (svg: string, width = 14, color?: string) => {
    const hex = (color ?? (fluent().light ? '#000000E4' : '#FFFFFFFF')).replace('#', '');
    const attrs =
        hex.length === 8
            ? `fill="#${hex.slice(0, 6)}" fill-opacity="${(parseInt(hex.slice(6, 8), 16) / 255).toFixed(3)}"`
            : `fill="#${hex}"`;
    return <img svg={svg.replace('<svg ', `<svg ${attrs} `)} width={width} height={width} />;
};

export const Text = memo(
    ({
        children,
        size = Font.body,
        weight = 400,
        tone = 'primary',
        color,
        maxWidth = -1,
        minWidth,
        ellipsis,
        lineHeight,
        fontFamily = 'main'
    }: {
        children: string | number | (string | number)[];
        size?: number;
        weight?: number;
        tone?: TextTone;
        color?: string;
        maxWidth?: number;
        minWidth?: number;
        ellipsis?: boolean;
        lineHeight?: number;
        fontFamily?: 'main' | 'monospace' | 'fallback';
    }) => {
        const c = fluent();
        return (
            <text
                text={Array.isArray(children) ? children.join('') : String(children)}
                fontSize={size}
                maxWidth={maxWidth}
                {...(minWidth !== undefined ? { minWidth } : {})}
                color={color ?? toneColorOf(tone, c)}
                fontWeight={weight}
                fontFamily={fontFamily}
                {...(lineHeight !== undefined ? { lineHeight } : {})}
                {...(ellipsis ? { textOverflow: 'ellipsis' } : {})}
            />
        );
    }
);

export const useHoverActive = () => {
    const [isHovered, setHovered] = useState(false);
    const [isActive, setActive] = useState(false);
    return {
        isHovered,
        isActive,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => {
            setHovered(false);
            setActive(false);
        },
        onMouseDown: () => setActive(true),
        onMouseUp: () => setActive(false)
    };
};

const useEntrance = (delay: number) => {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = setTimeout(() => setShown(true), 16 + delay);
        return () => clearTimeout(id);
    }, []);
    return shown;
};

const ENTRANCE_VARS = ['opacity', 'padding_top', 'padding_bottom'];

export const Entrance = ({ delay = 0, offset = 6, children }: { delay?: number; offset?: number; children?: ReactNode }) => {
    const shown = useEntrance(delay);
    return (
        <flex
            opacity={shown ? 255 : 0}
            paddingTop={shown ? 0 : offset}
            alignItems="stretch"
            animatedVars={ENTRANCE_VARS}
            animationCurve={{ duration: 180, easing: 'ease_out', vars: ENTRANCE_VARS }}
        >
            {children}
        </flex>
    );
};

export const Divider = ({ vertical }: { vertical?: boolean }) => {
    const c = fluent();
    return vertical ? <flex width={1} backgroundColor={c.divider} /> : <flex height={1} backgroundColor={c.divider} />;
};

export const Pill = ({ text, fg, bg, size = Font.tiny }: { text: string; fg: string; bg: string; size?: number }) => (
    <flex
        horizontal
        height={size + 9}
        backgroundColor={bg}
        borderRadius={Radius.sm}
        paddingLeft={Space.sm}
        paddingRight={Space.sm}
        alignItems="center"
        justifyContent="center"
    >
        <Text size={size} weight={600} color={fg}>
            {text}
        </Text>
    </flex>
);

export const TonePill = ({ tone, text, c, size }: { tone: Tone; text: string; c: FluentTokens; size?: number }) => {
    const style = toneColor(tone, c);
    return <Pill text={text} fg={style.fg} bg={style.bg} size={size} />;
};

export const Panel = ({
    children,
    padding = Space.xl,
    gap = Space.md,
    grow,
    width,
    scroll,
    maxHeight,
    c,
    bordered = true,
    background
}: {
    children?: ReactNode;
    padding?: number;
    gap?: number;
    grow?: boolean;
    width?: number;
    scroll?: boolean;
    maxHeight?: number;
    c: FluentTokens;
    bordered?: boolean;
    background?: string;
}) => (
    <flex
        {...(grow ? { flexGrow: 1, minWidth: 0 } : {})}
        {...(width ? { width, flexShrink: 0 } : {})}
        gap={gap}
        padding={padding}
        borderRadius={Radius.lg}
        borderWidth={bordered ? 1 : 0}
        borderColor={c.cardStroke}
        backgroundColor={background ?? c.card}
        alignItems="stretch"
        {...(scroll ? { enableScrolling: true, enableChildClipping: true } : {})}
        {...(maxHeight ? { maxHeight } : {})}
        scrollBarColor={c.scrollBar}
        scrollBarWidth={5}
        scrollBarRadius={3}
        scrollBarMargin={2}
    >
        {children}
    </flex>
);

export const SectionHeader = ({ title, c, hint }: { title: string; hint?: string; c: FluentTokens }) => (
    <flex horizontal alignItems="center" gap={Space.lg} paddingTop={Space.sm}>
        <Text size={Font.tiny} weight={600} tone="tertiary">
            {title}
        </Text>
        <flex flexGrow={1} height={1} backgroundColor={c.divider} />
        {hint && (
            <Text size={Font.tiny} tone="tertiary">
                {hint}
            </Text>
        )}
    </flex>
);

type ButtonVariant = 'accent' | 'standard' | 'subtle' | 'danger';

export const Button = ({
    label,
    icon,
    onClick,
    variant = 'standard',
    disabled,
    size = Font.body,
    iconSize = 14,
    minWidth,
    grow,
    tone
}: {
    label?: string;
    icon?: string;
    onClick: () => void;
    variant?: ButtonVariant;
    disabled?: boolean;
    size?: number;
    iconSize?: number;
    minWidth?: number;
    grow?: boolean;
    tone?: Tone;
}) => {
    const c = fluent();
    const hover = useHoverActive();
    const accent = variant === 'accent';
    const danger = variant === 'danger';
    const height = size + 19;
    const pressed = hover.isActive && !disabled;
    const hovered = hover.isHovered && !disabled;
    const dangerTone = toneColor('danger', c);

    const bg = disabled
        ? c.subtle
        : accent
          ? pressed
              ? c.accentPressed
              : hovered
                ? c.accentHover
                : c.accent
          : danger
            ? pressed
                ? c.controlPressed
                : hovered
                  ? dangerTone.bg
                  : c.control
            : variant === 'subtle'
              ? pressed
                  ? c.subtlePressed
                  : hovered
                    ? c.subtleHover
                    : c.transparent
              : pressed
                ? c.controlPressed
                : hovered
                  ? c.controlHover
                  : c.control;

    const fg = disabled
        ? c.textDisabled
        : accent
          ? c.accentText
          : danger
            ? dangerTone.fg
            : hovered || pressed
              ? c.text
              : tone
                ? toneColor(tone, c).fg
                : c.text;

    return (
        <flex
            horizontal
            alignItems="center"
            justifyContent="center"
            gap={Space.md}
            height={height}
            {...(minWidth ? { minWidth } : {})}
            {...(grow ? { flexGrow: 1 } : {})}
            paddingLeft={label ? Space.lg : Space.md}
            paddingRight={label ? Space.lg : Space.md}
            borderRadius={Radius.md}
            borderWidth={variant === 'standard' || danger ? 1 : 0}
            borderColor={c.controlStroke}
            backgroundColor={bg}
            opacity={disabled ? 140 : 255}
            onClick={() => {
                if (!disabled) onClick();
            }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {icon && iconElement(icon, iconSize, fg)}
            {label && (
                <Text size={size} color={fg}>
                    {label}
                </Text>
            )}
        </flex>
    );
};

export const IconButton = ({
    icon,
    onClick,
    size = 32,
    iconSize = 15,
    tone = 'secondary',
    variant = 'ghost'
}: {
    icon: string;
    onClick: () => void;
    size?: number;
    iconSize?: number;
    tone?: TextTone;
    variant?: 'ghost' | 'standard';
}) => {
    const c = fluent();
    const hover = useHoverActive();
    return (
        <flex
            width={size}
            height={size}
            borderRadius={Radius.md}
            borderWidth={variant === 'standard' ? 1 : 0}
            borderColor={c.controlStroke}
            justifyContent="center"
            alignItems="center"
            backgroundColor={
                hover.isActive ? c.controlPressed : hover.isHovered ? c.controlHover : variant === 'standard' ? c.control : c.transparent
            }
            onClick={onClick}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {iconElement(icon, iconSize, toneColorOf(tone, c))}
        </flex>
    );
};

export const InfoBar = ({
    severity,
    title,
    message,
    children,
    maxTextWidth = 420
}: {
    severity: 'info' | 'success' | 'warning' | 'danger';
    title: string;
    message?: string;
    children?: ReactNode;
    maxTextWidth?: number;
}) => {
    const c = fluent();
    const style = toneColor(severity, c);
    const glyph = severity === 'info' ? 'i' : severity === 'success' ? '✓' : '!';
    return (
        <flex
            horizontal
            gap={Space.lg}
            padding={Space.lg}
            borderRadius={Radius.md}
            backgroundColor={style.bg}
            borderColor={c.cardStroke}
            borderWidth={1}
            alignItems="start"
        >
            <flex width={16} height={16} borderRadius={8} backgroundColor={style.fg} justifyContent="center" alignItems="center">
                <Text size={Font.tiny} weight={700} color={c.light ? '#FFFFFFFF' : '#000000FF'}>
                    {glyph}
                </Text>
            </flex>
            <flex gap={3} flexGrow={1} alignItems="stretch">
                <Text size={Font.body} weight={600} color={c.text} maxWidth={maxTextWidth}>
                    {title}
                </Text>
                {message && (
                    <Text size={Font.small} tone="secondary" maxWidth={maxTextWidth}>
                        {message}
                    </Text>
                )}
                {children}
            </flex>
        </flex>
    );
};

export const ToggleSwitch = ({
    value,
    onChange,
    label,
    description
}: {
    value: boolean;
    onChange: (next: boolean) => void;
    label?: string;
    description?: string;
}) => {
    const c = fluent();
    const hover = useHoverActive();
    const knob = hover.isActive || hover.isHovered ? 14 : 12;
    const knobWidth = hover.isActive ? 17 : knob;
    const track = value
        ? hover.isActive
            ? c.accentPressed
            : hover.isHovered
              ? c.accentHover
              : c.accent
        : hover.isActive
          ? c.subtlePressed
          : hover.isHovered
            ? c.subtleHover
            : c.transparent;
    return (
        <flex
            horizontal
            alignItems="center"
            gap={Space.lg}
            flexGrow={1}
            onClick={() => onChange(!value)}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
        >
            {label && (
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text size={Font.body} color={c.text}>
                        {label}
                    </Text>
                    {description && (
                        <Text size={Font.tiny} tone="tertiary">
                            {description}
                        </Text>
                    )}
                </flex>
            )}
            <flex
                horizontal
                width={40}
                height={20}
                borderRadius={10}
                borderWidth={value ? 0 : 1}
                borderColor={c.controlStrong}
                backgroundColor={track}
                justifyContent={value ? 'end' : 'start'}
                alignItems="center"
                paddingLeft={knob === 12 ? 4 : 3}
                paddingRight={knob === 12 ? 4 : 3}
                animatedVars={COLOR_VARS}
                animationCurve={{ ...FAST, vars: COLOR_VARS }}
            >
                <flex
                    width={knobWidth}
                    height={knob}
                    borderRadius={7}
                    backgroundColor={value ? c.accentText : c.textSecondary}
                    animatedVars={['x', 'width', 'height']}
                    animationCurve={{ duration: 160, easing: 'ease_out', vars: ['x', 'width', 'height'] }}
                />
            </flex>
        </flex>
    );
};

export const TextField = ({
    value,
    onChange,
    placeholder,
    width,
    grow,
    minWidth,
    height = Control.height,
    disabled,
    mono,
    size = Font.body,
    onKeyDown,
    onBlur
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    width?: number;
    grow?: boolean;
    minWidth?: number;
    height?: number;
    disabled?: boolean;
    mono?: boolean;
    size?: number;
    onKeyDown?: (key: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean) => boolean;
    onBlur?: () => void;
}) => {
    const c = fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            {...(width ? { width, flexShrink: 0 } : {})}
            {...(grow ? { flexGrow: 1 } : {})}
            {...(minWidth ? { minWidth } : {})}
            height={height}
            fontSize={mono ? Font.small : size}
            disabled={disabled}
            borderRadius={Radius.md}
            paddingX={Space.md}
            backgroundColor={c.control}
            disabledBackgroundColor={c.subtle}
            borderColor={c.controlStroke}
            focusBorderColor={c.accent}
            textColor={c.text}
            disabledTextColor={c.textDisabled}
            placeholderColor={c.textTertiary}
            caretColor={c.text}
            selectionColor={c.accentSubtle}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
        />
    );
};

export const TextArea = ({
    value,
    onChange,
    placeholder,
    height = 168,
    grow
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    height?: number;
    grow?: boolean;
}) => {
    const c = fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            height={height}
            {...(grow ? { flexGrow: 1 } : {})}
            fontSize={Font.small}
            borderRadius={Radius.md}
            paddingX={Space.md}
            paddingY={Space.md}
            backgroundColor={c.codeBg}
            borderColor={c.controlStroke}
            focusBorderColor={c.accent}
            textColor={c.text}
            placeholderColor={c.textTertiary}
            caretColor={c.text}
            selectionColor={c.accentSubtle}
            onChange={onChange}
        />
    );
};

const KEY_ENTER = 257;
const KEY_ESCAPE = 256;
const KEY_UP = 265;
const KEY_DOWN = 264;

const stepDecimals = (step: number) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)));
const formatNumber = (value: number, step: number) => {
    const text = value.toFixed(stepDecimals(step));
    return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
};
const snapTo = (value: number, min: number, max: number, step: number) => {
    const snapped = Math.round((value - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(stepDecimals(step)));
};

export const NumberField = ({
    value,
    min,
    max,
    step = 1,
    onChange,
    width = 96,
    suffix
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (next: number) => void;
    width?: number;
    suffix?: string;
}) => {
    const c = fluent();
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? formatNumber(value, step);
    const commit = (text: string | null = draft) => {
        setDraft(null);
        if (text === null) return;
        const parsed = parseFloat(text.trim());
        if (!Number.isFinite(parsed)) return;
        const next = snapTo(parsed, min, max, step);
        if (next !== value) onChange(next);
    };
    return (
        <flex horizontal alignItems="center" gap={Space.md}>
            <textbox
                value={shown}
                width={width}
                height={Control.height}
                fontSize={Font.body}
                borderRadius={Radius.md}
                paddingX={Space.md}
                backgroundColor={c.control}
                borderColor={c.controlStroke}
                focusBorderColor={c.accent}
                textColor={c.text}
                placeholderColor={c.textTertiary}
                caretColor={c.text}
                selectionColor={c.accentSubtle}
                onChange={setDraft}
                onBlur={() => commit()}
                onKeyDown={(key: number) => {
                    if (key === KEY_ENTER) {
                        commit();
                        return true;
                    }
                    if (key === KEY_ESCAPE) {
                        setDraft(null);
                        return true;
                    }
                    if (key === KEY_UP || key === KEY_DOWN) {
                        const base = draft !== null && Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : value;
                        setDraft(null);
                        const next = snapTo(base + (key === KEY_UP ? step : -step), min, max, step);
                        if (next !== value) onChange(next);
                        return true;
                    }
                    return false;
                }}
            />
            {suffix && (
                <Text size={Font.small} tone="tertiary">
                    {suffix}
                </Text>
            )}
        </flex>
    );
};

export const ComboBox = ({
    value,
    options,
    onChange,
    width,
    grow,
    minWidth = 120
}: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (next: string) => void;
    width?: number;
    grow?: boolean;
    minWidth?: number;
}) => {
    const c = fluent();
    const hover = useHoverActive();
    const current = options.find(option => option.value === value);
    const open = () => {
        const menu = shell.menu_controller.create_detached();
        for (const option of options) {
            menu.append_menu({
                name: option.label,
                icon_svg: option.value === value ? Icons.check : undefined,
                action() {
                    onChange(option.value);
                    menu.close();
                }
            });
        }
        menu.show_at_cursor();
    };
    return (
        <flex
            horizontal
            {...(width ? { width, flexShrink: 0 } : {})}
            {...(grow ? { flexGrow: 1 } : {})}
            minWidth={minWidth}
            height={Control.height}
            alignItems="center"
            gap={Space.sm}
            paddingLeft={Space.lg}
            paddingRight={Space.md}
            borderRadius={Radius.md}
            borderWidth={1}
            borderColor={hover.isHovered ? c.controlStrong : c.controlStroke}
            backgroundColor={hover.isActive ? c.controlPressed : hover.isHovered ? c.controlHover : c.control}
            onClick={open}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <Text size={Font.body} tone="primary" ellipsis>
                {current?.label ?? value}
            </Text>
            <spacer />
            {iconElement(Icons.chevronDown, 14, c.textSecondary)}
        </flex>
    );
};

const Segment = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => {
    const c = fluent();
    const hover = useHoverActive();
    return (
        <flex
            horizontal
            alignItems="center"
            height={Control.heightSm}
            paddingLeft={Space.lg}
            paddingRight={Space.lg}
            borderRadius={Radius.sm}
            onClick={onClick}
            backgroundColor={selected ? c.controlSolid : hover.isHovered ? c.subtleHover : c.transparent}
            borderColor={selected ? c.controlStroke : c.transparent}
            borderWidth={1}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <Text size={Font.small} weight={selected ? 600 : 400} tone={selected ? 'primary' : 'secondary'}>
                {label}
            </Text>
        </flex>
    );
};

export const Segmented = ({
    options,
    value,
    onChange
}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (next: string) => void;
}) => {
    const c = fluent();
    return (
        <flex horizontal gap={2} padding={2} borderRadius={Radius.lg} backgroundColor={c.subtle} borderColor={c.cardStroke} borderWidth={1}>
            {options.map(option => (
                <Segment key={option.value} label={option.label} selected={option.value === value} onClick={() => onChange(option.value)} />
            ))}
        </flex>
    );
};

export const Chip = ({ label, onClick, icon }: { label: string; onClick: () => void; icon?: string }) => {
    const c = fluent();
    const hover = useHoverActive();
    return (
        <flex
            horizontal
            alignItems="center"
            gap={5}
            height={Control.heightSm}
            paddingLeft={Space.lg}
            paddingRight={Space.lg}
            borderRadius={Control.heightSm / 2}
            onClick={onClick}
            borderWidth={1}
            borderColor={c.controlStroke}
            backgroundColor={hover.isActive ? c.controlPressed : hover.isHovered ? c.controlHover : c.control}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {icon && iconElement(icon, 12, c.textSecondary)}
            <Text size={Font.small} tone="secondary">
                {label}
            </Text>
        </flex>
    );
};

export const EmptyState = ({
    icon,
    title,
    message,
    children
}: {
    icon: string;
    title: string;
    message?: string;
    children?: ReactNode;
}) => {
    const c = fluent();
    return (
        <flex flexGrow={1} alignItems="center" justifyContent="center" gap={Space.lg} padding={36}>
            <flex width={44} height={44} borderRadius={Radius.xl} backgroundColor={c.accentSubtle} justifyContent="center" alignItems="center">
                {iconElement(icon, 22, c.accent)}
            </flex>
            <Text size={Font.heading} weight={600}>
                {title}
            </Text>
            {message && (
                <Text size={Font.small} tone="secondary" maxWidth={360}>
                    {message}
                </Text>
            )}
            {children}
        </flex>
    );
};

// 左边固定宽度标签, 右边控件撑满剩余宽度, 所有行右边缘自然对齐。
export const FieldRow = ({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) => (
    <flex horizontal alignItems="center" gap={Space.lg} minHeight={Control.height}>
        <flex gap={1} width={Control.label} flexShrink={0}>
            <Text size={Font.body} tone="secondary" ellipsis>
                {label}
            </Text>
            {hint && (
                <Text size={Font.tiny} tone="tertiary">
                    {hint}
                </Text>
            )}
        </flex>
        <flex horizontal alignItems="center" gap={Space.md} flexGrow={1} flexShrink={1}>
            {children}
        </flex>
    </flex>
);

export const StackedRow = ({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) => (
    <flex gap={Space.sm} alignItems="stretch" paddingTop={Space.xs} paddingBottom={Space.xs}>
        <flex gap={1}>
            <Text size={Font.body} tone="secondary">
                {label}
            </Text>
            {hint && (
                <Text size={Font.tiny} tone="tertiary" maxWidth={420}>
                    {hint}
                </Text>
            )}
        </flex>
        {children}
    </flex>
);
