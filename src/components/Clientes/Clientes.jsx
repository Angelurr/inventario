import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { 
  subscribeClientes, 
  addCliente, 
  updateCliente, 
  deleteCliente,
  checkDocumentoExiste 
} from "../../services/clientesService";
import "./Clientes.css";

function Clientes({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("lista"); // 'lista' | 'esquema'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Estados de los Modales
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [currentClienteId, setCurrentClienteId] = useState(null);
  
  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState(null);

  // Estados del Formulario
  const initialFormState = {
    tipoDocumento: "CC",
    documento: "",
    nombres: "",
    apellidos: "",
    email: "",
    telefono: "",
    direccion: "",
    estado: "Activo"
  };
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Estados de Notificación / Toast Alerts
  const [toastAlert, setToastAlert] = useState(null);

  // Definición del esquema para visualización
  const schemaDefinition = [
    { name: "id", type: "string", required: "Sí (Autogenerado)", desc: "Identificador único del cliente asignado automáticamente por Firestore." },
    { name: "tipoDocumento", type: "string", required: "No", desc: "Tipo de documento legal. Valores recomendados: CC, CE, NIT, PP." },
    { name: "documento", type: "string", required: "No", desc: "Número de documento de identidad." },
    { name: "nombres", type: "string", required: "Sí", desc: "Nombre(s) del cliente o razón social principal." },
    { name: "apellidos", type: "string", required: "Sí", desc: "Apellido(s) del cliente o siglas comerciales (ej. S.A.S.)." },
    { name: "email", type: "string", required: "No", desc: "Correo electrónico principal de contacto." },
    { name: "telefono", type: "string", required: "No", desc: "Número de teléfono fijo o móvil." },
    { name: "direccion", type: "string", required: "No", desc: "Dirección física de residencia o domicilio fiscal." },
    { name: "creadoPor", type: "string", required: "Sí", desc: "ID único (uid) del usuario administrador que creó el registro del cliente." },
    { name: "registradoPor", type: "string", required: "Sí", desc: "Nombre del usuario administrador que registró al cliente." },
    { name: "fechaCreacion", type: "timestamp / date", required: "Sí", desc: "Marca de tiempo del servidor al momento del registro." },
  ];

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "Usuario";

  // Suscripción en tiempo real a los clientes de Firestore para el usuario activo
  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    const unsubscribe = subscribeClientes(
      resolvedDisplayName,
      user.uid, 
      (updatedClientes) => {
        setClientes(updatedClientes);
        setIsLoading(false);

        // Auto-migración para clientes existentes en Firestore que no tengan registradoPor
        if (resolvedDisplayName) {
          updatedClientes.forEach((cliente) => {
            if (!cliente.registradoPor) {
              updateCliente(resolvedDisplayName, cliente.id, { registradoPor: resolvedDisplayName })
                .catch((err) => console.error("Error al actualizar registradoPor para cliente:", cliente.id, err));
            }
          });
        }
      },
      (error) => {
        console.error("Error al obtener clientes de Firestore:", error);
        setIsLoading(false);
        triggerToast("error", "Error de conexión con la base de datos: " + error.message);
      }
    );

    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  // Manejo de Alertas Temporales
  const triggerToast = (type, message) => {
    setToastAlert({ type, message });
    setTimeout(() => {
      setToastAlert(null);
    }, 4000);
  };

  // Filtros aplicados sobre los datos en tiempo real
  const filteredClientes = clientes.filter((c) => {
    const matchesSearch =
      (c.nombres || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.apellidos || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.documento || "").includes(searchTerm) ||
      (c.email || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesEstado = 
      filterEstado === "todos" || 
      (c.estado || "").toLowerCase() === filterEstado.toLowerCase();

    return matchesSearch && matchesEstado;
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    
    // Si es un Timestamp de Firestore tiene la propiedad seconds
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    
    return date.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const exportToPDF = async () => {
    try {
      let jsPDFClass = window.jspdf?.jsPDF;
      if (!jsPDFClass) {
        triggerToast("info", "Cargando componentes de exportación...");
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

      const doc = new jsPDFClass("landscape");
      
      // Título y detalles
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(46, 92, 138); // #2E5C8A
      doc.text("SessionApp — Base de Datos de Clientes", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);
      
      let filterText = "Todos";
      if (searchTerm) {
        filterText = `Búsqueda: "${searchTerm}"`;
      }
      const estadoText = filterEstado === "todos" ? "Todos" : filterEstado === "activo" ? "Activos" : "Inactivos";
      doc.text(`Filtros: ${filterText} | Estado: ${estadoText} | Total: ${filteredClientes.length} registros`, 14, 34);
      
      // Dibujar una línea decorativa
      doc.setDrawColor(212, 227, 245); // #D4E3F5
      doc.setLineWidth(0.5);
      doc.line(14, 38, 282, 38);

      const tableColumns = [
        "Tipo Doc.",
        "Documento",
        "Nombres",
        "Apellidos",
        "Correo Electrónico",
        "Teléfono",
        "Dirección",
        "Estado",
        "Registrado por",
        "Fecha"
      ];
      
      const tableRows = filteredClientes.map((cliente) => [
        cliente.tipoDocumento || "",
        cliente.documento || "",
        cliente.nombres || "",
        cliente.apellidos || "",
        cliente.email || "",
        cliente.telefono || "—",
        cliente.direccion || "—",
        cliente.estado || "",
        cliente.registradoPor || resolvedDisplayName,
        formatDate(cliente.fechaCreacion)
      ]);

      doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 42,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
        headStyles: { fillColor: [46, 92, 138], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 253] },
      });

      doc.save(`clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      const headers = [
        "Tipo Doc.",
        "Documento",
        "Nombres",
        "Apellidos",
        "Correo Electrónico",
        "Teléfono",
        "Dirección",
        "Estado",
        "Registrado por",
        "Fecha"
      ];
      
      const rows = filteredClientes.map((cliente) => [
        cliente.tipoDocumento || "",
        cliente.documento || "",
        cliente.nombres || "",
        cliente.apellidos || "",
        cliente.email || "",
        cliente.telefono || "",
        cliente.direccion || "",
        cliente.estado || "",
        cliente.registradoPor || resolvedDisplayName,
        formatDate(cliente.fechaCreacion)
      ]);

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `clientes_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("success", "¡Excel exportado correctamente!");
    } catch (error) {
      console.error("Error al exportar Excel:", error);
      triggerToast("error", "No se pudo exportar a Excel.");
    }
  };

  // CRUD Event Handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
    // Limpiar error al editar
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.nombres.trim()) errors.nombres = "El nombre es requerido";
    if (!formData.apellidos.trim()) errors.apellidos = "El apellido es requerido";
    
    // Validar formato de email (solo si se ingresa)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && formData.email.trim()) {
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = "Formato de correo electrónico inválido";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setModalMode("create");
    setCurrentClienteId(null);
    setShowModal(true);
  };

  const openEditModal = (cliente) => {
    setFormData({
      tipoDocumento: cliente.tipoDocumento || "CC",
      documento: cliente.documento || "",
      nombres: cliente.nombres || "",
      apellidos: cliente.apellidos || "",
      email: cliente.email || "",
      telefono: cliente.telefono || "",
      direccion: cliente.direccion || "",
      estado: cliente.estado || "Activo"
    });
    setFormErrors({});
    setModalMode("edit");
    setCurrentClienteId(cliente.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (modalMode === "create") {
        // Validación de duplicado local en base de datos antes de enviar (solo si se ingresó documento)
        if (formData.documento && formData.documento.trim()) {
          const existe = await checkDocumentoExiste(resolvedDisplayName, formData.tipoDocumento, formData.documento);
          if (existe) {
            setFormErrors((prev) => ({
              ...prev,
              documento: `Ya existe un cliente con el documento ${formData.tipoDocumento} ${formData.documento}`
            }));
            setSubmitting(false);
            return;
          }
        }

        await addCliente(formData, user.uid, resolvedDisplayName);
        triggerToast("success", "¡Cliente registrado correctamente!");
      } else {
        // En modo edición
        if (formData.documento && formData.documento.trim()) {
          const existe = await checkDocumentoExiste(resolvedDisplayName, formData.tipoDocumento, formData.documento, currentClienteId);
          if (existe) {
            setFormErrors((prev) => ({
              ...prev,
              documento: `Ya existe otro cliente con el documento ${formData.tipoDocumento} ${formData.documento}`
            }));
            setSubmitting(false);
            return;
          }
        }

        await updateCliente(resolvedDisplayName, currentClienteId, formData);
        triggerToast("success", "¡Datos del cliente actualizados correctamente!");
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      triggerToast("error", error.message || "Error al procesar la solicitud en Firestore.");
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteConfirmation = (cliente) => {
    setClienteToDelete(cliente);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!clienteToDelete) return;

    try {
      await deleteCliente(resolvedDisplayName, clienteToDelete.id);
      triggerToast("success", "¡Cliente eliminado correctamente!");
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      triggerToast("error", "No se pudo eliminar el cliente.");
    } finally {
      setShowDeleteConfirm(false);
      setClienteToDelete(null);
    }
  };

  return (
    <div className="clientes-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="cli-header">
        <div className="cli-header-title">
          <div className="cli-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h2 className="cli-title">Gestión de Clientes</h2>
            <p className="cli-subtitle">Base de datos de clientes vinculados a tu cuenta de Firestore</p>
          </div>
        </div>

        {/* Tab Selector & Add Button */}
        <div className="cli-header-actions">
          <div className="cli-tabs">
            <button 
              className={`cli-tab-btn ${activeTab === "lista" ? "active" : ""}`}
              onClick={() => setActiveTab("lista")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Clientes
            </button>
            <button 
              className={`cli-tab-btn ${activeTab === "esquema" ? "active" : ""}`}
              onClick={() => setActiveTab("esquema")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              Estructura
            </button>
          </div>

          {activeTab === "lista" && (
            <div style={{ display: "flex", gap: "12px" }}>
              <button 
                className="cli-export-pdf-btn" 
                onClick={exportToPDF} 
                title="Exportar a PDF"
                disabled={filteredClientes.length === 0}
                style={{ opacity: filteredClientes.length === 0 ? 0.6 : 1, cursor: filteredClientes.length === 0 ? "not-allowed" : "pointer" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Exportar PDF
              </button>
              <button 
                className="cli-export-excel-btn" 
                onClick={exportToExcel} 
                title="Exportar a Excel"
                disabled={filteredClientes.length === 0}
                style={{ opacity: filteredClientes.length === 0 ? 0.6 : 1, cursor: filteredClientes.length === 0 ? "not-allowed" : "pointer" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
                Exportar Excel
              </button>
              <button className="cli-add-btn" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nuevo Cliente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="cli-content-wrapper">
        {activeTab === "lista" ? (
          <div className="cli-tab-content">
            {/* Filters Bar */}
            <div className="cli-filters-bar">
              <div className="cli-search-box">
                <svg className="cli-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  placeholder="Buscar por nombre, correo o documento..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="cli-search-input"
                />
              </div>

              <div className="cli-status-select-wrapper">
                <label>Estado:</label>
                <select 
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="cli-status-select"
                >
                  <option value="todos">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
              </div>
              
              <div className="cli-crud-alert">
                <span className="cli-badge-info">En línea</span>
                <span className="cli-text-success">Firestore Sincronizado</span>
              </div>
            </div>

            {/* Clientes Table or Loading State */}
            <div className="cli-table-container">
              {isLoading ? (
                <div className="cli-loading-overlay">
                  <div className="cli-loading-spinner"></div>
                  <p>Conectando con base de datos...</p>
                </div>
              ) : filteredClientes.length > 0 ? (
                <table className="cli-table">
                  <thead>
                    <tr>
                      <th>Tipo Doc.</th>
                      <th>Documento</th>
                      <th>Nombres</th>
                      <th>Apellidos</th>
                      <th>Correo Electrónico</th>
                      <th>Teléfono</th>
                      <th>Dirección</th>
                      <th>Estado</th>
                      <th>Registrado por</th>
                      <th>Fecha de Registro</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClientes.map((cliente) => (
                      <tr key={cliente.id} className={`cli-row ${cliente.estado.toLowerCase()}`}>
                        <td>
                          <span className="cli-doc-badge">{cliente.tipoDocumento}</span>
                        </td>
                        <td className="cli-doc-num">{cliente.documento}</td>
                        <td className="cli-text-bold">{cliente.nombres}</td>
                        <td className="cli-text-bold">{cliente.apellidos}</td>
                        <td>{cliente.email}</td>
                        <td>{cliente.telefono || "—"}</td>
                        <td>{cliente.direccion || "—"}</td>
                        <td>
                          <span className={`cli-status-badge ${cliente.estado.toLowerCase()}`}>
                            <span className="cli-status-dot"></span>
                            {cliente.estado}
                          </span>
                        </td>
                        <td className="cli-text-bold">{cliente.registradoPor || resolvedDisplayName}</td>
                        <td className="cli-cell-date">{formatDate(cliente.fechaCreacion)}</td>
                        <td>
                          <div className="cli-actions-cell">
                            <button 
                              className="cli-action-btn edit" 
                              onClick={() => openEditModal(cliente)}
                              title="Editar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button 
                              className="cli-action-btn delete" 
                              onClick={() => askDeleteConfirmation(cliente)}
                              title="Eliminar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="cli-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h3>No hay clientes registrados</h3>
                  <p>Inicia registrando tu primer cliente en la base de datos de Firestore.</p>
                  <button className="cli-add-btn" onClick={openCreateModal}>
                    Agregar Cliente
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="cli-tab-content">
            {/* Schema Documentation Panel */}
            <div className="cli-schema-panel">
              <div className="cli-schema-info-card">
                <h3>Definición de Atributos — Colección de Firestore</h3>
                <p>El siguiente listado define cada uno de los campos estructurales implementados en el modelo de clientes. Esta estructura garantiza coherencia de datos, integridad comercial y trazabilidad de los administradores creadores.</p>
                
                <div className="cli-schema-meta">
                  <div className="cli-meta-item">
                    <strong>Nombre de la Colección:</strong>
                    <code>clientes</code>
                  </div>
                  <div className="cli-meta-item">
                    <strong>Proveedor de BD:</strong>
                    <span>Firebase Firestore (NoSQL Document Database)</span>
                  </div>
                </div>
              </div>

              <div className="cli-schema-grid">
                {schemaDefinition.map((field) => (
                  <div className="cli-schema-card" key={field.name}>
                    <div className="cli-schema-card-header">
                      <h4 className="cli-field-name">{field.name}</h4>
                      <span className={`cli-field-req ${field.required.includes("No") ? "optional" : "required"}`}>
                        {field.required}
                      </span>
                    </div>
                    <div className="cli-schema-card-body">
                      <div className="cli-field-type">
                        <strong>Tipo de dato:</strong>
                        <code>{field.type}</code>
                      </div>
                      <p className="cli-field-desc">{field.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== CRUD FORM MODAL (ADD & EDIT) ===== */}
      {showModal && (
        <div className="cli-modal-overlay">
          <div className="cli-modal-container">
            <div className="cli-modal-header">
              <h3>{modalMode === "create" ? "Registrar Nuevo Cliente" : "Editar Datos de Cliente"}</h3>
              <button className="cli-modal-close-btn" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="cli-form">
              <div className="cli-form-grid">
                {/* Tipo Documento */}
                <div className="cli-form-group">
                  <label htmlFor="tipoDocumento">Tipo Documento</label>
                  <select 
                    id="tipoDocumento" 
                    name="tipoDocumento"
                    value={formData.tipoDocumento}
                    onChange={handleInputChange}
                    className="cli-select"
                  >
                    <option value="CC">Cédula de Ciudadanía (CC)</option>
                    <option value="CE">Cédula de Extranjería (CE)</option>
                    <option value="NIT">NIT (Empresas)</option>
                    <option value="PP">Pasaporte (PP)</option>
                  </select>
                </div>

                {/* Número Documento */}
                <div className="cli-form-group">
                  <label htmlFor="documento">Documento de Identidad</label>
                  <input 
                    type="text" 
                    id="documento"
                    name="documento"
                    placeholder="Ej. 1098765432"
                    value={formData.documento}
                    onChange={handleInputChange}
                    className={`cli-input ${formErrors.documento ? "error" : ""}`}
                  />
                  {formErrors.documento && (
                    <span className="cli-field-error">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      {formErrors.documento}
                    </span>
                  )}
                </div>

                {/* Nombres */}
                <div className="cli-form-group">
                  <label htmlFor="nombres">Nombres<span className="required-mark">*</span></label>
                  <input 
                    type="text" 
                    id="nombres"
                    name="nombres"
                    placeholder="Ej. Juan Carlos"
                    value={formData.nombres}
                    onChange={handleInputChange}
                    className={`cli-input ${formErrors.nombres ? "error" : ""}`}
                  />
                  {formErrors.nombres && (
                    <span className="cli-field-error">{formErrors.nombres}</span>
                  )}
                </div>

                {/* Apellidos */}
                <div className="cli-form-group">
                  <label htmlFor="apellidos">Apellidos / Razón Comercial<span className="required-mark">*</span></label>
                  <input 
                    type="text" 
                    id="apellidos"
                    name="apellidos"
                    placeholder="Ej. Pérez Gómez"
                    value={formData.apellidos}
                    onChange={handleInputChange}
                    className={`cli-input ${formErrors.apellidos ? "error" : ""}`}
                  />
                  {formErrors.apellidos && (
                    <span className="cli-field-error">{formErrors.apellidos}</span>
                  )}
                </div>

                {/* Correo Electrónico */}
                <div className="cli-form-group span-2">
                  <label htmlFor="email">Correo Electrónico</label>
                  <input 
                    type="email" 
                    id="email"
                    name="email"
                    placeholder="Ej. juan.perez@email.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`cli-input ${formErrors.email ? "error" : ""}`}
                  />
                  {formErrors.email && (
                    <span className="cli-field-error">{formErrors.email}</span>
                  )}
                </div>

                {/* Teléfono */}
                <div className="cli-form-group span-2">
                  <label htmlFor="telefono">Número de Teléfono</label>
                  <input 
                    type="tel" 
                    id="telefono"
                    name="telefono"
                    placeholder="Ej. 3151234567"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    className="cli-input"
                  />
                </div>

                {/* Dirección */}
                <div className="cli-form-group span-2">
                  <label htmlFor="direccion">Dirección Física</label>
                  <input 
                    type="text" 
                    id="direccion"
                    name="direccion"
                    placeholder="Ej. Calle 100 #15-22, Bogotá"
                    value={formData.direccion}
                    onChange={handleInputChange}
                    className="cli-input"
                  />
                </div>
              </div>

              <div className="cli-modal-footer">
                <button type="button" className="cli-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="cli-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="avatar-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Cliente"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && clienteToDelete && (
        <div className="cli-modal-overlay">
          <div className="cli-modal-container delete-confirm">
            <div className="cli-delete-modal-content">
              <div className="cli-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="cli-delete-text">
                <h4>¿Eliminar cliente permanentemente?</h4>
                <p>Esta acción eliminará a <strong>{`${clienteToDelete.nombres} ${clienteToDelete.apellidos}`}</strong> de la base de datos de Firestore. Esta operación no se puede deshacer.</p>
              </div>
            </div>
            <div className="cli-modal-footer">
              <button type="button" className="cli-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="cli-btn-danger" onClick={handleConfirmDelete}>
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`cli-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="cli-toast-close" onClick={() => setToastAlert(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default Clientes;
