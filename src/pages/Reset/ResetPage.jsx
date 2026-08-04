import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './ResetPage.css';

export default function ResetPage() {
  const { user, loading: authLoading, verifyResetCode, confirmReset } = useAuth();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [resetExitoso, setResetExitoso] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [emailRecuperacion, setEmailRecuperacion] = useState('');
  const [mensajeError, setMensajeError] = useState('');
  const [oobCode, setOobCode] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const navigate = useNavigate();

  // Redirigir al inicio si ya está autenticado
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Verificar el oobCode de la URL o fallback a localStorage
  useEffect(() => {
    const code = searchParams.get('oobCode');

    if (code) {
      // Flujo Firebase: verificar el código de restablecimiento
      setOobCode(code);
      verifyResetCode(code)
        .then((email) => {
          setEmailRecuperacion(email);
          setVerificando(false);
        })
        .catch((error) => {
          console.error("Error al verificar código de restablecimiento:", error);
          setMensajeError(
            'El enlace de recuperación ha expirado o es inválido. Por favor, solicita uno nuevo.'
          );
          setVerificando(false);
          setTimeout(() => navigate('/forgot'), 3000);
        });
    } else {
      // Flujo legacy: usar email de localStorage
      const email = localStorage.getItem('emailRecuperacion');
      if (!email) {
        setMensajeError(
          'No hay solicitud de recuperación. Por favor, intenta nuevamente desde ¿Olvidaste tu contraseña?'
        );
        setVerificando(false);
        setTimeout(() => navigate('/forgot'), 2000);
      } else {
        setEmailRecuperacion(email);
        setVerificando(false);
      }
    }
  }, [searchParams, navigate, verifyResetCode]);

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

    if (!formData.password) {
      newErrors.password = 'La contraseña es obligatoria';
    } else if (!validatePassword(formData.password)) {
      newErrors.password = 'La contraseña debe tener entre 10 y 72 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial (ej. !@#$)';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Por favor confirma tu contraseña';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // useEffect: muestra el toast, espera 2.5s y redirige
  useEffect(() => {
    if (!resetExitoso) return;

    setToastVisible(true);

    const timer = setTimeout(() => {
      setToastVisible(false);
      setResetExitoso(false);
      setFormData({ password: '', confirmPassword: '' });
      setErrors({});
      
      // Limpiar email de recuperación
      localStorage.removeItem('emailRecuperacion');
      
      navigate('/login');
    }, 2500);

    return () => clearTimeout(timer);
  }, [resetExitoso, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm() || !emailRecuperacion) return;

    if (oobCode) {
      // Flujo Firebase: confirmar el restablecimiento con el oobCode
      try {
        await confirmReset(oobCode, formData.password);
        console.log('✅ Contraseña actualizada en Firebase Auth para:', emailRecuperacion);
        setResetExitoso(true);
      } catch (error) {
        console.error('Error al restablecer contraseña:', error);
        if (error.code === 'auth/expired-action-code') {
          setMensajeError('El enlace de recuperación ha expirado. Por favor, solicita uno nuevo.');
        } else if (error.code === 'auth/invalid-action-code') {
          setMensajeError('El enlace de recuperación es inválido o ya fue utilizado.');
        } else if (error.code === 'auth/weak-password') {
          setErrors({ password: 'La contraseña es muy débil. Intenta con una más segura.' });
        } else {
          setMensajeError(error.message || 'Error al restablecer la contraseña.');
        }
      }
    } else {
      // Flujo legacy: actualizar en localStorage
      const usuariosGuardados = JSON.parse(localStorage.getItem('usuarios') || '[]');
      const usuarioIndex = usuariosGuardados.findIndex(
        u => u.email.toLowerCase() === emailRecuperacion.toLowerCase()
      );

      if (usuarioIndex !== -1) {
        usuariosGuardados[usuarioIndex].password = formData.password;
        localStorage.setItem('usuarios', JSON.stringify(usuariosGuardados));
        console.log('✅ Contraseña actualizada (localStorage) para:', emailRecuperacion);
        setResetExitoso(true);
      } else {
        setMensajeError('No se encontró la cuenta. Por favor intenta de nuevo.');
      }
    }
  };

  return (
    <div className="reset-container">
      <div className="reset-card">
        <div className="reset-header">
          <h1>Restablecer Contraseña</h1>
          <p>Ingresa tu nueva contraseña</p>
          {emailRecuperacion && (
            <p style={{ fontSize: '12px', color: '#7A9AC7', marginTop: '8px' }}>
              Cuenta: {emailRecuperacion}
            </p>
          )}
        </div>

        {verificando ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#7A9AC7'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              border: '3px solid rgba(122, 154, 199, 0.2)',
              borderTopColor: '#7A9AC7',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p>Verificando enlace de recuperación...</p>
          </div>
        ) : mensajeError ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: '#e74c3c',
            backgroundColor: '#fff5f5',
            borderRadius: '8px',
            border: '1px solid #e74c3c'
          }}>
            <p>{mensajeError}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="reset-form">
            <div className="form-group">
              <label htmlFor="password">Nueva Contraseña</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Nueva contraseña"
                className={errors.password ? 'input-error' : ''}
              />
              {errors.password && <span className="error-message">{errors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmar Contraseña</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Repite tu nueva contraseña"
                className={errors.confirmPassword ? 'input-error' : ''}
              />
              {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
            </div>

            <button type="submit" className="btn-reset">
              Cambiar Contraseña
            </button>
          </form>
        )}

        <div className="reset-footer">
          <p>
            ¿Recordaste tu contraseña?{' '}
            <a onClick={() => navigate('/login')} className="link-login">
              Inicia sesión aquí
            </a>
          </p>
        </div>
      </div>

      {/* Toast de éxito */}
      {toastVisible && (
        <div className="toast-container">
          <div className="toast">
            <div className="toast-icon">✓</div>
            <div className="toast-text">
              <span className="toast-title">¡Contraseña cambiada!</span>
              <span className="toast-sub">Redirigiendo al inicio de sesión...</span>
            </div>
            <div className="toast-progress" />
          </div>
        </div>
      )}
    </div>
  );
}