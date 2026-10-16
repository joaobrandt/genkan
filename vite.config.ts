import {defineConfig} from 'vite';

export default defineConfig({
  base: './', // webOS apps load from a local file path — assets must be relative.
  build: {
    target: 'chrome108', // webOS 24 ships Chromium 108.
    outDir: 'dist'
  }
});
