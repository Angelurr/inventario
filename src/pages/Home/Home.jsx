import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import SessionHistory from "../../components/SessionHistory/SessionHistory";
import Clientes from "../../components/Clientes/Clientes";
import Productos from "../../components/Productos/Productos";
import Ventas from "../../components/Ventas/Ventas";
import Reportes from "../../components/Reportes/Reportes";
import "./Home.css";

function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");
  const menuRef = useRef(null);
  const [stats, setStats] = useState({ sessionsCount: 0, clientsCount: 0, loading: true });

  // Consultar estadísticas dinámicamente para el Dashboard
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        // Consultar total de sesiones
        const sessionsQuery = query(collection(db, "sessionHistory"));
        const sessionsSnap = await getDocs(sessionsQuery);
        const sessionsCount = sessionsSnap.size;

        // Resolver el nombre para la colección dinámica
        const currentDisplayName = user.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "usuario";
        const sanitizedName = currentDisplayName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "_")
          .replace(/_+/g, "_")
          .trim();

        // Consultar clientes creados por este usuario
        const clientsQuery = query(
          collection(db, `clientes_${sanitizedName}`),
          where("creadoPor", "==", user.uid)
        );
        const clientsSnap = await getDocs(clientsQuery);
        const clientsCount = clientsSnap.size;

        setStats({
          sessionsCount,
          clientsCount,
          loading: false,
        });
      } catch (error) {
        console.error("Error al obtener estadísticas del dashboard:", error);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, [user, activeView, userData]);

  // Get user data from Firestore
  useEffect(() => {
    if (!user) return;

    const getUserData = async () => {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        setUserData(data);
        localStorage.setItem(`userData_${user.uid}`, JSON.stringify(data));
      }
    };

    const savedUserData = localStorage.getItem(`userData_${user.uid}`);
    if (savedUserData) {
      setUserData(JSON.parse(savedUserData));
    }

    getUserData();
  }, [user]);

  // Close profile menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = async (event) => {
        const img = new Image();
        img.src = event.target.result;

        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 300;
          const MAX_HEIGHT = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const base64Image = canvas.toDataURL("image/jpeg", 0.7);

          try {
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, { photoURL: base64Image }, { merge: true });

            const updatedData = { ...userData, photoURL: base64Image };
            setUserData(updatedData);
            localStorage.setItem(`userData_${user.uid}`, JSON.stringify(updatedData));
          } catch (error) {
            console.error("Error guardando imagen en base de datos:", error);
            alert("Error al guardar la imagen: " + error.message);
          } finally {
            setIsUploading(false);
          }
        };
      };
      reader.onerror = (error) => {
        console.error("Error leyendo el archivo:", error);
        setIsUploading(false);
      };
    } catch (error) {
      console.error("Error en proceso de imagen:", error);
      setIsUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (user) {
        localStorage.removeItem(`historial_${user.uid}`);
        localStorage.removeItem(`userData_${user.uid}`);
      }
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const displayName = user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "");
  const userEmail = user?.email || userData?.email || "";
  const userInitial = userData?.nombre?.charAt(0) || user?.email?.charAt(0) || "U";
  const photoURL = userData?.photoURL || user?.photoURL;

  return (
    <div className="home-layout">
      {activeView === "dashboard" ? (
        <div className="fullscreen-portal">
          <div className="portal-container">
            <div className="portal-profile-header">
              <div className="portal-avatar-container">
                <div className={`portal-avatar ${isUploading ? "uploading" : ""}`}>
                  {isUploading ? (
                    <div className="avatar-spinner"></div>
                  ) : photoURL ? (
                    <img src={photoURL} alt="Perfil" />
                  ) : (
                    <span>{userInitial}</span>
                  )}
                </div>
                <button 
                  className="portal-change-photo-badge" 
                  onClick={() => document.getElementById('fileInput').click()} 
                  title="Cambiar foto de perfil"
                  disabled={isUploading}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                </button>
              </div>

              <div className="portal-user-details">
                <h1 className="portal-greeting">¡Bienvenido, {displayName || "Usuario"}!</h1>
                <p className="portal-email">{userEmail}</p>
                <span className="portal-provider-badge">
                  Conectado con {user?.providerData?.[0]?.providerId === "google.com" ? "Google" : "Email y Contraseña"}
                </span>
              </div>
            </div>

            {/* Central Action Button */}
            <div className="portal-action-container">
              <button className="btn-portal-enter" onClick={() => setActiveView("historial")}>
                Ir a Dashboard
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
              <button className="btn-portal-logout" onClick={handleLogout}>
                Cerrar Sesión
              </button>
            </div>
          </div>

          <input
            type="file"
            id="fileInput"
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleImageChange}
          />
        </div>
      ) : (
        /* ===== SUB-PAGES SIDEBAR LAYOUT ===== */
        <>
          {/* ===== LEFT SIDEBAR ===== */}
          <aside className={`home-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
            <div className="sidebar-brand">
              <div 
                className="brand-icon" 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{ cursor: "pointer" }}
                title={sidebarCollapsed ? "Expandir" : ""}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              {!sidebarCollapsed && (
                <>
                  <span className="brand-name">SessionApp</span>
                  <button 
                    className="sidebar-toggle" 
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
                    title="Colapsar"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Sidebar Nav */}
            <nav className="sidebar-nav">
              <div className="nav-section-label">{!sidebarCollapsed && "MENÚ"}</div>
              <a 
                className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("dashboard"); }}
                title="Dashboard"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                {!sidebarCollapsed && <span>Dashboard / Inicio</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "historial" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("historial"); }}
                title="Historial"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {!sidebarCollapsed && <span>Historial</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "clientes" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("clientes"); }}
                title="Clientes"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                {!sidebarCollapsed && <span>Clientes</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "productos" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("productos"); }}
                title="Productos"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
                {!sidebarCollapsed && <span>Productos</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "ventas" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("ventas"); }}
                title="Ventas"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                {!sidebarCollapsed && <span>Ventas</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "reportes" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("reportes"); }}
                title="Reportes"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                {!sidebarCollapsed && <span>Reportes</span>}
              </a>
              <a 
                className={`nav-item ${activeView === "perfil" ? "active" : ""}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveView("perfil"); }}
                title="Mi Perfil"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                {!sidebarCollapsed && <span>Mi Perfil</span>}
              </a>
              <a 
                className="nav-item sidebar-logout-btn" 
                href="#" 
                onClick={(e) => { e.preventDefault(); handleLogout(); }}
                title="Cerrar Sesión"
                style={{ marginTop: "auto", color: "#ff7675" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                {!sidebarCollapsed && <span>Cerrar Sesión</span>}
              </a>
            </nav>

            {/* Sidebar User Card */}
            {!sidebarCollapsed && (
              <div className="sidebar-user-card">
                <div className="sidebar-user-avatar">
                  {photoURL ? (
                    <img src={photoURL} alt="Perfil" />
                  ) : (
                    <span>{userInitial}</span>
                  )}
                </div>
                <div className="sidebar-user-info">
                  <span className="sidebar-user-name">{displayName || "Usuario"}</span>
                  <span className="sidebar-user-role">Miembro</span>
                </div>
              </div>
            )}
          </aside>

          {/* ===== MAIN CONTENT AREA ===== */}
          <div className="home-main">
            {/* ===== TOP HEADER ===== */}
            <header className="home-header">
              <div className="header-left" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "20px" }}>
                <button 
                  className="btn-back-dashboard-header" 
                  onClick={() => setActiveView("dashboard")}
                  title="Volver al Dashboard de Bienvenida"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                  Volver al Inicio
                </button>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <h1 className="header-greeting" style={{ fontSize: "1.1rem" }}>
                    ¡Bienvenido{displayName ? `, ${displayName.split(" ")[0]}` : ""}!
                  </h1>
                  <p className="header-subtitle">
                    {activeView === "historial" && "Aquí puedes ver y gestionar tu historial de sesiones"}
                    {activeView === "clientes" && "Aquí puedes ver y estructurar la información de tus clientes"}
                    {activeView === "productos" && "Aquí puedes ver y estructurar la información de tus productos"}
                    {activeView === "ventas" && "Aquí puedes ver y gestionar tus transacciones de ventas"}
                    {activeView === "reportes" && "Estadísticas comerciales, volumen de ventas y ganancias netas"}
                    {activeView === "perfil" && "Gestión de información personal e imagen"}
                  </p>
                </div>
              </div>

              <div className="header-right">
                {/* Profile Button */}
                <div className="profile-dropdown" ref={menuRef}>
                  <button
                    className="profile-trigger"
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    id="profile-menu-trigger"
                  >
                    <div className={`header-avatar ${isUploading ? "uploading" : ""}`}>
                      {isUploading ? (
                        <div className="avatar-spinner"></div>
                      ) : photoURL ? (
                        <img src={photoURL} alt="Perfil" />
                      ) : (
                        <span>{userInitial}</span>
                      )}
                    </div>
                    <div className="profile-trigger-info">
                      <span className="profile-trigger-name">{displayName || "Usuario"}</span>
                      <span className="profile-trigger-email">{userEmail}</span>
                    </div>
                    <svg className={`profile-chevron ${profileMenuOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {profileMenuOpen && (
                    <div className="profile-menu" id="profile-dropdown-menu">
                      <div className="profile-menu-header">
                        <div className="pm-avatar">
                          {photoURL ? (
                            <img src={photoURL} alt="Perfil" />
                          ) : (
                            <span>{userInitial}</span>
                          )}
                        </div>
                        <div className="pm-info">
                          <span className="pm-name">{displayName || "Usuario"}</span>
                          <span className="pm-email">{userEmail}</span>
                        </div>
                      </div>

                      <div className="profile-menu-divider"></div>

                      <button className="profile-menu-item" onClick={() => { setActiveView("perfil"); setProfileMenuOpen(false); }} id="view-profile-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        Ver mi Perfil
                      </button>

                      <button className="profile-menu-item" onClick={() => { document.getElementById('fileInput').click(); setProfileMenuOpen(false); }} id="change-photo-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                          <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                        Cambiar foto de perfil
                      </button>

                      <div className="profile-menu-divider"></div>

                      <button className="profile-menu-item logout" onClick={handleLogout} id="logout-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Cerrar Sesión
                      </button>
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  id="fileInput"
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </div>
            </header>

            {/* ===== CONTENT AREA ===== */}
            <main className="home-content">
              {activeView === "historial" && <SessionHistory />}
              {activeView === "clientes" && <Clientes currentUserDisplayName={displayName} />}
              {activeView === "productos" && <Productos currentUserDisplayName={displayName} />}
              {activeView === "ventas" && <Ventas currentUserDisplayName={displayName} />}
              {activeView === "reportes" && <Reportes currentUserDisplayName={displayName} />}
              
              {activeView === "perfil" && (
                <div className="profile-view-container">
                  <div className="profile-view-header">
                    <button className="btn-back-dashboard" onClick={() => setActiveView("dashboard")}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                      </svg>
                      Volver al Dashboard
                    </button>
                    <h2>Perfil del Usuario</h2>
                    <p>Información detallada de la cuenta y opciones de seguridad.</p>
                  </div>

                  <div className="profile-view-grid">
                    {/* Tarjeta Izquierda: Foto y Nombre */}
                    <div className="profile-left-card">
                      <div className="profile-photo-section">
                        <div className={`profile-photo-wrapper ${isUploading ? "uploading" : ""}`}>
                          {isUploading ? (
                            <div className="avatar-spinner large"></div>
                          ) : photoURL ? (
                            <img src={photoURL} alt="Foto de Perfil" />
                          ) : (
                            <span>{userInitial}</span>
                          )}
                        </div>
                        <button 
                          className="btn-upload-photo" 
                          onClick={() => document.getElementById('fileInput').click()}
                          disabled={isUploading}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                          </svg>
                          {photoURL ? "Actualizar Foto" : "Subir Foto"}
                        </button>
                        <p className="photo-instructions">Soporta formatos JPG, PNG. Máx 300x300 px (se redimensiona localmente).</p>
                      </div>
                      
                      <div className="profile-name-section">
                        <h3>{displayName || "Usuario de SessionApp"}</h3>
                        <span className="profile-role-badge">Administrador</span>
                      </div>
                    </div>

                    {/* Tarjeta Derecha: Datos e Info Técnica */}
                    <div className="profile-right-card">
                      <h3>Detalles de la Cuenta</h3>
                      <div className="profile-details-list">
                        <div className="profile-detail-row">
                          <div className="detail-label">Nombre Completo</div>
                          <div className="detail-value">{displayName || "No especificado"}</div>
                        </div>
                        <div className="profile-detail-row">
                          <div className="detail-label">Correo Electrónico</div>
                          <div className="detail-value">{userEmail || "No especificado"}</div>
                        </div>
                        <div className="profile-detail-row">
                          <div className="detail-label">Proveedor de Autenticación</div>
                          <div className="detail-value">
                            {user?.providerData?.[0]?.providerId === "google.com" ? (
                              <span className="provider-tag google">Google OAuth</span>
                            ) : (
                              <span className="provider-tag email">Correo y Contraseña</span>
                            )}
                          </div>
                        </div>
                        <div className="profile-detail-row">
                          <div className="detail-label">Token de Seguridad (UID)</div>
                          <div className="detail-value uid-value">{user?.uid}</div>
                        </div>
                        {userData?.createdAt && (
                          <div className="profile-detail-row">
                            <div className="detail-label">Fecha de Registro</div>
                            <div className="detail-value">
                              {new Date(userData.createdAt.seconds ? userData.createdAt.seconds * 1000 : userData.createdAt).toLocaleString("es-CO", { dateStyle: "long" })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="profile-security-note">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <div>
                          <strong>Seguridad de la sesión</strong>
                          <p>Tu sesión se cerrará automáticamente tras 5 minutos de inactividad para proteger tus datos.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}

export default Home;
