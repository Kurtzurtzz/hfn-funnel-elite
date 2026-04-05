import { BrowserRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import PublicFunnel from "./pages/PublicFunnel";
import { Toaster } from "sonner";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white font-body selection:bg-primary selection:text-white">
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<PublicFunnel />} />
          <Route path="/admin" element={<Dashboard />} />
          <Route path="*" element={<div className="flex items-center justify-center h-screen italic text-zinc-500 uppercase tracking-widest font-mono">HFN_SYSTEMS // 404_NOT_FOUND</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
