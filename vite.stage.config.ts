import { localObsTest } from './service/preview-plugin'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [localObsTest()],
  base: './',
  build: { outDir: 'stage-dist', rollupOptions: { input: 'stage.html' } },
})

