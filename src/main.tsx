import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import MainScreen from './pages/MainScreen'
import FormulaScreen from './pages/FormulaScreen'
import SettingsScreen from './pages/SettingsScreen'
import { initializeBleSupport } from './services/pixelsService'
import DiagnosticRollHistoryBridge from './components/DiagnosticRollHistoryBridge'
import PairedDiceReconnectBridge from './components/PairedDiceReconnectBridge'

initializeBleSupport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <PairedDiceReconnectBridge />
      <DiagnosticRollHistoryBridge />
      <Routes>
        <Route path="/" element={<MainScreen />} />
        <Route path="/formula/new" element={<FormulaScreen />} />
        <Route path="/formula/:id" element={<FormulaScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
