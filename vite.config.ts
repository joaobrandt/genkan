import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  envPrefix: 'GENKAN_',
  build: {
    target: 'chrome108',
    outDir: 'dist'
  }
});
