import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/style.scss'
import App from './App.vue'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'element-plus/dist/index.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.mount('#app')
