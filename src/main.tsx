import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

registerSW({ immediate: true })

// Без StrictMode: TradingView widget.remove()+new widget() на каждом double-mount в dev.
createRoot(document.getElementById('root')!).render(<App />)
