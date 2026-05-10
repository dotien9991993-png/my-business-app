import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installToastFallback } from './utils/toast.js'

// Override window.alert() → Toast UI (đẹp hơn, không chặn UI, đặc biệt tốt trên mobile)
installToastFallback();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
