import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initFrontendThemeMode } from './tokens/themeMode'
import './styles/tailwind.css'

initFrontendThemeMode()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
