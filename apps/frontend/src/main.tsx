import React from 'react'
import ReactDOM from 'react-dom/client'
import { LoggerNames, LogLevel, setLogLevel } from 'livekit-client'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/roboto-mono/wght.css'
import '@material-symbols/font-400/outlined.css'
import App from './App'
import { installFetchDebugLogging } from './utils/fetchDebug'
import { initUiDiagnosticsFlag } from './utils/uiDiagnostics'
import { initFrontendThemeMode } from './tokens/themeMode'
import './styles/utils/UiDiagnostics.css'
import './styles/components/ui/EmptyPanel.css'
import './styles/tailwind.css'

initFrontendThemeMode()
installFetchDebugLogging()
initUiDiagnosticsFlag()

if (import.meta.env.DEV) {
  setLogLevel(LogLevel.error)
  setLogLevel(LogLevel.error, LoggerNames.Room)
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
