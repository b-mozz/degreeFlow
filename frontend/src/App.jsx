import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import FlowchartPage from './pages/FlowchartPage'
import SuggestionsPage from './pages/SuggestionsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/flowchart" element={<FlowchartPage />} />
        <Route path="/suggestions" element={<SuggestionsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
