import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { 
  subscribeProveedores, 
  addProveedor, 
  updateProveedor, 
  deleteProveedor,
  checkProveedorExiste 
} from "../../services/proveedoresService";
import { restoreCaret } from "../../utils/caretUtils";
import { getLocalDateString } from "../../utils/dateUtils";
import "./Proveedores.css";

function Proveedores({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [proveedores, setProveedores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("lista"); // 'lista' | 'esquema'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Estados de los Modales
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [currentProveedorId, setCurrentProveedorId] = useState(null);

  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [proveedorToDelete, setProveedorToDelete] = useState(null);

  // Estados del Formulario
  const initialFormState = {
    nombre: "",
    empresa: "",
    telefono: "",
    correo: "",
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
    { name: "id", type: "string", required: "Sí (Autogenerado)", desc: "Identificador único del proveedor asignado automáticamente por Firestore." },
    { name: "nombre", type: "string", required: "Sí", desc: "Nombre o razón social del proveedor (no duplicable)." },
    { name: "empresa", type: "string", required: "No", desc: "Empresa a la que pertenece el proveedor." },
    { name: "telefono", type: "string", required: "No", desc: "Teléfono de contacto del proveedor." },
    { name: "correo", type: "string", required: "No", desc: "Correo electrónico de contacto del proveedor." },
    { name: "direccion", type: "string", required: "No", desc: "Dirección física de contacto del proveedor." },
    { name: "estado", type: "string", required: "Sí", desc: "Estado del proveedor. Valores: 'Activo' | 'Inactivo'." },
    { name: "creadoPor", type: "string", required: "Sí", desc: "ID único (uid) del usuario administrador que creó el registro del proveedor." },
    { name: "registradoPor", type: "string", required: "Sí", desc: "Nombre del usuario administrador que registró al proveedor." },
    { name: "fechaCreacion", type: "timestamp / date", required: "Sí", desc: "Marca de tiempo del servidor al momento del registro." },
  ];

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "Usuario";

  // Suscripción en tiempo real a los proveedores de Firestore para el usuario activo
  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    const unsubscribe = subscribeProveedores(
      resolvedDisplayName,
      user.uid,
      (updatedProveedores) => {
        setProveedores(updatedProveedores);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error al obtener proveedores de Firestore:", error);
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
  const filteredProveedores = proveedores.filter((p) => {
    const matchesSearch =
      (p.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.empresa || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.correo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.telefono || "").includes(searchTerm);

    const matchesEstado =
      filterEstado === "todos" ||
      (p.estado || "").toLowerCase() === filterEstado.toLowerCase();

    return matchesSearch && matchesEstado;
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
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
            autoTableScript.onload = () => resolve();
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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(46, 92, 138);
      doc.text("AuroInventario — Base de Datos de Proveedores", 14, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);

      const estadoText = filterEstado === "todos" ? "Todos" : filterEstado === "activo" ? "Activos" : "Inactivos";
      doc.text(`Filtros: Estado ${estadoText} | Total: ${filteredProveedores.length} registros`, 14, 34);

      doc.setDrawColor(212, 227, 245);
      doc.setLineWidth(0.5);
      doc.line(14, 38, 282, 38);

      const tableColumns = ["Nombre", "Empresa", "Teléfono", "Correo", "Dirección", "Estado", "Registrado por", "Fecha"];
      const tableRows = filteredProveedores.map((p) => [
        p.nombre || "",
        p.empresa || "—",
        p.telefono || "—",
        p.correo || "—",
        p.direccion || "—",
        p.estado || "",
        p.registradoPor || resolvedDisplayName,
        formatDate(p.fechaCreacion)
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

      doc.save(`proveedores_${getLocalDateString()}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      const headers = ["Nombre", "Empresa", "Teléfono", "Correo", "Dirección", "Estado", "Registrado por", "Fecha"];
      const rows = filteredProveedores.map((p) => [
        p.nombre || "",
        p.empresa || "",
        p.telefono || "",
        p.correo || "",
        p.direccion || "",
        p.estado || "",
        p.registradoPor || resolvedDisplayName,
        formatDate(p.fechaCreacion)
      ]);

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `proveedores_${getLocalDateString()}.csv`);
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
    const { name, value, type } = e.target;
    const caret = e.target.selectionStart;
    const esTexto = type === "text" || type === "search" || type === "tel" || type === "textarea";
    const nuevoValor = esTexto && name !== "correo" ? value.toUpperCase() : value;
    setFormData((prev) => ({ ...prev, [name]: nuevoValor }));
    if (nuevoValor !== value) {
      restoreCaret(e.target, caret);
    }
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.nombre.trim()) errors.nombre = "El nombre es requerido";

    if (formData.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo.trim())) {
      errors.correo = "Ingrese un correo electrónico válido";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setModalMode("create");
    setCurrentProveedorId(null);
    setShowModal(true);
  };

  const openEditModal = (proveedor) => {
    setFormData({
      nombre: proveedor.nombre || "",
      empresa: proveedor.empresa || "",
      telefono: proveedor.telefono || "",
      correo: proveedor.correo || "",
      direccion: proveedor.direccion || "",
      estado: proveedor.estado || "Activo"
    });
    setFormErrors({});
    setModalMode("edit");
    setCurrentProveedorId(proveedor.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (modalMode === "create") {
        const existe = await checkProveedorExiste(resolvedDisplayName, formData.nombre);
        if (existe) {
          setFormErrors((prev) => ({
            ...prev,
            nombre: `Ya existe un proveedor con el nombre ${formData.nombre}`
          }));
          setSubmitting(false);
          return;
        }

        await addProveedor(formData, user.uid, resolvedDisplayName);
        triggerToast("success", "¡Proveedor registrado correctamente!");
      } else {
        const existe = await checkProveedorExiste(resolvedDisplayName, formData.nombre, currentProveedorId);
        if (existe) {
          setFormErrors((prev) => ({
            ...prev,
            nombre: `Ya existe otro proveedor con el nombre ${formData.nombre}`
          }));
          setSubmitting(false);
          return;
        }

        await updateProveedor(resolvedDisplayName, currentProveedorId, formData);
        triggerToast("success", "¡Datos del proveedor actualizados correctamente!");
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar proveedor:", error);
      triggerToast("error", error.message || "Error al procesar la solicitud en Firestore.");
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteConfirmation = (proveedor) => {
    setProveedorToDelete(proveedor);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!proveedorToDelete) return;

    try {
      await deleteProveedor(resolvedDisplayName, proveedorToDelete.id);
      triggerToast("success", "¡Proveedor eliminado correctamente!");
    } catch (error) {
      console.error("Error al eliminar proveedor:", error);
      triggerToast("error", "No se pudo eliminar el proveedor.");
    } finally {
      setShowDeleteConfirm(false);
      setProveedorToDelete(null);
    }
  };

  return (
    <div className="proveedores-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="prov-header">
        <div className="prov-header-title">
          <div className="prov-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18"></path>
              <path d="M5 21V7l8-4v18"></path>
              <path d="M19 21V11l-6-4"></path>
              <line x1="9" y1="9" x2="9.01" y2="9"></line>
              <line x1="9" y1="13" x2="9.01" y2="13"></line>
              <line x1="9" y1="17" x2="9.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h2 className="prov-title">Gestión de Proveedores</h2>
            <p className="prov-subtitle">Base de datos de proveedores a quienes les compras mercancía</p>
          </div>
        </div>

        <div className="prov-header-actions">
          <div className="prov-tabs">
            <button
              className={`prov-tab-btn ${activeTab === "lista" ? "active" : ""}`}
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
              Proveedores
            </button>
            <button
              className={`prov-tab-btn ${activeTab === "esquema" ? "active" : ""}`}
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
                className="prov-export-pdf-btn"
                onClick={exportToPDF}
                title="Exportar a PDF"
                disabled={filteredProveedores.length === 0}
                style={{ opacity: filteredProveedores.length === 0 ? 0.6 : 1, cursor: filteredProveedores.length === 0 ? "not-allowed" : "pointer" }}
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
                className="prov-export-excel-btn"
                onClick={exportToExcel}
                title="Exportar a Excel"
                disabled={filteredProveedores.length === 0}
                style={{ opacity: filteredProveedores.length === 0 ? 0.6 : 1, cursor: filteredProveedores.length === 0 ? "not-allowed" : "pointer" }}
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
              <button className="prov-add-btn" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nuevo Proveedor
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="prov-content-wrapper">
        {activeTab === "lista" ? (
          <div className="prov-tab-content">
            <div className="prov-filters-bar">
              <div className="prov-search-box">
                <svg className="prov-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre, empresa, correo o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="prov-search-input"
                />
              </div>

              <div className="prov-status-select-wrapper">
                <label>Estado:</label>
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="prov-status-select"
                >
                  <option value="todos">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
              </div>

              <div className="prov-crud-alert">
                <span className="prov-badge-info">En línea</span>
                <span className="prov-text-success">Firestore Sincronizado</span>
              </div>
            </div>

            <div className="prov-table-container">
              {isLoading ? (
                <div className="prov-loading-overlay">
                  <div className="prov-loading-spinner"></div>
                  <p>Conectando con base de datos de proveedores...</p>
                </div>
              ) : filteredProveedores.length > 0 ? (
                <table className="prov-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Empresa</th>
                      <th>Teléfono</th>
                      <th>Correo</th>
                      <th>Dirección</th>
                      <th>Estado</th>
                      <th>Registrado por</th>
                      <th>Fecha de Registro</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProveedores.map((proveedor) => (
                      <tr key={proveedor.id} className={`prov-row ${proveedor.estado.toLowerCase()}`}>
                        <td className="prov-text-bold">{proveedor.nombre}</td>
                        <td>{proveedor.empresa || "—"}</td>
                        <td>{proveedor.telefono || "—"}</td>
                        <td>{proveedor.correo || "—"}</td>
                        <td>{proveedor.direccion || "—"}</td>
                        <td>
                          <span className={`prov-status-badge ${proveedor.estado.toLowerCase()}`}>
                            <span className="prov-status-dot"></span>
                            {proveedor.estado}
                          </span>
                        </td>
                        <td className="prov-text-bold">{proveedor.registradoPor || resolvedDisplayName}</td>
                        <td className="prov-cell-date">{formatDate(proveedor.fechaCreacion)}</td>
                        <td>
                          <div className="prov-actions-cell">
                            <button
                              className="prov-action-btn edit"
                              onClick={() => openEditModal(proveedor)}
                              title="Editar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button
                              className="prov-action-btn delete"
                              onClick={() => askDeleteConfirmation(proveedor)}
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
                <div className="prov-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18"></path>
                    <path d="M5 21V7l8-4v18"></path>
                    <path d="M19 21V11l-6-4"></path>
                  </svg>
                  <h3>No hay proveedores registrados</h3>
                  <p>Registra a tus proveedores para controlar de quién compras cada producto.</p>
                  <button className="prov-add-btn" onClick={openCreateModal}>
                    Agregar Proveedor
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="prov-tab-content">
            <div className="prov-schema-panel">
              <div className="prov-schema-info-card">
                <h3>Definición de Atributos — Colección de Proveedores</h3>
                <p>El siguiente listado define cada uno de los campos estructurales implementados en el modelo de proveedores en Firestore.</p>

                <div className="prov-schema-meta">
                  <div className="prov-meta-item">
                    <strong>Nombre de la Colección:</strong>
                    <code>proveedores</code>
                  </div>
                  <div className="prov-meta-item">
                    <strong>Proveedor de BD:</strong>
                    <span>Firebase Firestore (NoSQL Document Database)</span>
                  </div>
                </div>
              </div>

              <div className="prov-schema-grid">
                {schemaDefinition.map((field) => (
                  <div className="prov-schema-card" key={field.name}>
                    <div className="prov-schema-card-header">
                      <h4 className="prov-field-name">{field.name}</h4>
                      <span className={`prov-field-req ${field.required.includes("No") ? "optional" : "required"}`}>
                        {field.required}
                      </span>
                    </div>
                    <div className="prov-schema-card-body">
                      <div className="prov-field-type">
                        <strong>Tipo de dato:</strong>
                        <code>{field.type}</code>
                      </div>
                      <p className="prov-field-desc">{field.desc}</p>
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
        <div className="prov-modal-overlay">
          <div className="prov-modal-container">
            <div className="prov-modal-header">
              <h3>{modalMode === "create" ? "Registrar Nuevo Proveedor" : "Editar Datos de Proveedor"}</h3>
              <button className="prov-modal-close-btn" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="prov-form">
              <div className="prov-form-grid">
                <div className="prov-form-group span-2">
                  <label htmlFor="nombre">Nombre del Proveedor<span className="required-mark">*</span></label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    placeholder="Ej. Carlos Andrés Gómez"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    className={`prov-input ${formErrors.nombre ? "error" : ""}`}
                  />
                  {formErrors.nombre && (
                    <span className="prov-field-error">{formErrors.nombre}</span>
                  )}
                </div>

                <div className="prov-form-group">
                  <label htmlFor="empresa">Empresa</label>
                  <input
                    type="text"
                    id="empresa"
                    name="empresa"
                    placeholder="Ej. Tecnología Andina S.A.S"
                    value={formData.empresa}
                    onChange={handleInputChange}
                    className="prov-input"
                  />
                </div>

                <div className="prov-form-group">
                  <label htmlFor="telefono">Teléfono</label>
                  <input
                    type="text"
                    id="telefono"
                    name="telefono"
                    placeholder="Ej. 300 123 4567"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    className="prov-input"
                  />
                </div>

                <div className="prov-form-group">
                  <label htmlFor="correo">Correo Electrónico</label>
                  <input
                    type="text"
                    id="correo"
                    name="correo"
                    placeholder="Ej. ventas@empresa.com"
                    value={formData.correo}
                    onChange={handleInputChange}
                    className={`prov-input ${formErrors.correo ? "error" : ""}`}
                  />
                  {formErrors.correo && (
                    <span className="prov-field-error">{formErrors.correo}</span>
                  )}
                </div>

                <div className="prov-form-group span-2">
                  <label htmlFor="direccion">Dirección</label>
                  <input
                    type="text"
                    id="direccion"
                    name="direccion"
                    placeholder="Ej. Cra 15 # 20-30, Bogotá"
                    value={formData.direccion}
                    onChange={handleInputChange}
                    className="prov-input"
                  />
                </div>

                <div className="prov-form-group span-2">
                  <label htmlFor="estado">Estado del Proveedor<span className="required-mark">*</span></label>
                  <select
                    id="estado"
                    name="estado"
                    value={formData.estado}
                    onChange={handleInputChange}
                    className="prov-select"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="prov-modal-footer">
                <button type="button" className="prov-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="prov-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="avatar-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Proveedor"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && proveedorToDelete && (
        <div className="prov-modal-overlay">
          <div className="prov-modal-container delete-confirm">
            <div className="prov-delete-modal-content">
              <div className="prov-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="prov-delete-text">
                <h4>¿Eliminar proveedor permanentemente?</h4>
                <p>Esta acción eliminará a <strong>{proveedorToDelete.nombre}</strong> de la base de datos de Firestore. Esta operación no se puede deshacer.</p>
              </div>
            </div>
            <div className="prov-modal-footer">
              <button type="button" className="prov-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="prov-btn-danger" onClick={handleConfirmDelete}>
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`prov-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="prov-toast-close" onClick={() => setToastAlert(null)}>
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

export default Proveedores;
