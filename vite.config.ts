import { defineConfig, UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const viteUserConfig: UserConfig = {
  plugins: [vue()],
  base: '',
  server: {
    port: 8080,
    https: {
      cert: 'cert.pem',
      key: 'key.pem'
    }
  },
  build: {
    rollupOptions: {
      input: {
        mobile: 'index.html',
        panel: 'index.html'
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
}

export default defineConfig(viteUserConfig)
