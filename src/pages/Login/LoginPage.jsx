import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "./LoginPage.css";

function LoginPage() {
  const { signin, signInWithGoogle, user, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirigir al inicio si ya está autenticado
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = "El correo electrónico es obligatorio";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Por favor ingresa un correo electrónico válido";
    }

    if (!formData.password.trim()) {
      newErrors.password = "La contraseña es obligatoria";
    } else if (formData.password.length < 6) {
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      await signin(formData.email.toLowerCase(), formData.password);
      setFormData({ email: "", password: "" });
      navigate("/");
    } catch (err) {
      // Usamos el mensaje traducido que viene del AuthContext
      setError(err.message);
      console.error("Error en login:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);

    try {
      await signInWithGoogle();
      navigate("/");
    } catch (err) {
      setError(err.message);
      console.error("Error en Google sign-in:", err);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Iniciar Sesión</h1>
          <p>Bienvenido de vuelta</p>
        </div>

        {/* Alert de error */}
        {error && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 16px",
              backgroundColor: "#fff5f5",
              border: "2px solid #e74c3c",
              borderRadius: "8px",
              color: "#e74c3c",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Campo de Email */}
          <div className="form-group">
            <label htmlFor="email">Correo Electrónico</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="ejemplo@correo.com"
              className={errors.email ? "input-error" : ""}
            />
            {errors.email && (
              <span className="error-message">{errors.email}</span>
            )}
          </div>

          {/* Campo de Contraseña */}
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Ingresa tu contraseña"
              className={errors.password ? "input-error" : ""}
            />
            {errors.password && (
              <span className="error-message">{errors.password}</span>
            )}
          </div>

          {/* Enlace de recuperación */}
          <div className="login-options">
            <Link to="/forgot" className="forgot-password-link">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón de Envío */}
          <button
            type="submit"
            disabled={loading}
            className="btn-login"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </button>
        </form>

        {/* Botones Sociales */}
        <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginTop: "20px" }}>
          {/* Botón de Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="btn-google"
            style={{
              width: "60px",
              height: "60px",
              padding: "10px",
              backgroundColor: "#ffffff",
              border: "2px solid #e0e0e0",
              borderRadius: "12px",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.3s ease",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)"}
            title="Iniciar sesión con Google"
          >
            <svg width="32" height="32" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </button>

        </div>

        {/* Enlaces de Navegación */}
        <div className="login-links">
          <Link to="/forgot" className="link-forgot">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {/* Sección de Registro */}
        <div className="login-footer">
          <p>
            ¿No tienes cuenta?{" "}
            <Link to="/register" className="link-register">
              Crea una aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
