import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home/Home";
import LoginPage from "./pages/Login/LoginPage";
import RegisterPage from "./pages/Register/RegisterPage";
import ForgotPage from "./pages/Forgot/ForgotPage";
import ResetPage from "./pages/Reset/ResetPage";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoutes } from "./pages/ProtectedRoutes/ProtectedRoutes";
import "./App.css";

function App() {
  return (
    <div className="w-full min-h-screen">
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoutes>
                <Home />
              </ProtectedRoutes>
            }
            
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot" element={<ForgotPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </div>
  );
}

export default App;
