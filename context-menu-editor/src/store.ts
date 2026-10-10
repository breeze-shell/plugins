import * as shell from 'mshell';
import { MenuKind, Profile, Settings } from './types';

export type SettingsStore = ReturnType<typeof createStore>;

export const createStore = (initial: Settings, write: (settings: Settings) => void, delay = 400) => {
    let settings = initial;
    let timer: number | null = null;
    const listeners = new Set<(next: Settings) => void>();

    const save = () => {
        if (timer !== null) shell.infra.clearTimeout(timer);
        timer = null;
        write(settings);
    };

    const replace = (next: Settings) => {
        settings = next;
        if (timer !== null) shell.infra.clearTimeout(timer);
        timer = shell.infra.setTimeout(save, delay);
        for (const listener of listeners) listener(settings);
    };

    return {
        get: () => settings,
        replace,
        updateProfile: (kind: MenuKind, profile: Profile) => replace({ ...settings, profiles: { ...settings.profiles, [kind]: profile } }),
        subscribe: (listener: (next: Settings) => void) => {
            listeners.add(listener);
            listener(settings);
            return () => {
                listeners.delete(listener);
            };
        },
        save,
        flush: () => {
            if (timer !== null) save();
        }
    };
};
