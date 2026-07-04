import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Jobs from './pages/Jobs'
import Bids from './pages/Bids'
import Dashboard from './pages/Dashboard'
import Resumes from './pages/Resumes'
import Templates from './pages/Templates'
import Users from './pages/Users'
import Companies from './pages/Companies'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex min-h-screen bg-gray-50">
                  <Sidebar />
                  <Routes>
                    <Route path="/" element={<Navigate to="/jobs" replace />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route 
                      path="/dashboard" 
                      element={
                        <ProtectedRoute allowedRoles={['bider', 'admin']}>
                          <Dashboard />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/bids" 
                      element={
                        <ProtectedRoute allowedRoles={['bider', 'admin']}>
                          <Bids />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/resumes" 
                      element={
                        <ProtectedRoute allowedRoles={['admin']}>
                          <Resumes />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/templates" 
                      element={
                        <ProtectedRoute allowedRoles={['admin']}>
                          <Templates />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/users" 
                      element={
                        <ProtectedRoute allowedRoles={['admin']}>
                          <Users />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/companies" 
                      element={
                        <ProtectedRoute allowedRoles={['admin']}>
                          <Companies />
                        </ProtectedRoute>
                      } 
                    />
                  </Routes>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
