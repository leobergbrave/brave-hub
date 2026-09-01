import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import OrcamentoPage from './pages/OrcamentoPage.jsx'
import OrcamentoRapidoPage from './pages/OrcamentoRapidoPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import FormularioFiscalPage from './pages/FormularioFiscalPage.jsx'
import CadastroClientePage from './pages/CadastroClientePage.jsx'
import LpErgometros from './pages/LpErgometros.jsx'
import LpBoxHibrido from './pages/LpBoxHibrido.jsx'
import LpHyrox from './pages/LpHyrox.jsx'
import LpCrossfit from './pages/LpCrossfit.jsx'
import CentralRespostasPage from './pages/CentralRespostasPage.jsx'
import EnviarPropostaPage from './pages/EnviarPropostaPage.jsx'
import ComparacaoPage from './pages/ComparacaoPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/orcamento/:slug" element={<OrcamentoPage />} />
        <Route path="/proposta/:slug" element={<OrcamentoPage />} />
        <Route path="/orcamento-rapido/:alias" element={<OrcamentoRapidoPage />} />
        <Route path="/orcamento-rapido" element={<OrcamentoRapidoPage />} />
        <Route path="/q/:codigo" element={<OrcamentoRapidoPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/formulario-fiscal/:token" element={<FormularioFiscalPage />} />
        <Route path="/formulario-cadastro" element={<CadastroClientePage />} />
        <Route path="/cadastro" element={<CadastroClientePage />} />
        <Route path="/lp/ergometros"   element={<LpErgometros />} />
        <Route path="/lp/box-hibrido" element={<LpBoxHibrido />} />
        <Route path="/lp/hyrox"      element={<LpHyrox />} />
        <Route path="/lp/crossfit"   element={<LpCrossfit />} />
        <Route path="/central"       element={<CentralRespostasPage />} />
        <Route path="/enviar"        element={<EnviarPropostaPage />} />
        <Route path="/atendimento"   element={<EnviarPropostaPage />} />
        <Route path="/compara/:slug" element={<ComparacaoPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

/* Registro do service worker — necessario para o celular oferecer "instalar
   app". Falha em silencio quando o navegador nao suporta: a instalacao e um
   extra, nada do sistema depende dela. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
