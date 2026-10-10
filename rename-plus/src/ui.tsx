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

export const Text = memo(
    ({
        children,
        fontSize = 14,
        color,
        fontWeight = 400,
        maxWidth = -1,
        fontFamily = 'main'
    }: {
        children: string | number | (string | number)[];
        fontSize?: number;
        color?: string;
        fontWeight?: number;
        maxWidth?: number;
        fontFamily?: 'main' | 'monospace' | 'fallback';
    }) => {
        const c = fluent();
        return (
            <text
                text={Array.isArray(children) ? children.join('') : String(children)}
                fontSize={fontSize}
                maxWidth={maxWidth}
                color={color ?? c.text}
                fontWeight={fontWeight}
                fontFamily={fontFamily}
            />
        );
    }
);

export const Divider = ({ vertical }: { vertical?: boolean }) => {
    const c = fluent();
    return vertical ? <flex width={1} backgroundColor={c.divider} /> : <flex height={1} backgroundColor={c.divider} />;
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

export const Entrance = ({ delay = 0, offset = 8, children, ...rest }: { delay?: number; offset?: number; children?: ReactNode }) => {
    const shown = useEntrance(delay);
    return (
        <flex
            opacity={shown ? 255 : 0}
            paddingTop={shown ? 0 : offset}
            paddingBottom={shown ? offset : 0}
            alignItems="stretch"
            {...rest}
            animatedVars={ENTRANCE_VARS}
            animationCurve={{ duration: 200, easing: 'ease_out', vars: ENTRANCE_VARS }}
        >
            {children}
        </flex>
    );
};

export const Pill = ({ text, fg, bg, fontSize = 11 }: { text: string; fg: string; bg: string; fontSize?: number }) => (
    <flex
        horizontal
        height={Math.round(fontSize * 1.65 + 2)}
        backgroundColor={bg}
        borderRadius={4}
        paddingLeft={6}
        paddingRight={6}
        alignItems="center"
        justifyContent="center"
    >
        <Text fontSize={fontSize} fontWeight={600} color={fg}>
            {text}
        </Text>
    </flex>
);

export const TonePill = ({ tone, text, c, fontSize }: { tone: Tone; text: string; c: FluentTokens; fontSize?: number }) => {
    const style = toneColor(tone, c);
    return <Pill text={text} fg={style.fg} bg={style.bg} fontSize={fontSize} />;
};

export const Button = ({
    label,
    icon,
    onClick,
    variant = 'standard',
    disabled,
    iconSize = 14,
    minWidth,
    tone
}: {
    label?: string;
    icon?: string;
    onClick: () => void;
    variant?: 'standard' | 'accent' | 'subtle';
    disabled?: boolean;
    iconSize?: number;
    minWidth?: number;
    tone?: Tone;
}) => {
    const c = fluent();
    const hover = useHoverActive();
    const accent = variant === 'accent';
    const pressed = hover.isActive && !disabled;
    const hovered = hover.isHovered && !disabled;
    const danger = tone && variant !== 'accent' ? toneColor(tone, c) : null;
    const bg = accent
        ? disabled
            ? c.subtle
            : pressed
              ? c.accentPressed
              : hovered
                ? c.accentHover
                : c.accent
        : variant === 'subtle'
          ? pressed
              ? c.subtlePressed
              : hovered
                ? danger
                    ? danger.bg
                    : c.subtleHover
                : c.transparent
          : pressed
            ? c.controlPressed
            : hovered
              ? c.controlHover
              : c.control;
    const fg = disabled ? c.textDisabled : accent ? c.accentText : pressed || hovered ? (danger ? danger.fg : c.text) : c.text;
    return (
        <flex
            horizontal
            alignItems="center"
            justifyContent="center"
            gap={8}
            height={32}
            {...(minWidth ? { width: minWidth } : {})}
            paddingLeft={label ? 12 : 9}
            paddingRight={label ? 12 : 9}
            borderRadius={5}
            borderWidth={variant === 'standard' ? 1 : 0}
            borderColor={c.controlStroke}
            backgroundColor={bg}
            opacity={disabled ? 130 : 255}
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
                <Text fontSize={13} color={fg}>
                    {label}
                </Text>
            )}
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
        <flex horizontal gap={12} padding={12} borderRadius={6} backgroundColor={style.bg} borderColor={c.cardStroke} borderWidth={1} alignItems="start">
            <flex width={16} height={16} borderRadius={8} backgroundColor={style.fg} justifyContent="center" alignItems="center">
                <Text fontSize={11} fontWeight={700} color={c.light ? '#FFFFFFFF' : '#000000FF'}>
                    {glyph}
                </Text>
            </flex>
            <flex gap={3} flexGrow={1} alignItems="stretch">
                <Text fontSize={13} fontWeight={600} color={c.text} maxWidth={maxTextWidth}>
                    {title}
                </Text>
                {message && (
                    <Text fontSize={12} color={c.textSecondary} maxWidth={maxTextWidth}>
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
    const knob = hover.isActive ? 14 : hover.isHovered ? 14 : 12;
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
            gap={12}
            flexGrow={1}
            onClick={() => onChange(!value)}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onMouseDown={hover.onMouseDown}
            onMouseUp={hover.onMouseUp}
        >
            {label && (
                <flex gap={2} flexGrow={1} flexShrink={1}>
                    <Text fontSize={13} color={c.text}>
                        {label}
                    </Text>
                    {description && (
                        <Text fontSize={12} color={c.textSecondary}>
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
    height = 32,
    disabled,
    mono
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    width?: number;
    height?: number;
    disabled?: boolean;
    mono?: boolean;
}) => {
    const c = fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            width={width}
            height={height}
            fontSize={mono ? 12 : 13}
            disabled={disabled}
            borderRadius={5}
            paddingX={10}
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
        />
    );
};

export const TextArea = ({
    value,
    onChange,
    placeholder,
    height = 160,
    width
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    height?: number;
    width?: number;
}) => {
    const c = fluent();
    return (
        <textbox
            value={value}
            placeholder={placeholder ?? ''}
            multiline
            minHeight={height}
            preferredMultilineHeight={height}
            lineHeightMultiplier={1.45}
            {...(width ? { width } : {})}
            fontSize={12}
            borderRadius={6}
            paddingX={10}
            paddingY={8}
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

export const NumberBox = ({
    value,
    min,
    max,
    step = 1,
    onChange,
    width = 84,
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
        <flex horizontal alignItems="center" gap={6}>
            <textbox
                value={shown}
                width={width}
                height={32}
                fontSize={13}
                borderRadius={5}
                paddingX={10}
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
                <Text fontSize={12} color={c.textSecondary}>
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
    width = 170
}: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (next: string) => void;
    width?: number;
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
            width={width}
            height={32}
            alignItems="center"
            paddingLeft={11}
            paddingRight={10}
            borderRadius={5}
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
            <Text fontSize={13} color={c.text} maxWidth={width - 40}>
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
            height={26}
            paddingLeft={11}
            paddingRight={11}
            borderRadius={4}
            onClick={onClick}
            backgroundColor={selected ? c.controlSolid : hover.isHovered ? c.subtleHover : c.transparent}
            borderColor={selected ? c.controlStroke : c.transparent}
            borderWidth={1}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            animatedVars={COLOR_VARS}
            animationCurve={{ ...FAST, vars: COLOR_VARS }}
        >
            <Text fontSize={12} fontWeight={selected ? 600 : 400} color={selected ? c.text : c.textSecondary}>
                {label}
            </Text>
        </flex>
    );
};

export const SegmentedControl = ({
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
        <flex horizontal gap={2} padding={2} borderRadius={6} backgroundColor={c.subtle} borderColor={c.cardStroke} borderWidth={1}>
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
            height={26}
            paddingLeft={10}
            paddingRight={11}
            borderRadius={13}
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
            <Text fontSize={12} color={c.textSecondary}>
                {label}
            </Text>
        </flex>
    );
};

export const ProgressBar = ({ value, width }: { value: number | null; width: number }) => {
    const c = fluent();
    const fraction = value === null ? 0.25 : Math.min(1, Math.max(0, value));
    return (
        <flex horizontal width={width} height={4} alignItems="center">
            <flex
                width={Math.max(4, fraction * width)}
                height={3}
                borderRadius={1.5}
                backgroundColor={c.accent}
                animatedVars={['width']}
                animationCurve={{ duration: 200, easing: 'ease_out', vars: ['width'] }}
            />
            <flex flexGrow={1} height={1} backgroundColor={c.controlStrong} />
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
        <flex flexGrow={1} alignItems="center" justifyContent="center" gap={10} padding={36}>
            <flex width={44} height={44} borderRadius={12} backgroundColor={c.accentSubtle} justifyContent="center" alignItems="center">
                {iconElement(icon, 22, c.accent)}
            </flex>
            <Text fontSize={15} fontWeight={600} color={c.text}>
                {title}
            </Text>
            {message && (
                <Text fontSize={12} color={c.textSecondary} maxWidth={340}>
                    {message}
                </Text>
            )}
            {children}
        </flex>
    );
};

export const FieldRow = ({
    label,
    hint,
    children,
    stacked
}: {
    label: string;
    hint?: string;
    children: ReactNode;
    stacked?: boolean;
}) => {
    const c = fluent();
    return stacked ? (
        <flex gap={6} alignItems="stretch">
            <Text fontSize={13} color={c.text}>
                {label}
            </Text>
            {children}
            {hint && (
                <Text fontSize={12} color={c.textTertiary} maxWidth={380}>
                    {hint}
                </Text>
            )}
        </flex>
    ) : (
        <flex horizontal alignItems="center" gap={16}>
            <flex gap={2} width={110} flexShrink={0}>
                <Text fontSize={13} color={c.text}>
                    {label}
                </Text>
                {hint && (
                    <Text fontSize={11} color={c.textTertiary} maxWidth={230}>
                        {hint}
                    </Text>
                )}
            </flex>
            <flex horizontal alignItems="center" gap={8} flexGrow={1} flexShrink={1}>
                {children}
            </flex>
        </flex>
    );
};

export const SectionLabel = ({ text, c }: { text: string; c: FluentTokens }) => (
    <flex paddingTop={6} paddingBottom={2}>
        <Text fontSize={12} fontWeight={600} color={c.textTertiary}>
            {text}
        </Text>
    </flex>
);

export const useAutoFocus = () => {
    const ref = useRef(true);
    return ref.current;
};

export const EASE = EASE_OUT;
