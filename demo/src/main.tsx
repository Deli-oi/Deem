import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isKiosk, startKiosk } from './lib/kiosk'

if (isKiosk()) startKiosk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
