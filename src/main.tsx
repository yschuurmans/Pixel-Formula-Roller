import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import MainScreen from './pages/MainScreen'
import FormulaScreen from './pages/FormulaScreen'
import SettingsScreen from './pages/SettingsScreen'
import ProfileScreen from './pages/ProfileScreen'
import ProfileEditScreen from './pages/ProfileEditScreen'
import { initializeBleSupport } from './services/pixelsService'
import PairedDiceReconnectBridge from './components/PairedDiceReconnectBridge'
import AndroidBackButtonBridge from './components/AndroidBackButtonBridge'
import DiagnosticRollHistoryBridge from './components/DiagnosticRollHistoryBridge'

void initializeBleSupport()

const router = createHashRouter([
  {
    path: '/',
    element: (
      <>
        <DiagnosticRollHistoryBridge />
        <MainScreen />
      </>
    ),
  },
  {
    path: '/formula/new',
    element: <FormulaScreen />,
  },
  {
    path: '/formula/:id',
    element: <FormulaScreen />,
  },
  {
    path: '/roll/:id',
    element: <FormulaScreen mode="roll-only" />,
  },
  {
    path: '/roll',
    element: <FormulaScreen mode="roll-only" />,
  },
  {
    path: '/settings',
    element: <SettingsScreen />,
  },
  {
    path: '/profiles',
    element: <ProfileScreen />,
  },
  {
    path: '/profiles/:id/edit',
    element: <ProfileEditScreen />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PairedDiceReconnectBridge />
    <AndroidBackButtonBridge router={router} />
    <RouterProvider router={router} />
  </StrictMode>,
)
