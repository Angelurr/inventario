import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./ProtectedRoutes.css";

export function ProtectedRoutes({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-card">
          <div className="spinner"></div>
          <p className="loading-text">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
