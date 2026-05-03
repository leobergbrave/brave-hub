import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import OrcamentoPage from './pages/OrcamentoPage.jsx'
import OrcamentoRapidoPage from './pages/OrcamentoRapidoPage.jsx'
import AdminPage from './pages/AdminPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/orcamento/:slug" element={<OrcamentoPage />} />
        <Route path="/orcamento-rapido/:alias" element={<OrcamentoRapidoPage />} />
        <Route path="/orcamento-rapido" element={<OrcamentoRapidoPage />} />
        <Route path="/q/:codigo" element={<OrcamentoRapidoPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
