import * as shell from 'mshell';

const svg = (path: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`;

export const Icons = {
    rename: svg('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'),
    number: svg('M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z'),
    replace: svg('M11 6c1.38 0 2.63.56 3.54 1.46L12 10h6V4l-2.05 2.05C14.68 4.78 12.93 4 11 4c-3.53 0-6.43 2.61-6.92 6h2.02c.46-2.28 2.48-4 4.9-4zM11 18c-1.38 0-2.63-.56-3.54-1.46L10 14H4v6l2.05-2.05C7.32 19.22 9.07 20 11 20c3.53 0 6.43-2.61 6.92-6h-2.02c-.46 2.28-2.48 4-4.9 4z'),
    textCase: svg('M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z'),
    affix: svg('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'),
    trim: svg('M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z'),
    cleanup: svg('M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.9959.9959 0 0 0-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z'),
    extension: svg('M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'),
    dateTime: svg('M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z'),
    script: svg('M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z'),
    check: svg('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'),
    checkCircle: svg('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'),
    close: svg('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'),
    chevronDown: svg('M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'),
    chevronRight: svg('M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'),
    chevronUp: svg('M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z'),
    undo: svg('M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z'),
    warning: svg('M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'),
    info: svg('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'),
    error: svg('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'),
    sort: svg('M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z'),
    arrow: svg('M16.01 11H4v2h12.01v3L20 12l-3.99-4z'),
    settings: svg('M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'),
    folder: svg('M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'),
    skip: svg('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM7 11h10v2H7z'),
    preview: svg('M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'),
    magic: svg('M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5z'),
    reset: svg('M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z'),
    refresh: svg('M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z')
};

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const Space = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20 } as const;
export const Radius = { sm: 4, md: 6, lg: 8, xl: 12 } as const;
export const Font = { title: 20, heading: 15, body: 13, small: 12, tiny: 11 } as const;
export const Control = { height: 32, heightSm: 26, label: 96 } as const;

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
        scrollBar: light ? '#00000038' : '#FFFFFF33',
        windowBg: light ? '#F3F3F3FF' : '#202020FF',
        columnBg: light ? '#FFFFFF66' : '#FFFFFF08',
        scrollTrack: light ? '#00000008' : '#FFFFFF0A',
        transparent: '#00000000'
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
            return { fg: light ? '#0F7B0FFF' : '#6CCB5FFF', bg: light ? '#DFF6DDE6' : '#393D1BE6', label: 'OK' };
        case 'warning':
            return { fg: light ? '#9D5D00FF' : '#FCE100FF', bg: light ? '#FFF4CEE6' : '#433519E6', label: 'WARN' };
        case 'danger':
            return { fg: light ? '#C42B1CFF' : '#FF99A4FF', bg: light ? '#FDE7E9E6' : '#442726E6', label: 'ERROR' };
        default:
            return { fg: c.textSecondary, bg: light ? '#00000008' : '#FFFFFF0A', label: '' };
    }
};

export const COLOR_VARS = ['.r', '.g', '.b', '.a'];
export const FAST = { duration: 120, easing: 'ease_out' as const };
export const EASE_OUT = { duration: 180, easing: 'ease_out' as const };
