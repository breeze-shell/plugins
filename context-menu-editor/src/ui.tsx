import * as shell from 'mshell';
import { memo, useEffect, useRef, useState, type ReactNode } from './react';
import { COLOR_VARS, EASE_OUT, FAST, FluentTokens, Icons, Tone, fluent, toneColor } from './theme';

export const iconElement = (svg: string, width = 14, color?: string) => {
    const hex = (color ?? (fluent().light ? '#000000E4' : '#FFFFFFFF')).replace('#', '');
    const attrs =
        hex.length === 8
            ? `fill="#${hex.slice(0, 6)}" fill-opacity="${(parseInt(hex.slice(6, 8), 16) / 255).toFixed(3)}"`
            : `fill="#${hex}"`;
    return <img svg={svg.replace('<svg ', `<svg ${attrs} `)} width={width} height={width} />;
};

const slot = (children: unknown) => children as ReactNode;

const withOpacity = (color: string, opacity: number) => {
    const hex = color.replace('#', '');
    if (opacity >= 255) return `#${hex}`;
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    const scaled = Math.round((alpha * Math.max(0, opacity)) / 255);
    return `#${hex.slice(0, 6)}${scaled.toString(16).padStart(2, '0').toUpperCase()}`;
};

const clip = (text: string, limit?: number) => (limit !== undefined && limit > 0 && text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

export const Text = memo(
    ({
        text,
        c,
        fontSize = 14,
        fontWeight = 400,
        color,
        maxWidth = -1,
        fontFamily = 'main',
        opacity = 255,
        truncate,
        width,
        flexGrow
    }: {
        text: string;
        c?: FluentTokens;
        fontSize?: number;
        fontWeight?: number;
        color?: string;
        maxWidth?: number;
        fontFamily?: 'main' | 'monospace' | 'fallback';
        opacity?: number;
        truncate?: number;
        width?: number;
        flexGrow?: number;
    }) => {
        const tokens = c ?? fluent();
        return (
            <text
                text={clip(text, truncate)}
                fontSize={fontSize}
                maxWidth={maxWidth}
                color={withOpacity(color ?? tokens.text, opacity)}
                fontWeight={fontWeight}
                fontFamily={fontFamily}
                {...(width !== undefined ? { width } : {})}
                {...(flexGrow !== undefined ? { flexGrow } : {})}
            />
        );
    }
);

export const Divider = ({ vertical, color, c }: { vertical?: boolean; color?: string; c?: FluentTokens }) => {
    const tokens = c ?? fluent();
    return vertical ? <flex width={1} backgroundColor={color ?? tokens.divider} /> : <flex height={1} backgroundColor={color ?? tokens.divider} />;
};

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

export const Entrance = ({ delay = 0, offset = 8, children }: { delay?: number; offset?: number; children?: ReactNode; c?: FluentTokens }) => {
    const shown = useEntrance(delay);
    return (
        <flex
            opacity={shown ? 255 : 0}
            paddingTop={shown ? 0 : offset}
            paddingBottom={shown ? offset : 0}
            alignItems="stretch"
            animatedVars={ENTRANCE_VARS}
            animationCurve={{ duration: 200, easing: 'ease_out', vars: ENTRANCE_VARS }}
        >
            {children}
        </flex>
    );
};

export const Pill = ({
    text,
    fg,
    bg,
    fontSize = 11,
    c
}: {
    text: string;
    fg: string;
    bg: string;
    fontSize?: number;
    c?: FluentTokens;
}) => {
    const height = Math.round(fontSize * 1.65 + 2);
    return (
        <flex
            horizontal
            height={height}
            backgroundColor={bg}
            borderRadius={Math.round(height / 2)}
            paddingLeft={8}
            paddingRight={8}
            alignItems="center"
            justifyContent="center"
        >
            <Text c={c} text={text} fontSize={fontSize} fontWeight={600} color={fg} />
        </flex>
    );
};

export const Badge = ({ text, fg, bg, fontSize = 11, c }: { text: string; fg: string; bg: string; fontSize?: number; c?: FluentTokens }) => (
    <flex
        horizontal
        height={Math.round(fontSize * 1.5 + 4)}
        backgroundColor={bg}
        borderRadius={4}
        paddingLeft={6}
        paddingRight={6}
        alignItems="center"
        justifyContent="center"
    >
        <Text c={c} text={text} fontSize={fontSize} fontWeight={600} color={fg} />
    </flex>
);

export const TonePill = ({ tone, text, c, fontSize }: { tone: Tone; text: string; c?: FluentTokens; fontSize?: number }) => {
    const tokens = c ?? fluent();
    const style = toneColor(tone, tokens);
    return <Pill c={tokens} text={text} fg={style.fg} bg={style.bg} fontSize={fontSize} />;
};

export const Button = ({
    label,
    icon,
    onClick,
    variant = 'standard',
    disabled,
    iconSize = 14,
    minWidth,
    height = 32,
    flexGrow,
    c
}: {
    label?: string;
    icon?: string;
    onClick?: () => void;
    variant?: 'standard' | 'accent' | 'subtle' | 'danger';
    disabled?: boolean;
    iconSize?: number;
    minWidth?: number;
    height?: number;
    flexGrow?: number;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const hover = useHoverActive();
    const accent = variant === 'accent';
    const pressed = hover.isActive && !disabled;
    const hovered = hover.isHovered && !disabled;
    const bg = accent
        ? disabled
            ? tokens.subtle
            : pressed
              ? tokens.accentPressed
              : hovered
                ? tokens.accentHover
                : tokens.accent
        : variant === 'danger'
          ? pressed || hovered
              ? tokens.dangerTintHover
              : tokens.dangerTint
          : variant === 'subtle'
            ? pressed
                ? tokens.subtlePressed
                : hovered
                  ? tokens.subtleHover
                  : tokens.transparent
            : pressed
              ? tokens.controlPressed
              : hovered
                ? tokens.controlHover
                : tokens.control;
    const fg = disabled ? tokens.textDisabled : accent ? tokens.accentText : variant === 'danger' ? tokens.dangerText : tokens.text;
    return (
        <flex
            horizontal
            alignItems="center"
            justifyContent="center"
            gap={8}
            height={height}
            {...(minWidth ? { width: minWidth } : {})}
            {...(flexGrow !== undefined ? { flexGrow } : {})}
            paddingLeft={label ? 12 : 9}
            paddingRight={label ? 12 : 9}
            borderRadius={5}
            borderWidth={variant === 'accent' ? 0 : 1}
            borderColor={tokens.controlStroke}
            backgroundColor={bg}
            opacity={disabled ? 130 : 255}
            onClick={() => {
                if (!disabled) onClick?.();
            }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {icon && iconElement(icon, iconSize, fg)}
            {label && <Text c={tokens} text={label} fontSize={13} color={fg} />}
        </flex>
    );
};

export const IconButton = ({
    icon,
    onClick,
    accent,
    disabled,
    c
}: {
    icon: string;
    label?: string;
    onClick?: () => void;
    accent?: boolean;
    disabled?: boolean;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const hover = useHoverActive();
    const fg = disabled ? tokens.textDisabled : accent ? tokens.accent : hover.isHovered ? tokens.text : tokens.textSecondary;
    return (
        <flex
            horizontal
            width={30}
            height={30}
            alignItems="center"
            justifyContent="center"
            borderRadius={5}
            backgroundColor={disabled ? tokens.transparent : hover.isActive ? tokens.controlPressed : hover.isHovered ? tokens.controlHover : tokens.transparent}
            opacity={disabled ? 130 : 255}
            onClick={() => {
                if (!disabled) onClick?.();
            }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {iconElement(icon, 15, fg)}
        </flex>
    );
};

const toneIcon = (tone: Tone) => (tone === 'success' ? Icons.success : tone === 'warning' ? Icons.warning : tone === 'danger' ? Icons.error : Icons.info);

const severityTone = (severity: string): Tone => (severity === 'success' || severity === 'warning' || severity === 'danger' ? severity : 'info');

export const InfoBar = ({
    severity,
    title,
    message,
    children,
    maxTextWidth = 420,
    c
}: {
    severity: string;
    title: string;
    message?: string;
    children?: unknown;
    maxTextWidth?: number;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const tone = severityTone(severity);
    const style = toneColor(tone, tokens);
    return (
        <flex horizontal gap={12} padding={12} borderRadius={6} backgroundColor={style.bg} borderColor={tokens.cardStroke} borderWidth={1} alignItems="start">
            <flex paddingTop={1}>{iconElement(toneIcon(tone), 16, style.fg)}</flex>
            <flex gap={3} flexGrow={1} alignItems="stretch">
                <Text c={tokens} text={title} fontSize={13} fontWeight={600} color={tokens.text} maxWidth={maxTextWidth} />
                {message && <Text c={tokens} text={message} fontSize={12} color={tokens.textSecondary} maxWidth={maxTextWidth} />}
                {slot(children)}
            </flex>
        </flex>
    );
};

export const ToggleSwitch = ({
    value,
    onChange,
    label,
    description,
    disabled,
    c
}: {
    value: boolean;
    onChange: (next: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const hover = useHoverActive();
    const knob = hover.isActive || hover.isHovered ? 14 : 12;
    const knobWidth = hover.isActive ? 17 : knob;
    const track = value
        ? hover.isActive
            ? tokens.accentPressed
            : hover.isHovered
              ? tokens.accentHover
              : tokens.accent
        : hover.isActive
          ? tokens.subtlePressed
          : hover.isHovered
            ? tokens.subtleHover
            : tokens.transparent;
    return (
        <flex
            horizontal
            alignItems="center"
            gap={12}
            flexGrow={1}
            opacity={disabled ? 130 : 255}
            onClick={() => {
                if (!disabled) onChange(!value);
            }}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
        >
            {label && (
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text c={tokens} text={label} fontSize={13} color={disabled ? tokens.textDisabled : tokens.text} />
                    {description && <Text c={tokens} text={description} fontSize={12} color={tokens.textSecondary} maxWidth={420} />}
                </flex>
            )}
            <flex
                horizontal
                width={40}
                height={20}
                borderRadius={10}
                borderWidth={value ? 0 : 1}
                borderColor={tokens.controlStrong}
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
                    backgroundColor={value ? tokens.accentText : tokens.textSecondary}
                    animatedVars={['x', 'width', 'height', ...COLOR_VARS]}
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
    width = 160,
    flexGrow,
    onFocus,
    onBlur,
    disabled,
    c
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    width?: number;
    flexGrow?: number;
    onFocus?: () => void;
    onBlur?: () => void;
    disabled?: boolean;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            width={width}
            height={32}
            fontSize={13}
            disabled={disabled}
            {...(flexGrow !== undefined ? { flexGrow } : {})}
            borderRadius={5}
            paddingX={10}
            backgroundColor={tokens.control}
            disabledBackgroundColor={tokens.subtle}
            borderColor={tokens.controlStroke}
            focusBorderColor={tokens.accent}
            textColor={tokens.text}
            disabledTextColor={tokens.textDisabled}
            placeholderColor={tokens.textTertiary}
            caretColor={tokens.text}
            selectionColor={tokens.accentSubtle}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
        />
    );
};

export const TextArea = ({
    value,
    onChange,
    placeholder,
    height = 160,
    minHeight,
    flexGrow,
    c
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    height?: number;
    minHeight?: number;
    flexGrow?: number;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            multiline
            minHeight={minHeight ?? height}
            preferredMultilineHeight={height}
            lineHeightMultiplier={1.45}
            {...(flexGrow !== undefined ? { flexGrow } : {})}
            fontSize={12}
            borderRadius={6}
            paddingX={10}
            paddingY={8}
            backgroundColor={tokens.codeBg}
            borderColor={tokens.controlStroke}
            focusBorderColor={tokens.accent}
            textColor={tokens.text}
            placeholderColor={tokens.textTertiary}
            caretColor={tokens.text}
            selectionColor={tokens.accentSubtle}
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
    const base = Number.isFinite(min) ? min : 0;
    const snapped = Math.round((value - base) / step) * step + base;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(stepDecimals(step)));
};

export const NumberBox = ({
    value,
    min,
    max,
    step = 1,
    onChange,
    width = 84,
    suffix,
    c
}: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (next: number) => void;
    width?: number;
    suffix?: string;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const low = min ?? Number.NEGATIVE_INFINITY;
    const high = max ?? Number.POSITIVE_INFINITY;
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? formatNumber(value, step);
    const commit = (text: string | null = draft) => {
        setDraft(null);
        if (text === null) return;
        const parsed = parseFloat(text.trim());
        if (!Number.isFinite(parsed)) return;
        const next = snapTo(parsed, low, high, step);
        if (next !== value) onChange(next);
    };
    return (
        <flex horizontal alignItems="center" gap={6}>
            <textbox
                value={shown}
                width={width}
                height={32}
                fontSize={13}
                borderRadius={5}
                paddingX={10}
                backgroundColor={tokens.control}
                borderColor={tokens.controlStroke}
                focusBorderColor={tokens.accent}
                textColor={tokens.text}
                placeholderColor={tokens.textTertiary}
                caretColor={tokens.text}
                selectionColor={tokens.accentSubtle}
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
                        const next = snapTo(base + (key === KEY_UP ? step : -step), low, high, step);
                        if (next !== value) onChange(next);
                        return true;
                    }
                    return false;
                }}
            />
            {suffix && <Text c={tokens} text={suffix} fontSize={12} color={tokens.textSecondary} />}
        </flex>
    );
};

export const ComboBox = <T,>({
    value,
    options,
    onChange,
    width = 170,
    flexGrow,
    placeholder,
    c
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (next: T) => void;
    width?: number;
    flexGrow?: number;
    placeholder?: string;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
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
            {...(flexGrow !== undefined ? { flexGrow } : { width })}
            height={32}
            alignItems="center"
            paddingLeft={11}
            paddingRight={10}
            borderRadius={5}
            borderWidth={1}
            borderColor={hover.isHovered ? tokens.controlStrong : tokens.controlStroke}
            backgroundColor={hover.isActive ? tokens.controlPressed : hover.isHovered ? tokens.controlHover : tokens.control}
            onClick={open}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <Text
                c={tokens}
                text={current?.label ?? placeholder ?? String(value)}
                fontSize={13}
                color={tokens.text}
                maxWidth={flexGrow !== undefined ? -1 : width - 40}
                truncate={flexGrow !== undefined ? undefined : 22}
            />
            <spacer />
            {iconElement(Icons.chevronDown, 14, tokens.textSecondary)}
        </flex>
    );
};

const Segment = ({
    label,
    badge,
    icon,
    selected,
    onClick,
    c
}: {
    label: string;
    badge?: string;
    icon?: string;
    selected: boolean;
    onClick: () => void;
    c: FluentTokens;
}) => {
    const hover = useHoverActive();
    return (
        <flex
            horizontal
            alignItems="center"
            justifyContent="center"
            gap={6}
            flexGrow={1}
            height={28}
            paddingLeft={10}
            paddingRight={10}
            borderRadius={4}
            onClick={onClick}
            backgroundColor={selected ? c.controlSolid : hover.isHovered ? c.hoverOverlay : c.transparent}
            borderColor={selected ? c.controlStroke : c.transparent}
            borderWidth={1}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {icon && iconElement(icon, 14, selected ? c.accent : c.textSecondary)}
            <Text c={c} text={label} fontSize={12} fontWeight={selected ? 600 : 400} color={selected ? c.text : c.textSecondary} />
            {badge && <Badge c={c} text={badge} fg={c.textSecondary} bg={c.subtle} fontSize={10} />}
        </flex>
    );
};

export const SegmentedControl = <T,>({
    options,
    value,
    onChange,
    flexGrow,
    c
}: {
    options: { value: T; label: string; badge?: string; icon?: string }[];
    value: T;
    onChange: (next: T) => void;
    flexGrow?: number;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return (
        <flex
            horizontal
            gap={2}
            padding={2}
            borderRadius={6}
            backgroundColor={tokens.subtle}
            borderColor={tokens.cardStroke}
            borderWidth={1}
            {...(flexGrow !== undefined ? { flexGrow } : {})}
        >
            {options.map(option => (
                <Segment
                    key={option.label}
                    c={tokens}
                    label={option.label}
                    badge={option.badge}
                    icon={option.icon}
                    selected={option.value === value}
                    onClick={() => onChange(option.value)}
                />
            ))}
        </flex>
    );
};

export const Chip = ({
    label,
    icon,
    fg,
    bg,
    onClick,
    selected,
    c
}: {
    label: string;
    icon?: string;
    fg: string;
    bg: string;
    onClick?: () => void;
    selected?: boolean;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return (
        <flex
            horizontal
            alignItems="center"
            gap={5}
            height={24}
            paddingLeft={icon ? 7 : 9}
            paddingRight={9}
            borderRadius={4}
            backgroundColor={bg}
            borderWidth={1}
            borderColor={selected ? fg : tokens.transparent}
            onClick={onClick}
        >
            {icon && iconElement(icon, 12, fg)}
            <Text c={tokens} text={label} fontSize={12} color={fg} />
        </flex>
    );
};

export const ChipToggle = ({
    label,
    selected,
    onClick,
    color,
    c
}: {
    label: string;
    selected: boolean;
    onClick?: () => void;
    color: { fg: string; bg: string };
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const hover = useHoverActive();
    return (
        <flex
            horizontal
            alignItems="center"
            gap={6}
            height={26}
            paddingLeft={8}
            paddingRight={11}
            borderRadius={13}
            backgroundColor={selected ? color.bg : hover.isHovered ? tokens.hoverOverlay : tokens.transparent}
            borderWidth={1}
            borderColor={selected ? color.fg : tokens.controlStroke}
            onClick={onClick}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <flex width={8} height={8} borderRadius={4} backgroundColor={selected ? color.fg : tokens.controlStrong} />
            <Text c={tokens} text={label} fontSize={12} fontWeight={selected ? 600 : 400} color={selected ? color.fg : tokens.textSecondary} />
        </flex>
    );
};

export const ProgressBar = ({ value, width, c }: { value: number | null; width?: number; c?: FluentTokens }) => {
    const tokens = c ?? fluent();
    const fraction = value === null ? 0.25 : Math.min(1, Math.max(0, value));
    return (
        <flex horizontal {...(width !== undefined ? { width } : { flexGrow: 1 })} height={4} alignItems="center">
            <flex
                {...(width !== undefined ? { width: Math.max(4, fraction * width) } : { flexGrow: fraction, flexShrink: 0 })}
                height={3}
                borderRadius={1.5}
                backgroundColor={tokens.accent}
                animatedVars={['width']}
                animationCurve={{ duration: 200, easing: 'ease_out', vars: ['width'] }}
            />
            <flex flexGrow={Math.max(0, 1 - fraction)} height={1} backgroundColor={tokens.controlStrong} />
        </flex>
    );
};

export const EmptyState = ({
    icon,
    title,
    message,
    children,
    c
}: {
    icon?: string;
    title: string;
    message?: string;
    children?: unknown;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return (
        <flex flexGrow={1} alignItems="center" justifyContent="center" gap={10} padding={36}>
            {icon && (
                <flex width={44} height={44} borderRadius={12} backgroundColor={tokens.accentSubtle} justifyContent="center" alignItems="center">
                    {iconElement(icon, 22, tokens.accent)}
                </flex>
            )}
            <Text c={tokens} text={title} fontSize={15} fontWeight={600} color={tokens.text} />
            {message && <Text c={tokens} text={message} fontSize={12} color={tokens.textSecondary} maxWidth={340} />}
            {slot(children)}
        </flex>
    );
};

export const FieldRow = ({
    label,
    hint,
    children,
    stacked,
    labelWidth = 110,
    c
}: {
    label: string;
    hint?: string;
    children?: unknown;
    stacked?: boolean;
    labelWidth?: number;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    return stacked ? (
        <flex gap={6} alignItems="stretch">
            <Text c={tokens} text={label} fontSize={13} color={tokens.text} />
            {slot(children)}
            {hint && <Text c={tokens} text={hint} fontSize={12} color={tokens.textTertiary} maxWidth={380} />}
        </flex>
    ) : (
        <flex horizontal alignItems="center" gap={16}>
            <flex gap={2} width={labelWidth} flexShrink={0}>
                <Text c={tokens} text={label} fontSize={13} color={tokens.text} />
                {hint && <Text c={tokens} text={hint} fontSize={11} color={tokens.textTertiary} maxWidth={230} />}
            </flex>
            <flex horizontal alignItems="center" gap={8} flexGrow={1} flexShrink={1}>
                {slot(children)}
            </flex>
        </flex>
    );
};

export const SectionLabel = ({ text, children, c }: { text: string; children?: unknown; c?: FluentTokens }) => {
    const tokens = c ?? fluent();
    return (
        <flex horizontal alignItems="center" gap={8} paddingTop={6} paddingBottom={2}>
            <Text c={tokens} text={text} fontSize={12} fontWeight={600} color={tokens.textTertiary} />
            <spacer />
            {slot(children)}
        </flex>
    );
};

export const Card = ({
    children,
    onClick,
    padding = 12,
    gap,
    horizontal,
    alignItems,
    accentBar,
    selected,
    flexGrow,
    backgroundColor,
    borderColor,
    c
}: {
    children?: unknown;
    onClick?: () => void;
    padding?: number;
    gap?: number;
    horizontal?: boolean;
    alignItems?: string;
    accentBar?: string;
    selected?: boolean;
    flexGrow?: number;
    backgroundColor?: string;
    borderColor?: string;
    c?: FluentTokens;
}) => {
    const tokens = c ?? fluent();
    const hover = useHoverActive();
    const clickable = !!onClick;
    const bg = backgroundColor ?? (selected ? tokens.selectionTint : clickable && hover.isActive ? tokens.cardPressed : clickable && hover.isHovered ? tokens.cardHover : tokens.card);
    return (
        <flex
            horizontal
            borderRadius={6}
            borderWidth={1}
            borderColor={borderColor ?? (selected ? tokens.accent : tokens.cardStroke)}
            backgroundColor={bg}
            enableChildClipping
            {...(flexGrow !== undefined ? { flexGrow } : {})}
            {...(clickable
                ? {
                      onClick,
                      onMouseEnter: hover.onMouseEnter,
                      onMouseLeave: hover.onMouseLeave,
                      onMouseDown: hover.onMouseDown,
                      onMouseUp: hover.onMouseUp
                  }
                : {})}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            {accentBar && <flex width={3} flexShrink={0} backgroundColor={accentBar} />}
            <flex
                flexGrow={1}
                flexShrink={1}
                padding={padding}
                gap={gap ?? 0}
                horizontal={horizontal}
                alignItems={(alignItems ?? 'stretch') as 'start' | 'center' | 'end' | 'stretch' | 'free'}
            >
                {slot(children)}
            </flex>
        </flex>
    );
};

export const useAutoFocus = () => {
    const ref = useRef(true);
    return ref.current;
};

export const EASE = EASE_OUT;
