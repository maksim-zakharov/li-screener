import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Без StrictMode: TradingView widget.remove()+new widget() на каждом double-mount в dev.
createRoot(document.getElementById('root')!).render(<App />)
