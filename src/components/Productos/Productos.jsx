import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { 
  subscribeProductos, 
  addProducto, 
  updateProducto, 
  deleteProducto,
  checkCodigoExiste 
} from "../../services/productosService";
import "./Productos.css";

function Productos({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [productos, setProductos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("lista"); // 'lista' | 'esquema'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Estados de los Modales
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [currentProductoId, setCurrentProductoId] = useState(null);
  
  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productoToDelete, setProductoToDelete] = useState(null);

  // Estados del Formulario
  const initialFormState = {
    codigo: "",
    nombre: "",
    descripcion: "",
    precioCompra: "",
    stock: "",
    estado: "Activo"
  };
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Estados de Notificación / Toast Alerts
  const [toastAlert, setToastAlert] = useState(null);

  // Definición del esquema para visualización
  const schemaDefinition = [
    { name: "id", type: "string", required: "Sí (Autogenerado)", desc: "Identificador único del producto asignado automáticamente por Firestore." },
    { name: "codigo", type: "string", required: "Sí", desc: "Código único de producto (clave de negocio, no duplicable)." },
    { name: "nombre", type: "string", required: "Sí", desc: "Nombre del producto." },
    { name: "descripcion", type: "string", required: "No", desc: "Descripción del producto." },
    { name: "precioCompra", type: "number", required: "Sí", desc: "Precio unitario del producto (costo de compra)." },
    { name: "stock", type: "number", required: "Sí", desc: "Cantidad de unidades del producto disponibles en el inventario." },
    { name: "estado", type: "string", required: "Sí", desc: "Estado del producto. Valores: 'Activo' | 'Inactivo'." },
    { name: "creadoPor", type: "string", required: "Sí", desc: "ID único (uid) del usuario administrador que creó el registro del producto." },
    { name: "registradoPor", type: "string", required: "Sí", desc: "Nombre del usuario administrador que registró al producto." },
    { name: "fechaCreacion", type: "timestamp / date", required: "Sí", desc: "Marca de tiempo del servidor al momento del registro." },
  ];

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.descripcion || ""}`.trim() : "") || "Usuario";

  // Suscripción en tiempo real a los productos de Firestore para el usuario activo
  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    const unsubscribe = subscribeProductos(
      resolvedDisplayName,
      user.uid, 
      (updatedProductos) => {
        setProductos(updatedProductos);
        setIsLoading(false);

        // Auto-migración para productos existentes en Firestore que no tengan registradoPor
        if (resolvedDisplayName) {
          updatedProductos.forEach((producto) => {
            if (!producto.registradoPor) {
              updateProducto(resolvedDisplayName, producto.id, { registradoPor: resolvedDisplayName })
                .catch((err) => console.error("Error al actualizar registradoPor para producto:", producto.id, err));
            }
          });
        }
      },
      (error) => {
        console.error("Error al obtener productos de Firestore:", error);
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
  const filteredProductos = productos.filter((c) => {
    const matchesSearch =
      (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.descripcion || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.codigo || "").includes(searchTerm) ||
      (c.precio || "").toLowerCase().includes(searchTerm.toLowerCase());
      
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

  const formatPrice = (value) => {
    if (value === undefined || value === null || value === "") return "—";
    return new Intl.NumberFormat("es-CO").format(value);
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
      doc.text("SessionApp — Base de Datos de Productos", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);
      
      let filterText = "Todos";
      if (searchTerm) {
        filterText = `Búsqueda: "${searchTerm}"`;
      }
      const estadoText = filterEstado === "todos" ? "Todos" : filterEstado === "activo" ? "Activos" : "Inactivos";
      doc.text(`Filtros: ${filterText} | Estado: ${estadoText} | Total: ${filteredProductos.length} registros`, 14, 34);
      
      // Dibujar una línea decorativa
      doc.setDrawColor(212, 227, 245); // #D4E3F5
      doc.setLineWidth(0.5);
      doc.line(14, 38, 282, 38);

      const tableColumns = [
        "Código",
        "Nombre",
        "Descripción",
        "Precio Unitario",
        "Stock",
        "Estado",
        "Registrado por",
        "Fecha"
      ];
      
      const tableRows = filteredProductos.map((producto) => [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        formatPrice(producto.precioCompra),
        producto.stock || "—",
        producto.estado || "",
        producto.registradoPor || resolvedDisplayName,
        formatDate(producto.fechaCreacion)
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

      doc.save(`productos_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      const headers = [
        "Código",
        "Nombre",
        "Descripción",
        "Precio Unitario",
        "Stock",
        "Estado",
        "Registrado por",
        "Fecha"
      ];
      
      const rows = filteredProductos.map((producto) => [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.precioCompra || 0,
        producto.stock || 0,
        producto.estado || "",
        producto.registradoPor || resolvedDisplayName,
        formatDate(producto.fechaCreacion)
      ]);

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `productos_${new Date().toISOString().slice(0, 10)}.csv`);
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
    let { name, value } = e.target;

    // Formatear precio con separadores de miles
    if (name === "precio" || name === "precioCompra") {
      const numericValue = value.replace(/\D/g, "");
      value = numericValue ? new Intl.NumberFormat("es-CO").format(numericValue) : "";
    }

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
    if (!formData.nombre.trim()) errors.nombre = "El nombre es requerido";
    if (!formData.codigo.trim()) errors.codigo = "El código es requerido";
    
    // Validar precio compra
    const precioCompraNumerico = Number(String(formData.precioCompra).replace(/\D/g, ""));
    if (!String(formData.precioCompra).trim()) {
      errors.precioCompra = "El precio unitario es requerido";
    } else if (precioCompraNumerico < 0) {
      errors.precioCompra = "El precio debe ser mayor o igual a cero";
    }

    // Validar maximo 100 palabras en descripcion
    if (formData.descripcion && formData.descripcion.trim()) {
      const wordCount = formData.descripcion.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount > 100) {
        errors.descripcion = "La descripción no puede superar las 100 palabras";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setModalMode("create");
    setCurrentProductoId(null);
    setShowModal(true);
  };

  const openEditModal = (producto) => {
    setFormData({
      codigo: producto.codigo || "",
      nombre: producto.nombre || "",
      descripcion: producto.descripcion || "",
      precioCompra: producto.precioCompra ? new Intl.NumberFormat("es-CO").format(producto.precioCompra) : "",
      stock: producto.stock || "",
      estado: producto.estado || "Activo"
    });
    setFormErrors({});
    setModalMode("edit");
    setCurrentProductoId(producto.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (modalMode === "create") {
        // Validación de duplicado local en base de datos antes de enviar
        const existe = await checkCodigoExiste(resolvedDisplayName, formData.codigo);
        if (existe) {
          setFormErrors((prev) => ({
            ...prev,
            codigo: `Ya existe un producto con el codigo ${formData.codigo}`
          }));
          setSubmitting(false);
          return;
        }

        const dataToSave = {
          ...formData,
          precioCompra: Number(String(formData.precioCompra).replace(/\D/g, "")),
          stock: formData.stock ? Number(formData.stock) : 0,
        };

        await addProducto(dataToSave, user.uid, resolvedDisplayName);
        triggerToast("success", "¡Producto registrado correctamente!");
      } else {
        // En modo edición
        const existe = await checkCodigoExiste(resolvedDisplayName, formData.codigo, currentProductoId);
        if (existe) {
          setFormErrors((prev) => ({
            ...prev,
            codigo: `Ya existe otro producto con el codigo ${formData.codigo}`
          }));
          setSubmitting(false);
          return;
        }

        const dataToUpdate = {
          ...formData,
          precioCompra: Number(String(formData.precioCompra).replace(/\D/g, "")),
          stock: formData.stock ? Number(formData.stock) : 0,
        };

        await updateProducto(resolvedDisplayName, currentProductoId, dataToUpdate);
        triggerToast("success", "¡Datos del producto actualizados correctamente!");
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar producto:", error);
      triggerToast("error", error.message || "Error al procesar la solicitud en Firestore.");
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteConfirmation = (producto) => {
    setProductoToDelete(producto);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!productoToDelete) return;

    try {
      await deleteProducto(resolvedDisplayName, productoToDelete.id);
      triggerToast("success", "¡Producto eliminado correctamente!");
    } catch (error) {
      console.error("Error al eliminar producto:", error);
      triggerToast("error", "No se pudo eliminar el producto.");
    } finally {
      setShowDeleteConfirm(false);
      setProductoToDelete(null);
    }
  };

  const formatDescription = (text) => {
    if (!text) return "—";
    const words = text.trim().split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += 16) {
      chunks.push(words.slice(i, i + 16).join(" "));
    }
    return chunks.map((chunk, index) => (
      <div key={index} style={{ marginBottom: "2px", whiteSpace: "normal", wordBreak: "break-word" }}>{chunk}</div>
    ));
  };

  return (
    <div className="productos-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="prod-header">
        <div className="prod-header-title">
          <div className="prod-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h2 className="prod-title">Gestión de Productos</h2>
            <p className="prod-subtitle">Base de datos de productos vinculados a tu cuenta de Firestore</p>
          </div>
        </div>

        {/* Tab Selector & Add Button */}
        <div className="prod-header-actions">
          <div className="prod-tabs">
            <button 
              className={`prod-tab-btn ${activeTab === "lista" ? "active" : ""}`}
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
              Productos
            </button>
            <button 
              className={`prod-tab-btn ${activeTab === "esquema" ? "active" : ""}`}
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
                className="prod-export-pdf-btn" 
                onClick={exportToPDF} 
                title="Exportar a PDF"
                disabled={filteredProductos.length === 0}
                style={{ opacity: filteredProductos.length === 0 ? 0.6 : 1, cursor: filteredProductos.length === 0 ? "not-allowed" : "pointer" }}
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
                className="prod-export-excel-btn" 
                onClick={exportToExcel} 
                title="Exportar a Excel"
                disabled={filteredProductos.length === 0}
                style={{ opacity: filteredProductos.length === 0 ? 0.6 : 1, cursor: filteredProductos.length === 0 ? "not-allowed" : "pointer" }}
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
              <button className="prod-add-btn" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nuevo Producto
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="prod-content-wrapper">
        {activeTab === "lista" ? (
          <div className="prod-tab-content">
            {/* Filters Bar */}
            <div className="prod-filters-bar">
              <div className="prod-search-box">
                <svg className="prod-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  placeholder="Buscar por nombre, correo o codigo..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="prod-search-input"
                />
              </div>

              <div className="prod-status-select-wrapper">
                <label>Estado:</label>
                <select 
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="prod-status-select"
                >
                  <option value="todos">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
              </div>
              
              <div className="prod-crud-alert">
                <span className="prod-badge-info">En línea</span>
                <span className="prod-text-success">Firestore Sincronizado</span>
              </div>
            </div>

            {/* Productos Table or Loading State */}
            <div className="prod-table-container">
              {isLoading ? (
                <div className="prod-loading-overlay">
                  <div className="prod-loading-spinner"></div>
                  <p>Conectando con base de datos...</p>
                </div>
              ) : filteredProductos.length > 0 ? (
                <table className="prod-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Descripción</th>
                      <th>Precio Unitario</th>
                      <th>Stock</th>
                      <th>Estado</th>
                      <th>Registrado por</th>
                      <th>Fecha de Registro</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductos.map((producto) => (
                      <tr key={producto.id} className={`prod-row ${producto.estado.toLowerCase()}`}>
                        <td className="prod-doc-num">{producto.codigo}</td>
                        <td className="prod-text-bold">{producto.nombre}</td>
                        <td className="prod-text-bold">{formatDescription(producto.descripcion)}</td>
                        <td>{formatPrice(producto.precioCompra)}</td>
                        <td>{producto.stock || "—"}</td>
                        <td>
                          <span className={`prod-status-badge ${producto.estado.toLowerCase()}`}>
                            <span className="prod-status-dot"></span>
                            {producto.estado}
                          </span>
                        </td>
                        <td className="prod-text-bold">{producto.registradoPor || resolvedDisplayName}</td>
                        <td className="prod-cell-date">{formatDate(producto.fechaCreacion)}</td>
                        <td>
                          <div className="prod-actions-cell">
                            <button 
                              className="prod-action-btn edit" 
                              onClick={() => openEditModal(producto)}
                              title="Editar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button 
                              className="prod-action-btn delete" 
                              onClick={() => askDeleteConfirmation(producto)}
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
                <div className="prod-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h3>No hay productos registrados</h3>
                  <p>Inicia registrando tu primer producto en la base de datos de Firestore.</p>
                  <button className="prod-add-btn" onClick={openCreateModal}>
                    Agregar Producto
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="prod-tab-content">
            {/* Schema Documentation Panel */}
            <div className="prod-schema-panel">
              <div className="prod-schema-info-card">
                <h3>Definición de Atributos — Colección de Firestore</h3>
                <p>El siguiente listado define cada uno de los campos estructurales implementados en el modelo de productos. Esta estructura garantiza coherencia de datos, integridad comercial y trazabilidad de los administradores creadores.</p>
                
                <div className="prod-schema-meta">
                  <div className="prod-meta-item">
                    <strong>Nombre de la Colección:</strong>
                    <code>productos</code>
                  </div>
                  <div className="prod-meta-item">
                    <strong>Proveedor de BD:</strong>
                    <span>Firebase Firestore (NoSQL Document Database)</span>
                  </div>
                </div>
              </div>

              <div className="prod-schema-grid">
                {schemaDefinition.map((field) => (
                  <div className="prod-schema-card" key={field.name}>
                    <div className="prod-schema-card-header">
                      <h4 className="prod-field-name">{field.name}</h4>
                      <span className={`prod-field-req ${field.required.includes("No") ? "optional" : "required"}`}>
                        {field.required}
                      </span>
                    </div>
                    <div className="prod-schema-card-body">
                      <div className="prod-field-type">
                        <strong>Tipo de dato:</strong>
                        <code>{field.type}</code>
                      </div>
                      <p className="prod-field-desc">{field.desc}</p>
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
        <div className="prod-modal-overlay">
          <div className="prod-modal-container">
            <div className="prod-modal-header">
              <h3>{modalMode === "create" ? "Registrar Nuevo Producto" : "Editar Datos de Producto"}</h3>
              <button className="prod-modal-close-btn" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="prod-form">
              <div className="prod-form-grid">
                {/* Código de Producto */}
                <div className="prod-form-group">
                  <label htmlFor="codigo">Código de Producto<span className="required-mark">*</span></label>
                  <input 
                    type="text" 
                    id="codigo"
                    name="codigo"
                    placeholder="Ej. 1098765432"
                    value={formData.codigo}
                    onChange={handleInputChange}
                    className={`prod-input ${formErrors.codigo ? "error" : ""}`}
                  />
                  {formErrors.codigo && (
                    <span className="prod-field-error">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      {formErrors.codigo}
                    </span>
                  )}
                </div>

                {/* Nombre */}
                <div className="prod-form-group">
                  <label htmlFor="nombre">Nombre<span className="required-mark">*</span></label>
                  <input 
                    type="text" 
                    id="nombre"
                    name="nombre"
                    placeholder="Ej. Laptop Dell XPS 15"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    className={`prod-input ${formErrors.nombre ? "error" : ""}`}
                  />
                  {formErrors.nombre && (
                    <span className="prod-field-error">{formErrors.nombre}</span>
                  )}
                </div>

                {/* Descripción */}
                <div className="prod-form-group span-2">
                  <label htmlFor="descripcion">Descripción</label>
                  <input 
                    type="text" 
                    id="descripcion"
                    name="descripcion"
                    placeholder="Ej. Computadora portátil de alto rendimiento"
                    value={formData.descripcion}
                    onChange={handleInputChange}
                    className={`prod-input ${formErrors.descripcion ? "error" : ""}`}
                  />
                  {formErrors.descripcion && (
                    <span className="prod-field-error">{formErrors.descripcion}</span>
                  )}
                </div>

                {/* Precio Unitario */}
                <div className="prod-form-group span-2">
                  <label htmlFor="precioCompra">Precio Unitario<span className="required-mark">*</span></label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    id="precioCompra"
                    name="precioCompra"
                    placeholder="Ej. 30.000"
                    value={formData.precioCompra}
                    onChange={handleInputChange}
                    className={`prod-input ${formErrors.precioCompra ? "error" : ""}`}
                  />
                  {formErrors.precioCompra && (
                    <span className="prod-field-error">{formErrors.precioCompra}</span>
                  )}
                </div>

                {/* Stock */}
                <div className="prod-form-group">
                  <label htmlFor="stock">Stock<span className="required-mark">*</span></label>
                  <input 
                    type="number" 
                    id="stock"
                    name="stock"
                    placeholder="Ej. 100"
                    value={formData.stock}
                    onChange={handleInputChange}
                    className="prod-input"
                  />
                </div>

                {/* Estado */}
                <div className="prod-form-group">
                  <label htmlFor="estado">Estado del Producto<span className="required-mark">*</span></label>
                  <select 
                    id="estado" 
                    name="estado"
                    value={formData.estado}
                    onChange={handleInputChange}
                    className="prod-select"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="prod-modal-footer">
                <button type="button" className="prod-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="prod-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="avatar-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Producto"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && productoToDelete && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-container delete-confirm">
            <div className="prod-delete-modal-content">
              <div className="prod-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="prod-delete-text">
                <h4>¿Eliminar producto permanentemente?</h4>
                <p>Esta acción eliminará a <strong>{`${productoToDelete.nombre} ${productoToDelete.descripcion}`}</strong> de la base de datos de Firestore. Esta operación no se puede deshacer.</p>
              </div>
            </div>
            <div className="prod-modal-footer">
              <button type="button" className="prod-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="prod-btn-danger" onClick={handleConfirmDelete}>
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`prod-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="prod-toast-close" onClick={() => setToastAlert(null)}>
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

export default Productos;
