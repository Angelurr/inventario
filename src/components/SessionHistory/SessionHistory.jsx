import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, where, getDocs, doc, getDoc, limit } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import "./SessionHistory.css";

// Cache for user data lookups to avoid repeated Firestore reads
const userDataCache = {};

// Detect provider and email from user document flags
const resolveUserData = async (userId) => {
  if (userDataCache[userId]) return userDataCache[userId];
  
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      let provider = "email";
      if (data.registroConGoogle) provider = "google";
      
      const result = { provider, email: data.email || "" };
      userDataCache[userId] = result;
      return result;
    }
  } catch (error) {
    console.error("Error resolving user data for:", userId, error);
  }
  
  return { provider: "email", email: "" };
};

// Provider icon components
const ProviderIcon = ({ provider }) => {
  switch (provider) {
    case "google":
      return (
        <span className="sh-provider-badge google" title="Google">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </span>
      );

    default:
      return (
        <span className="sh-provider-badge email-provider" title="Email">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          Email
        </span>
      );
  }
};

function SessionHistory() {
  const { user } = useAuth();
  const [historyData, setHistoryData] = useState([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUserId, setSearchedUserId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Real-time listener: all sessions by default, filtered when searching
  useEffect(() => {
    let q;

    // Aumentamos el límite para permitir paginación por números en el cliente
    const queryLimit = 500;

    if (isSearching && searchedUserId) {
      q = query(
        collection(db, "sessionHistory"),
        where("userId", "==", searchedUserId),
        orderBy("startTime", "desc"),
        limit(queryLimit)
      );
    } else {
      q = query(
        collection(db, "sessionHistory"),
        orderBy("startTime", "desc"),
        limit(queryLimit)
      );
    }

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const sessions = [];
      querySnapshot.forEach((docSnap) => {
        sessions.push({ id: docSnap.id, ...docSnap.data() });
      });

      // For sessions missing provider or email, resolve from user document
      const resolvedSessions = await Promise.all(
        sessions.map(async (session) => {
          if ((!session.provider || !session.email) && session.userId) {
            const userData = await resolveUserData(session.userId);
            return {
              ...session,
              provider: session.provider || userData.provider,
              email: session.email || userData.email,
            };
          }
          return session;
        })
      );

      setHistoryData(resolvedSessions);
    });

    return () => unsubscribe();
  }, [isSearching, searchedUserId]);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchError("");
    setSearchedUserId(null);
    setCurrentPage(1); // Reset to page 1 on new search

    const emailToSearch = searchEmail.trim().toLowerCase();

    if (!emailToSearch) {
      setIsSearching(false);
      return;
    }

    // Verify the email exists in the users collection and get their UID
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", emailToSearch));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setSearchError("No se encontró ningún usuario con ese correo");
        setIsSearching(false);
        return;
      }

      const userData = querySnapshot.docs[0].data();
      setSearchedUserId(userData.uid);
      setIsSearching(true);
    } catch (error) {
      console.error("Error en la búsqueda:", error);
      setSearchError("Error al realizar la búsqueda");
    }
  };

  const clearSearch = () => {
    setSearchEmail("");
    setSearchedUserId(null);
    setIsSearching(false);
    setSearchError("");
    setCurrentPage(1);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    return new Date(timestamp.seconds * 1000).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const exportToPDF = async () => {
    try {
      let jsPDFClass = window.jspdf?.jsPDF;
      if (!jsPDFClass) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          script.onload = () => {
            const autoTableScript = document.createElement("script");
            autoTableScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js";
            autoTableScript.onload = () => {
              resolve();
            };
            autoTableScript.onerror = () => reject(new Error("Error al cargar la tabla del PDF"));
            document.body.appendChild(autoTableScript);
          };
          script.onerror = () => reject(new Error("Error al cargar la librería PDF"));
          document.body.appendChild(script);
        });
        jsPDFClass = window.jspdf?.jsPDF;
      }

      if (!jsPDFClass) {
        throw new Error("No se pudo iniciar la librería de PDF");
      }

      const doc = new jsPDFClass();
      
      // Título y detalles
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(46, 92, 138); // #2E5C8A
      doc.text("SessionApp — Historial de Sesiones", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);
      
      let filterText = "Todos los usuarios";
      if (isSearching && searchEmail) {
        filterText = `Usuario: ${searchEmail}`;
      }
      const statusText = filterStatus === "all" ? "Todas" : filterStatus === "activa" ? "Activas" : "Finalizadas";
      doc.text(`Filtros: ${filterText} | Estado: ${statusText} | Total: ${baseFilteredData.length} registros`, 14, 34);
      
      // Dibujar una línea decorativa
      doc.setDrawColor(212, 227, 245); // #D4E3F5
      doc.setLineWidth(0.5);
      doc.line(14, 38, 196, 38);

      const tableColumns = ["#", "Usuario", "Correo", "Proveedor", "Estado", "Inicio de Sesión", "Fin de Sesión"];
      const tableRows = baseFilteredData.map((item, index) => [
        index + 1,
        `${item.nombre || ""} ${item.apellidos || ""}`.trim() || "Usuario",
        item.email || "—",
        item.provider ? item.provider.toUpperCase() : "EMAIL",
        item.status,
        formatDate(item.startTime),
        item.status === "Activa" ? "En curso" : formatDate(item.endTime)
      ]);

      doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 42,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
        headStyles: { fillColor: [46, 92, 138], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 253] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 40 },
          2: { cellWidth: 45 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 30 },
          6: { cellWidth: 30 }
        }
      });

      doc.save(`historial_sesiones_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      alert(error.message || "Hubo un error al generar el PDF.");
    }
  };

  const baseFilteredData = historyData.filter((item) => {
    if (filterStatus === "all") return true;
    return item.status.toLowerCase() === filterStatus;
  });

  const totalPages = Math.ceil(baseFilteredData.length / itemsPerPage);
  
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = baseFilteredData.slice(startIndex, startIndex + itemsPerPage);

  const activeCount = historyData.filter((s) => s.status === "Activa").length;
  const finishedCount = historyData.filter((s) => s.status === "Finalizado").length;

  return (
    <div className="session-history">
      {/* Header Section */}
      <div className="sh-header">
        <div className="sh-title-row">
          <div className="sh-title-group">
            <h2 className="sh-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              {isSearching ? `Sesiones de: ${searchEmail}` : "Historial de Sesiones — Todos los Usuarios"}
            </h2>
            <span className="sh-count">{baseFilteredData.length} registro{baseFilteredData.length !== 1 ? "s" : ""}</span>
          </div>
          <button 
            className="sh-export-pdf-btn" 
            onClick={exportToPDF} 
            title="Exportar a PDF"
            disabled={baseFilteredData.length === 0}
            style={{ opacity: baseFilteredData.length === 0 ? 0.6 : 1, cursor: baseFilteredData.length === 0 ? "not-allowed" : "pointer" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Exportar PDF
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="sh-search-form">
          <div className="sh-search-wrapper">
            <svg className="sh-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="email"
              placeholder="Filtrar sesiones por correo electrónico..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="sh-search-input"
            />
            <button type="submit" className="sh-search-btn" title="Buscar">
              Buscar
            </button>
          </div>
          {isSearching && (
            <button type="button" onClick={clearSearch} className="sh-clear-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Ver todas las sesiones
            </button>
          )}
        </form>

        {searchError && (
          <div className="sh-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            {searchError}
          </div>
        )}

        {/* Stats Pills */}
        <div className="sh-stats">
          <button
            className={`sh-pill ${filterStatus === "all" ? "active" : ""}`}
            onClick={() => { setFilterStatus("all"); setCurrentPage(1); }}
          >
            <span className="sh-pill-dot all"></span>
            Todas
            <span className="sh-pill-count">{historyData.length}</span>
          </button>
          <button
            className={`sh-pill ${filterStatus === "activa" ? "active" : ""}`}
            onClick={() => { setFilterStatus("activa"); setCurrentPage(1); }}
          >
            <span className="sh-pill-dot activa"></span>
            Activas
            <span className="sh-pill-count">{activeCount}</span>
          </button>
          <button
            className={`sh-pill ${filterStatus === "finalizado" ? "active" : ""}`}
            onClick={() => { setFilterStatus("finalizado"); setCurrentPage(1); }}
          >
            <span className="sh-pill-dot finalizado"></span>
            Finalizadas
            <span className="sh-pill-count">{finishedCount}</span>
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="sh-table-container">
        {paginatedData.length > 0 ? (
          <>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Proveedor</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item, index) => (
                  <tr key={item.id} className={`sh-row ${item.status.toLowerCase()}`}>
                    <td className="sh-cell-index">{startIndex + index + 1}</td>
                    <td className="sh-cell-user">
                      <div className="sh-user-info">
                        <div className="sh-user-avatar">
                          {item.nombre?.charAt(0) || "U"}
                        </div>
                        <span>{`${item.nombre || ""} ${item.apellidos || ""}`.trim() || "Usuario"}</span>
                      </div>
                    </td>
                    <td className="sh-cell-email">{item.email || "—"}</td>
                    <td className="sh-cell-provider">
                      <ProviderIcon provider={item.provider} />
                    </td>
                    <td>
                      <span className={`sh-status-badge ${item.status.toLowerCase()}`}>
                        <span className="sh-status-dot"></span>
                        {item.status}
                      </span>
                    </td>
                    <td className="sh-cell-date">{formatDate(item.startTime)}</td>
                    <td className="sh-cell-date">
                      {item.status === "Activa" ? (
                        <span className="sh-active-label">
                          <span className="sh-pulse"></span>
                          En curso
                        </span>
                      ) : (
                        formatDate(item.endTime)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="sh-pagination">
                <button 
                  className="sh-page-nav" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                
                <div className="sh-page-numbers">
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i + 1}
                      className={`sh-page-number ${currentPage === i + 1 ? "active" : ""}`}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button 
                  className="sh-page-nav" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="sh-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <p>No hay sesiones registradas</p>
            <span>Las sesiones aparecerán aquí cuando los usuarios inicien sesión</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionHistory;
