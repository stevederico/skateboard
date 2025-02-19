import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/styles.css'
import DemoApp from './components/DemoApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
