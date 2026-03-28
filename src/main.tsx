import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import './styles/tokens.css'
import App from './App'
import './lib/retroactivePrecisionUpgrade' // Exposes upgradeExistingItems() on window in dev mode

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
