import {defineConfig} from 'vite';

export default defineConfig({
  base: './', // webOS apps load from a local file path — assets must be relative.
  envPrefix: ['VITE_', 'GENKAN_'], // .env values the page may read (GENKAN_LANG)
  build: {
    target: 'chrome108', // webOS 24 ships Chromium 108.
    outDir: 'dist'
  }
});
