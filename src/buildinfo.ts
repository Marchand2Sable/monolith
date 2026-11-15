// Which build this is. The values are filled in at build time by vite.config.ts from package.json (the one place the version lives),
// git, the clock and the release channel. In plain `vite` dev and under Vitest they hold their development values.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;
declare const __APP_CHANNEL__: string;

const safe = (read: () => string, fallback: string): string => {
  try {
    return read();
  } catch {
    return fallback; // the constant is not defined (a tool that does not run through vite)
  }
};

export const BUILD = {
  version: safe(() => __APP_VERSION__, '0.0.0-dev'),
  commit: safe(() => __APP_COMMIT__, 'dev'),
  built: safe(() => __APP_BUILT__, ''),
  /** dev | preview (GitHub Pages) | beta | stable (itch.io) */
  channel: safe(() => __APP_CHANNEL__, 'dev'),
};

/** `1.0.0 · a1b2c3d · stable` */
export const buildLabel = (): string => `${BUILD.version} · ${BUILD.commit} · ${BUILD.channel}`;
