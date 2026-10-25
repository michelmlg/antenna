import { Navigate, Route, Routes } from "react-router-dom";
import { useAntennaEvents } from "./lib/sse";
import { AppShell } from "./components/layout/AppShell";
import Inicio from "./features/inicio";
import Grade from "./features/grade";
import Generos from "./features/generos";
import GeneroDetalhe from "./features/generos/detalhe";
import Atividade from "./features/atividade";
import Assistir from "./features/assistir";

export default function App() {
  useAntennaEvents();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/grade" element={<Grade />} />
        <Route path="/generos" element={<Generos />} />
        <Route path="/generos/:id" element={<GeneroDetalhe />} />
        <Route path="/atividade" element={<Atividade />} />
        <Route path="/assistir" element={<Assistir />} />
        {/* rota antiga (Operação) */}
        <Route path="/operacao" element={<Navigate to="/atividade" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
