import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "./RegisterPage.css";

const initialForm = {
  nombre: "",
  apellidos: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function RegisterPage() {
  const { signup, user, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState(initialForm);
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

  const validatePassword = (password) => {
    return (
      password.length >= 10 &&
      password.length <= 72 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre es obligatorio";
    } else if (formData.nombre.trim().length < 2) {
      newErrors.nombre = "El nombre debe tener al menos 2 caracteres";
    }

    if (!formData.apellidos.trim()) {
      newErrors.apellidos = "Los apellidos son obligatorios";
    } else if (formData.apellidos.trim().length < 2) {
      newErrors.apellidos = "Los apellidos deben tener al menos 2 caracteres";
    }

    if (!formData.email.trim()) {
      newErrors.email = "El correo electrónico es obligatorio";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Por favor ingresa un correo electrónico válido";
    }

    if (!formData.password) {
      newErrors.password = "La contraseña es obligatoria";
    } else if (!validatePassword(formData.password)) {
      newErrors.password =
        "La contraseña debe tener entre 10 y 72 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial (ej. !@#$)";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Por favor confirma tu contraseña";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Las contraseñas no coinciden";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value ?? "" }));
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
      const datosRegistro = {
        nombre: formData.nombre.trim(),
        apellidos: formData.apellidos.trim(),
        email: formData.email.toLowerCase(),
        password: formData.password,
      };

      await signup(datosRegistro.email, datosRegistro.password, {
        nombre: datosRegistro.nombre,
        apellidos: datosRegistro.apellidos,
      });

      // Guardar información adicional del usuario si es necesario
      localStorage.setItem(
        "datosUsuario",
        JSON.stringify({
          nombre: datosRegistro.nombre,
          apellidos: datosRegistro.apellidos,
          email: datosRegistro.email,
        })
      );

      setFormData(initialForm);
      setErrors({});
      navigate("/login");
    } catch (err) {
      setError(err.message);
      console.error("Error en registro:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        {/* Header */}
        <div className="register-header">
          <h1>Crear Cuenta</h1>
          <p>Completa tus datos para registrarte</p>
        </div>

        {/* Alert de error */}
        {error && (
          <div style={{
            marginBottom: "20px",
            padding: "12px 16px",
            backgroundColor: "#fff5f5",
            border: "2px solid #e74c3c",
            borderRadius: "8px",
            color: "#e74c3c",
            fontSize: "14px",
            fontWeight: "600"
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="register-form">
          {/* Nombre */}
          <div className="form-group">
            <label htmlFor="nombre">Nombre</label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleInputChange}
              placeholder="Ingresa tu nombre"
              className={errors.nombre ? "input-error" : ""}
            />
            {errors.nombre && (
              <span className="error-message">{errors.nombre}</span>
            )}
          </div>

          {/* Apellidos */}
          <div className="form-group">
            <label htmlFor="apellidos">Apellidos</label>
            <input
              type="text"
              id="apellidos"
              name="apellidos"
              value={formData.apellidos}
              onChange={handleInputChange}
              placeholder="Ingresa tus apellidos"
              className={errors.apellidos ? "input-error" : ""}
            />
            {errors.apellidos && (
              <span className="error-message">{errors.apellidos}</span>
            )}
          </div>

          {/* Email */}
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

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="••••••••"
              className={errors.password ? "input-error" : ""}
            />
            {errors.password && (
              <span className="error-message">{errors.password}</span>
            )}
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Contraseña</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="••••••••"
              className={errors.confirmPassword ? "input-error" : ""}
            />
            {errors.confirmPassword && (
              <span className="error-message">{errors.confirmPassword}</span>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-register"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Registrando..." : "Crear Cuenta"}
          </button>
        </form>

        {/* Footer */}
        <div className="register-footer">
          <p>
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="link-register">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;