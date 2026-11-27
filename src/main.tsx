import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { warmAlorSharedWorker } from '@/api/shared-ws/alor-shared-bridge'
import App from './App.tsx'
import './index.css'

registerSW({ immediate: true })
warmAlorSharedWorker()

// Без StrictMode: TradingView widget.remove()+new widget() на каждом double-mount в dev.
createRoot(document.getElementById('root')!).render(<App />)
