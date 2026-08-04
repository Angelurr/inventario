import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./ForgotPasswordPage.css";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      await resetPassword(email);
      setMessage("Se ha enviado un enlace de recuperación a tu correo electrónico.");
    } catch (err) {
      setError(err.message || "Error al enviar el correo de recuperación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-container">
        <div className="forgot-password-card">
          <div className="forgot-password-header">
            <div className="forgot-password-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 className="forgot-password-title">Recuperar Contraseña</h1>
            <p className="forgot-password-subtitle">
              Ingresa tu correo y te enviaremos un enlace para restablecer tu cuenta.
            </p>
          </div>

          <form className="forgot-password-form" onSubmit={handleSubmit}>
            {error && <div className="forgot-password-alert error">{error}</div>}
            {message && <div className="forgot-password-alert success">{message}</div>}

            <div className="form-group">
              <label htmlFor="email">Correo Electrónico</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input
                  type="email"
                  id="email"
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="forgot-password-btn" disabled={loading}>
              {loading ? "Enviando..." : "Enviar Enlace"}
            </button>
          </form>

          <div className="forgot-password-footer">
            <span>¿Ya recordaste tu contraseña? </span>
            <Link to="/login" className="login-link">Volver al inicio de sesión</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
