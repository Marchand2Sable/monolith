import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The version lives in package.json and nowhere else. The build reads it, plus the commit and the channel the pipeline names.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const commit = (): string => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    return 'unknown'; // not a git checkout (a source archive)
  }
};

/** dev | preview | beta | stable. The workflows set BUILD_CHANNEL; a plain local build is "local". */
const channel = process.env.BUILD_CHANNEL || 'local';

export default defineConfig({
  base: './', // relative paths: the build is a plain static site, fine under a GitHub Pages sub-path and in the itch.io iframe
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
    __APP_CHANNEL__: JSON.stringify(channel),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // the engines change rarely: their own files stay cached when only the game changes
        manualChunks: (id: string) => {
          if (id.includes('rapier3d')) return 'physics';
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: { port: 5174, open: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as import('vite').UserConfig);
