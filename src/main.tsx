import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import MainScreen from './pages/MainScreen'
import FormulaScreen from './pages/FormulaScreen'
import SettingsScreen from './pages/SettingsScreen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainScreen />} />
        <Route path="/formula/new" element={<FormulaScreen />} />
        <Route path="/formula/:id" element={<FormulaScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
