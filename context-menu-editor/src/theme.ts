import * as shell from 'mshell';

const svg = (path: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${path}"/></svg>`;

export const Icons: Record<string, string> = {
    grip: svg('M4.2 2H6.6V4.4H4.2ZM4.2 6.8H6.6V9.2H4.2ZM4.2 11.6H6.6V14H4.2ZM9.4 2H11.8V4.4H9.4ZM9.4 6.8H11.8V9.2H9.4ZM9.4 11.6H11.8V14H9.4Z'),
    chevronRight: svg('M5.8 2.8L11 8L5.8 13.2L4.2 11.7L7.8 8L4.2 4.3Z'),
    chevronDown: svg('M2.8 5.8L4.3 4.2L8 7.8L11.7 4.2L13.2 5.8L8 11Z'),
    chevronUp: svg('M2.8 10.2L4.3 11.8L8 8.2L11.7 11.8L13.2 10.2L8 5Z'),
    close: svg('M3.5 2.1L8 6.6L12.5 2.1L13.9 3.5L9.4 8L13.9 12.5L12.5 13.9L8 9.4L3.5 13.9L2.1 12.5L6.6 8L2.1 3.5Z'),
    plus: svg('M7 2H9V7H14V9H9V14H7V9H2V7H7Z'),
    folder: svg('M1.5 3.5H6.2L8 5.8H14.5V12.5H1.5Z'),
    folderOpen: svg('M1.5 3.5H6.2L8 5.8H14.5V7.6H2.3ZM2.4 8.8H14.9L13.4 13.4H1.2Z'),
    rowStack: svg('M2 3H14V5.4H2ZM2 6.8H14V9.2H2ZM2 10.6H14V13H2Z'),
    grid: svg('M1.8 1.8H7.2V7.2H1.8ZM8.8 1.8H14.2V7.2H8.8ZM1.8 8.8H7.2V14.2H1.8ZM8.8 8.8H14.2V14.2H8.8Z'),
    shield: svg(
        'M8 1.4L14 3.6V8.2C14 11.6 11.6 14 8 15.2C4.4 14 2 11.6 2 8.2V3.6Z' +
            'M8 3.3V13.3C10.3 12.4 12.1 10.6 12.1 8.2V5.1Z'
    ),
    separator: svg('M1.5 7.1H5.2V8.9H1.5ZM6.4 7.1H10.1V8.9H6.4ZM11.3 7.1H14.5V8.9H11.3Z'),
    eye: svg(
        'M8 3.2C11.4 3.2 13.9 6.2 14.6 8C13.9 9.8 11.4 12.8 8 12.8C4.6 12.8 2.1 9.8 1.4 8C2.1 6.2 4.6 3.2 8 3.2Z' +
            'M8 4.7C5.2 4.7 2.8 7.1 2.6 8C2.8 8.9 5.2 11.3 8 11.3C10.8 11.3 13.2 8.9 13.4 8C13.2 7.1 10.8 4.7 8 4.7Z' +
            'M6.3 8A1.7 1.7 0 1 1 9.7 8A1.7 1.7 0 1 1 6.3 8Z'
    ),
    eyeOff: svg(
        'M8 3.2C11.4 3.2 13.9 6.2 14.6 8C13.9 9.8 11.4 12.8 8 12.8C4.6 12.8 2.1 9.8 1.4 8C2.1 6.2 4.6 3.2 8 3.2Z' +
            'M8 4.7C5.2 4.7 2.8 7.1 2.6 8C2.8 8.9 5.2 11.3 8 11.3C10.8 11.3 13.2 8.9 13.4 8C13.2 7.1 10.8 4.7 8 4.7Z' +
            'M2.3 12.6L12.6 2.3L13.7 3.4L3.4 13.7Z'
    ),
    trash: svg('M6.3 2.1H9.7V3.5H6.3ZM2.6 4.4H13.4V6H2.6ZM4.2 6.9H11.8L11.2 13.9H4.8Z'),
    copy: svg(
        'M5.6 1.7H13.3C14 1.7 14.5 2.2 14.5 2.9V10.7H12.9V3.3H5.6Z' +
            'M1.9 5.2H9.4C10.1 5.2 10.6 5.7 10.6 6.4V13.3C10.6 14 10.1 14.5 9.4 14.5H1.9C1.2 14.5 0.7 14 0.7 13.3V6.4C0.7 5.7 1.2 5.2 1.9 5.2Z'
    ),
    pencil: svg('M11.6 1.6L14.4 4.4L6.2 12.6L2.6 13.4L3.4 9.8Z'),
    undo: svg('M1.5 8.4L6.3 4.2V6.6H9.3C12.2 6.6 14.5 8.9 14.5 11.8V12.5H12.3V11.8C12.3 10.1 11 8.8 9.3 8.8H6.3V11.2Z'),
    redo: svg('M14.5 8.4L9.7 4.2V6.6H6.7C3.8 6.6 1.5 8.9 1.5 11.8V12.5H3.7V11.8C3.7 10.1 5 8.8 6.7 8.8H9.7V11.2Z'),
    refresh: svg(
        'M13.22 6.6A5.4 5.4 0 1 1 9.4 2.78L8.98 4.33A3.8 3.8 0 1 0 11.67 7.02Z' +
            'M13.22 6.6L13.06 9.13L11.67 7.02Z'
    ),
    settings: svg(
        'M6.7 1.4H9.3V4.4H6.7ZM6.7 11.6H9.3V14.6H6.7ZM1.4 6.7H4.4V9.3H1.4ZM11.6 6.7H14.6V9.3H11.6Z' +
            'M11.75 2.98L13.02 4.25L11.75 5.52L10.48 4.25ZM4.25 2.98L5.52 4.25L4.25 5.52L2.98 4.25Z' +
            'M11.75 10.48L13.02 11.75L11.75 13.02L10.48 11.75ZM4.25 10.48L5.52 11.75L4.25 13.02L2.98 11.75Z' +
            'M2.8 8A5.2 5.2 0 1 1 13.2 8A5.2 5.2 0 1 1 2.8 8ZM5.8 8A2.2 2.2 0 1 0 10.2 8A2.2 2.2 0 1 0 5.8 8Z'
    ),
    search: svg(
        'M1.8 7A5.2 5.2 0 1 1 12.2 7A5.2 5.2 0 1 1 1.8 7ZM3.4 7A3.6 3.6 0 1 0 10.6 7A3.6 3.6 0 1 0 3.4 7Z' +
            'M9.46 10.94L13.46 14.94L14.94 13.46L10.94 9.46Z'
    ),
    check: svg('M6.1 11.4L2.4 7.7L1 9.1L6.1 14.2L15 5.3L13.6 3.9Z'),
    info: svg(
        'M1.8 8A6.2 6.2 0 1 1 14.2 8A6.2 6.2 0 1 1 1.8 8ZM3.6 8A4.4 4.4 0 1 0 12.4 8A4.4 4.4 0 1 0 3.6 8Z' +
            'M7.1 4.6H8.9V6.4H7.1ZM7.1 7.4H8.9V11.6H7.1Z'
    ),
    warning: svg('M8 1.7L15.3 14.3H0.7ZM7.1 6.2V10.4H8.9V6.2ZM7.1 11.6V13H8.9V11.6Z'),
    error: svg('M1.7 8A6.3 6.3 0 1 1 14.3 8A6.3 6.3 0 1 1 1.7 8ZM7.1 4.4V9.4H8.9V4.4ZM7.1 10.8V12.6H8.9V10.8Z'),
    success: svg(
        'M1.7 8A6.3 6.3 0 1 1 14.3 8A6.3 6.3 0 1 1 1.7 8Z' +
            'M6.9 9.5L11.2 4.3L12 5.3L6.9 11.5L4 7.9L4.8 7Z'
    ),
    file: svg('M3.4 1.5H8.6L12.9 5.8V14.5H3.4ZM5.3 7.2V8.5H11.1V7.2ZM5.3 10V11.3H11.1V10Z'),
    desktop: svg('M1.5 2.5H14.5V10.5H1.5ZM3 4V9H13V4ZM6.6 10.5H9.4V13H6.6ZM4.4 13H11.6V14.4H4.4Z'),
    taskbar: svg('M1.5 3H14.5V13H1.5ZM3 4.5V10.5H13V4.5Z'),
    window: svg('M1.5 3H14.5V13H1.5ZM3 5.6V11.5H13V5.6Z'),
    star: svg('M8 2L9.59 6.12L13.99 6.35L10.57 9.13L11.7 13.4L8 11L4.3 13.4L5.43 9.13L2.01 6.35L6.41 6.12Z'),
    pin: svg('M9.17 8.77L2.87 15.07L1.73 13.93L8.03 7.63ZM9.6 2.4L13.6 6.4L9.6 10.4L5.6 6.4Z'),
    command: svg(
        'M5.1 5.1H10.9V10.9H5.1Z' +
            'M1.6 1.6H5.4V5.4H1.6ZM3.1 3.1V3.9H3.9V3.1Z' +
            'M10.6 1.6H14.4V5.4H10.6ZM12.1 3.1V3.9H12.9V3.1Z' +
            'M1.6 10.6H5.4V14.4H1.6ZM3.1 12.1V12.9H3.9V12.1Z' +
            'M10.6 10.6H14.4V14.4H10.6ZM12.1 12.1V12.9H12.9V12.1Z'
    ),
    link: svg('M1.6 5.3H8.4V10.7H1.6ZM3.4 7.1V8.9H6.6V7.1ZM7.6 5.3H14.4V10.7H7.6ZM9.4 7.1V8.9H12.6V7.1Z'),
    more: svg(
        'M1.5 8A1.5 1.5 0 1 1 4.5 8A1.5 1.5 0 1 1 1.5 8Z' +
            'M6.5 8A1.5 1.5 0 1 1 9.5 8A1.5 1.5 0 1 1 6.5 8Z' +
            'M11.5 8A1.5 1.5 0 1 1 14.5 8A1.5 1.5 0 1 1 11.5 8Z'
    ),
    arrowUp: svg('M8 2.2L13.6 8.2H10.4V13.8H5.6V8.2H2.4Z'),
    arrowDown: svg('M8 13.8L2.4 7.8H5.6V2.2H10.4V7.8H13.6Z'),
    importFile: svg('M7.1 1.8H8.9V7.2H11.7L8 11.4L4.3 7.2H7.1ZM2.2 10.4H4V13H12V10.4H13.8V14.8H2.2Z'),
    exportFile: svg('M8 1.4L11.7 5.6H8.9V9.6H7.1V5.6H4.3ZM2.2 10.4H4V13H12V10.4H13.8V14.8H2.2Z'),
    reset: svg(
        'M13.22 6.6A5.4 5.4 0 1 1 9.4 2.78L8.98 4.33A3.8 3.8 0 1 0 11.67 7.02Z' +
            'M9.4 2.78L6.4 2.7L8.98 4.33Z'
    ),
    palette: svg(
        'M1.8 8A6.2 6.2 0 1 1 14.2 8A6.2 6.2 0 1 1 1.8 8Z' +
            'M4.3 5.6A1.1 1.1 0 1 0 6.5 5.6A1.1 1.1 0 1 0 4.3 5.6Z' +
            'M7 4.4A1.1 1.1 0 1 0 9.2 4.4A1.1 1.1 0 1 0 7 4.4Z' +
            'M9.6 5.6A1.1 1.1 0 1 0 11.8 5.6A1.1 1.1 0 1 0 9.6 5.6Z' +
            'M10.6 8.2A1.1 1.1 0 1 0 12.8 8.2A1.1 1.1 0 1 0 10.6 8.2Z' +
            'M6.6 13.4A1.8 1.8 0 1 0 10.2 13.4A1.8 1.8 0 1 0 6.6 13.4Z'
    ),
    list: svg('M2 3.2H4V5.2H2ZM5.6 3.2H14V5.2H5.6ZM2 7H4V9H2ZM5.6 7H14V9H5.6ZM2 10.8H4V12.8H2ZM5.6 10.8H14V12.8H5.6Z'),
    layers: svg('M8 1L13.6 3.6L8 6.2L2.4 3.6ZM8 5.4L13.6 8L8 10.6L2.4 8ZM8 9.8L13.6 12.4L8 15L2.4 12.4Z'),
    sparkle: svg(
        'M7 1.6C7.4 5.4 8.6 6.6 12.4 7C8.6 7.4 7.4 8.6 7 12.4C6.6 8.6 5.4 7.4 1.6 7C5.4 6.6 6.6 5.4 7 1.6Z' +
            'M13 1.2C13.15 2.85 13.65 3.35 15.3 3.5C13.65 3.65 13.15 4.15 13 5.8C12.85 4.15 12.35 3.65 10.7 3.5C12.35 3.35 12.85 2.85 13 1.2Z'
    ),
    save: svg('M2.4 2.4H11.2L13.6 4.8V13.6H2.4ZM5.6 2.4V5.6H10.4V2.4ZM5 8.4V12.4H11V8.4Z'),
    ban: svg(
        'M1.8 8A6.2 6.2 0 1 1 14.2 8A6.2 6.2 0 1 1 1.8 8ZM3.6 8A4.4 4.4 0 1 0 12.4 8A4.4 4.4 0 1 0 3.6 8Z' +
            'M3.37 4.43L11.57 12.63L12.63 11.57L4.43 3.37Z'
    ),
    sliders: svg(
        'M1.8 3.5H14.2V5.1H1.8ZM1.8 7.2H14.2V8.8H1.8ZM1.8 10.9H14.2V12.5H1.8Z' +
            'M8.2 4.3A2.2 2.2 0 1 1 12.6 4.3A2.2 2.2 0 1 1 8.2 4.3Z' +
            'M3.4 8A2.2 2.2 0 1 1 7.8 8A2.2 2.2 0 1 1 3.4 8Z' +
            'M9 11.7A2.2 2.2 0 1 1 13.4 11.7A2.2 2.2 0 1 1 9 11.7Z'
    ),
    text: svg('M2.4 13.6L6.6 2.4H9.4L13.6 13.6H11.4L9.9 10.1H6.1L4.6 13.6ZM8 4.6L9.5 8.8H6.5Z')
};

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const fluent = () => {
    const light = shell.breeze.is_light_theme();
    return {
        light,
        accent: light ? '#005FB8FF' : '#60CDFFFF',
        accentHover: light ? '#196EBFFF' : '#5AB8E6FF',
        accentPressed: light ? '#327EC5FF' : '#53A3CCFF',
        accentText: light ? '#FFFFFFFF' : '#000000FF',
        accentSubtle: light ? '#005FB81A' : '#60CDFF1F',
        accentSubtleHover: light ? '#005FB829' : '#60CDFF33',
        text: light ? '#000000E4' : '#FFFFFFFF',
        textSecondary: light ? '#0000009E' : '#FFFFFFC5',
        textTertiary: light ? '#00000072' : '#FFFFFF87',
        textDisabled: light ? '#0000005C' : '#FFFFFF5D',
        card: light ? '#FFFFFFB3' : '#FFFFFF0D',
        cardHover: light ? '#F9F9F9E6' : '#FFFFFF15',
        cardPressed: light ? '#F5F5F5CC' : '#FFFFFF08',
        cardStroke: light ? '#0000000F' : '#FFFFFF12',
        control: light ? '#FFFFFFB3' : '#FFFFFF0F',
        controlHover: light ? '#F9F9F9E6' : '#FFFFFF15',
        controlPressed: light ? '#F5F5F5CC' : '#FFFFFF08',
        controlStroke: light ? '#0000001A' : '#FFFFFF17',
        controlStrong: light ? '#00000072' : '#FFFFFF8B',
        controlSolid: light ? '#FFFFFFFF' : '#454545FF',
        subtle: light ? '#0000000A' : '#FFFFFF0F',
        subtleHover: light ? '#00000009' : '#FFFFFF0F',
        subtlePressed: light ? '#00000006' : '#FFFFFF0A',
        divider: light ? '#00000014' : '#FFFFFF15',
        codeBg: light ? '#0000000A' : '#00000040',
        scrollTrack: light ? '#00000008' : '#FFFFFF0A',
        transparent: '#00000000',
        windowBg: light ? '#F3F3F3FF' : '#1F1F1FFF',
        railBg: light ? '#EBEBEBFF' : '#242424FF',
        canvasBg: light ? '#FAFAFAFF' : '#202020FF',
        headerBg: light ? '#F5F5F5FF' : '#272727FF',
        menuBg: light ? '#FBFBFBFF' : '#2E2E2EFF',
        border: light ? '#0000001F' : '#FFFFFF1A',
        hover: light ? '#0000000D' : '#FFFFFF14',
        hoverStrong: light ? '#0000001A' : '#FFFFFF20',
        hoverOverlay: light ? '#0000000D' : '#FFFFFF14',
        selection: light ? '#005FB833' : '#60CDFF3D',
        selectionTint: light ? '#005FB81F' : '#60CDFF29',
        accentSoft: light ? '#005FB82E' : '#60CDFF38',
        dropAccent: light ? '#005FB8FF' : '#8FDDFFFF',
        dangerTint: light ? '#C42B1C1F' : '#FF99A41F',
        dangerTintHover: light ? '#C42B1C29' : '#FF99A42E',
        successText: light ? '#0F7B0FFF' : '#6CCB5FFF',
        successSoft: light ? '#DFF6DDE6' : '#393D1BE6',
        warningText: light ? '#9D5D00FF' : '#FCE100FF',
        warningSoft: light ? '#FFF4CEE6' : '#433519E6',
        dangerText: light ? '#C42B1CFF' : '#FF99A4FF',
        dangerSoft: light ? '#FDE7E9E6' : '#442726E6'
    };
};

export type FluentTokens = ReturnType<typeof fluent>;

export const toneColor = (tone: Tone, c: FluentTokens): { fg: string; bg: string; label: string } => {
    const light = c.light;
    switch (tone) {
        case 'accent':
        case 'info':
            return { fg: c.accent, bg: c.accentSubtle, label: 'INFO' };
        case 'success':
            return { fg: c.successText, bg: c.successSoft, label: 'OK' };
        case 'warning':
            return { fg: c.warningText, bg: c.warningSoft, label: 'WARN' };
        case 'danger':
            return { fg: c.dangerText, bg: c.dangerSoft, label: 'ERROR' };
        default:
            return { fg: c.textSecondary, bg: light ? '#00000008' : '#FFFFFF0A', label: '' };
    }
};

export const COLOR_VARS = ['.r', '.g', '.b', '.a'];
export const FAST = { duration: 120, easing: 'ease_out' as const };
export const EASE_OUT = { duration: 180, easing: 'ease_out' as const };
