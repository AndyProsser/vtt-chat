import React from 'react'
import ReactDOM from 'react-dom/client'
import { LoggerNames, LogLevel, setLogLevel } from 'livekit-client'
import '@material-symbols/font-400/outlined.css'
import App from './App'
import { installFetchDebugLogging } from './utils/fetchDebug'
import { initFrontendThemeMode } from './tokens/themeMode'
import './styles/tailwind.css'

initFrontendThemeMode()
installFetchDebugLogging()

if (import.meta.env.DEV) {
  setLogLevel(LogLevel.error, LoggerNames.Room)
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
