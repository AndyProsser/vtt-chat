import React from 'react'
import ReactDOM from 'react-dom/client'
import '@material-symbols/font-400/outlined.css'
import App from './App'
import { installFetchDebugLogging } from './utils/fetchDebug'
import { initFrontendThemeMode } from './tokens/themeMode'
import './styles/tailwind.css'

initFrontendThemeMode()
installFetchDebugLogging()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
