import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { apply_pnl_style, load_pnl_style } from './lib/storage'

// Before first paint so colors never flash
apply_pnl_style(load_pnl_style())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
