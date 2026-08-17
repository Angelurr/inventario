import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { subscribeProductos, updateProducto, deleteProducto } from "../../services/productosService";
import { subscribeMovimientos, addMovimiento } from "../../services/movimientosService";
import { subscribeCompras } from "../../services/comprasService";
import { getLocalDateString } from "../../utils/dateUtils";
import "./Inventario.css";

function Inventario({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inventario"); // 'inventario' | 'movimientos'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Estados del Modal de Ajuste
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [newStock, setNewStock] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productoToDelete, setProductoToDelete] = useState(null);

  // Estados de Notificación / Toast Alerts
  const [toastAlert, setToastAlert] = useState(null);

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "Usuario";

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    const unsubscribe = subscribeProductos(
      resolvedDisplayName,
      user.uid,
      (updatedProductos) => {
        setProductos(updatedProductos);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error al obtener inventario de Firestore:", error);
        setIsLoading(false);
        triggerToast("error", "Error de conexión con la base de datos: " + error.message);
      }
    );

    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeMovimientos(
      resolvedDisplayName,
      user.uid,
      (updatedMovimientos) => {
        setMovimientos(updatedMovimientos);
      },
      (error) => {
        console.error("Error al obtener movimientos de inventario:", error);
      }
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeCompras(
      resolvedDisplayName,
      user.uid,
      (updatedCompras) => {
        setCompras(updatedCompras);
      },
      (error) => {
        console.error("Error al obtener compras para valorizar inventario:", error);
      }
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  const triggerToast = (type, message) => {
    setToastAlert({ type, message });
    setTimeout(() => {
      setToastAlert(null);
    }, 4000);
  };

  // Determinar estado del producto según stock y stock mínimo
  const getProductoEstado = (p) => {
    const stock = Number(p.stock) || 0;
    const stockMinimo = Number(p.stockMinimo) || 0;
    if (stock <= 0) return "Agotado";
    if (stock <= stockMinimo) return "Bajo stock";
    return "Disponible";
  };

  const getEstadoClass = (estado) => {
    return (estado || "").toLowerCase().replace(/\s+/g, "-");
  };

  const filteredProductos = productos.filter((p) => {
    const matchesSearch =
      (p.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.codigo || "").includes(searchTerm) ||
      (p.categoria || "").toLowerCase().includes(searchTerm.toLowerCase());

    const estado = getProductoEstado(p);
    const matchesEstado =
      filterEstado === "todos" || estado === filterEstado;

    return matchesSearch && matchesEstado;
  });

  const filteredMovimientos = movimientos.filter((m) => {
    const matchesSearch =
      (m.producto || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.tipo || "").toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "—";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    }).format(value);
  };

  // Devuelve los lotes de compra de un producto: cada compra con su cantidad y precio unitario
  const getLotesProducto = (producto) => {
    const lotes = [];
    compras.forEach((c) => {
      if (!Array.isArray(c.items)) return;
      c.items.forEach((it) => {
        if (it.productoId === producto.id) {
          lotes.push({
            cantidad: Number(it.cantidad) || 0,
            costo: Number(it.costoUnitario) || 0,
            fecha: c.fechaCreacion?.seconds || 0
          });
        }
      });
    });
    lotes.sort((a, b) => a.fecha - b.fecha);
    return lotes;
  };

  // Valor real del producto: reparte el stock actual entre los lotes de compra (los primeros comprados se valoran primero)
  const getValorRealProducto = (producto) => {
    const stock = Number(producto.stock) || 0;
    const lotes = getLotesProducto(producto);
    let restante = stock;
    let valor = 0;
    for (const lote of lotes) {
      if (restante <= 0) break;
      const tomar = Math.min(restante, lote.cantidad);
      valor += tomar * lote.costo;
      restante -= tomar;
    }
    if (restante > 0) {
      valor += restante * (Number(producto.precioCompra) || 0);
    }
    return valor;
  };

  // Texto con los precios de compra distintos del producto para exportaciones
  const getPreciosCompraTexto = (producto) => {
    const lotes = getLotesProducto(producto);
    if (lotes.length === 0) return formatCurrency(Number(producto.precioCompra) || 0);
    return lotes.map((l) => `${l.cantidad}u × ${formatCurrency(l.costo)}`).join(" | ");
  };

  // Métricas
  const valorInventario = productos.reduce((acc, p) => acc + getValorRealProducto(p), 0);
  const stockTotal = productos.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
  const enRiesgo = productos.filter((p) => ["Bajo stock", "Agotado"].includes(getProductoEstado(p))).length;

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
      const title = activeTab === "inventario" ? "AuroInventario — Inventario" : "AuroInventario — Movimientos de Inventario";
      doc.text(title, 14, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);

      if (activeTab === "inventario") {
        doc.text(`Valor del inventario: ${formatCurrency(valorInventario)} | Stock total: ${stockTotal} unidades`, 14, 34);

        doc.setDrawColor(212, 227, 245);
        doc.setLineWidth(0.5);
        doc.line(14, 38, 282, 38);

        const tableColumns = ["Código", "Producto", "Stock", "Stock Mínimo", "Precios de Compra", "Valor del Inventario", "Estado"];
        const tableRows = filteredProductos.map((p) => [
          p.codigo || "",
          p.nombre || "",
          Number(p.stock) || 0,
          Number(p.stockMinimo) || 0,
          getPreciosCompraTexto(p),
          formatCurrency(getValorRealProducto(p)),
          getProductoEstado(p)
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
      } else {
        doc.text(`Total de movimientos: ${filteredMovimientos.length}`, 14, 34);

        doc.setDrawColor(212, 227, 245);
        doc.setLineWidth(0.5);
        doc.line(14, 38, 282, 38);

        const tableColumns = ["Fecha", "Movimiento", "Producto", "Cantidad", "Registrado por"];
        const tableRows = filteredMovimientos.map((m) => [
          formatDateTime(m.fechaCreacion),
          m.tipo || "",
          m.producto || "",
          (Number(m.cantidad) || 0) > 0 ? `+${m.cantidad}` : m.cantidad,
          m.registradoPor || resolvedDisplayName
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
      }

      doc.save(`inventario_${getLocalDateString()}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      let headers;
      let rows;

      if (activeTab === "inventario") {
        headers = ["Código", "Producto", "Stock", "Stock Mínimo", "Precios de Compra", "Valor del Inventario", "Estado"];
        rows = filteredProductos.map((p) => [
          p.codigo || "",
          p.nombre || "",
          Number(p.stock) || 0,
          Number(p.stockMinimo) || 0,
          getPreciosCompraTexto(p),
          getValorRealProducto(p),
          getProductoEstado(p)
        ]);
      } else {
        headers = ["Fecha", "Movimiento", "Producto", "Cantidad", "Registrado por"];
        rows = filteredMovimientos.map((m) => [
          formatDateTime(m.fechaCreacion),
          m.tipo || "",
          m.producto || "",
          (Number(m.cantidad) || 0) > 0 ? `+${m.cantidad}` : m.cantidad,
          m.registradoPor || resolvedDisplayName
        ]);
      }

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `inventario_${getLocalDateString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("success", "¡Excel exportado correctamente!");
    } catch (error) {
      console.error("Error al exportar Excel:", error);
      triggerToast("error", "No se pudo exportar a Excel.");
    }
  };

  const openAdjustModal = (producto) => {
    setAdjustProduct(producto);
    setNewStock(String(Number(producto.stock) || 0));
    setAdjustError("");
    setShowAdjustModal(true);
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustProduct) return;

    const nuevo = Number(newStock);
    if (isNaN(nuevo) || nuevo < 0) {
      setAdjustError("El stock nuevo debe ser un número mayor o igual a cero");
      return;
    }

    const actual = Number(adjustProduct.stock) || 0;
    const diferencia = nuevo - actual;

    setSubmitting(true);
    try {
      await updateProducto(resolvedDisplayName, adjustProduct.id, { stock: nuevo });
      await addMovimiento(
        {
          tipo: "Ajuste",
          productoId: adjustProduct.id,
          producto: adjustProduct.nombre,
          cantidad: diferencia,
          referencia: adjustProduct.id
        },
        user.uid,
        resolvedDisplayName
      );
      triggerToast("success", `¡Stock de ${adjustProduct.nombre} ajustado correctamente!`);
      setShowAdjustModal(false);
    } catch (error) {
      console.error("Error al ajustar stock:", error);
      triggerToast("error", error.message || "No se pudo ajustar el stock.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentTableData = activeTab === "inventario" ? filteredProductos : filteredMovimientos;

  const askDeleteConfirmation = (producto) => {
    setProductoToDelete(producto);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!productoToDelete) return;

    setSubmitting(true);
    try {
      const stockEliminado = Number(productoToDelete.stock) || 0;

      await deleteProducto(resolvedDisplayName, productoToDelete.id);

      // Registrar el movimiento de salida por la eliminación del producto
      if (stockEliminado > 0) {
        await addMovimiento(
          {
            tipo: "Ajuste",
            productoId: productoToDelete.id,
            producto: productoToDelete.nombre,
            cantidad: -stockEliminado,
            referencia: productoToDelete.id
          },
          user.uid,
          resolvedDisplayName
        );
      }

      triggerToast("success", "¡Producto eliminado del inventario correctamente!");
    } catch (error) {
      console.error("Error al eliminar producto del inventario:", error);
      triggerToast("error", error.message || "No se pudo eliminar el producto del inventario.");
    } finally {
      setShowDeleteConfirm(false);
      setProductoToDelete(null);
      setSubmitting(false);
    }
  };

  return (
    <div className="inventario-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="inv-header">
        <div className="inv-header-title">
          <div className="inv-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div>
            <h2 className="inv-title">Inventario</h2>
            <p className="inv-subtitle">Control exclusivo de stock, valor de inventario y movimientos</p>
          </div>
        </div>

        <div className="inv-header-actions">
          <div className="inv-tabs">
            <button
              className={`inv-tab-btn ${activeTab === "inventario" ? "active" : ""}`}
              onClick={() => setActiveTab("inventario")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              </svg>
              Inventario
            </button>
            <button
              className={`inv-tab-btn ${activeTab === "movimientos" ? "active" : ""}`}
              onClick={() => setActiveTab("movimientos")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Movimientos
            </button>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              className="inv-export-pdf-btn"
              onClick={exportToPDF}
              title="Exportar a PDF"
              disabled={currentTableData.length === 0}
              style={{ opacity: currentTableData.length === 0 ? 0.6 : 1, cursor: currentTableData.length === 0 ? "not-allowed" : "pointer" }}
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
              className="inv-export-excel-btn"
              onClick={exportToExcel}
              title="Exportar a Excel"
              disabled={currentTableData.length === 0}
              style={{ opacity: currentTableData.length === 0 ? 0.6 : 1, cursor: currentTableData.length === 0 ? "not-allowed" : "pointer" }}
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
          </div>
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="inv-content-wrapper">
        <div className="inv-tab-content">
          {/* Tarjetas de estadísticas */}
          <div className="inv-stats-summary">
            <div className="inv-stat-card">
              <span className="inv-stat-label">VALOR DEL INVENTARIO</span>
              <h3 className="inv-stat-value">{formatCurrency(valorInventario)}</h3>
            </div>
            <div className="inv-stat-card">
              <span className="inv-stat-label">STOCK TOTAL (UNIDADES)</span>
              <h3 className="inv-stat-value">{stockTotal}</h3>
            </div>
            <div className="inv-stat-card">
              <span className="inv-stat-label">PRODUCTOS REGISTRADOS</span>
              <h3 className="inv-stat-value">{productos.length}</h3>
            </div>
            <div className="inv-stat-card">
              <span className="inv-stat-label">PRODUCTOS EN RIESGO</span>
              <h3 className="inv-stat-value risk">{enRiesgo}</h3>
            </div>
          </div>

          <div className="inv-filters-bar">
            <div className="inv-search-box">
              <svg className="inv-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder={activeTab === "inventario" ? "Buscar por nombre, código o categoría..." : "Buscar por producto o tipo de movimiento..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="inv-search-input"
              />
            </div>

            {activeTab === "inventario" && (
              <div className="inv-status-select-wrapper">
                <label>Estado:</label>
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="inv-status-select"
                >
                  <option value="todos">Todos</option>
                  <option value="Disponible">Disponible</option>
                  <option value="Bajo stock">Bajo stock</option>
                  <option value="Agotado">Agotado</option>
                </select>
              </div>
            )}

            <div className="inv-crud-alert">
              <span className="inv-badge-info">En línea</span>
              <span className="inv-text-success">Firestore Sincronizado</span>
            </div>
          </div>

          <div className="inv-table-container">
            {isLoading ? (
              <div className="inv-loading-overlay">
                <div className="inv-loading-spinner"></div>
                <p>Conectando con base de datos de inventario...</p>
              </div>
            ) : activeTab === "inventario" ? (
              filteredProductos.length > 0 ? (
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Stock Actual</th>
                      <th>Stock Mínimo</th>
                      <th>Precios de Compra</th>
                      <th>Valor del Inventario</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductos.map((producto) => {
                      const estado = getProductoEstado(producto);
                      const lotes = getLotesProducto(producto);
                      const valor = getValorRealProducto(producto);
                      return (
                        <tr key={producto.id} className="inv-row">
                          <td className="inv-doc-num">{producto.codigo}</td>
                          <td className="inv-text-bold">{producto.nombre}</td>
                          <td>
                            <span className={`inv-stock-value ${getEstadoClass(estado)}`}>
                              {Number(producto.stock) || 0}
                            </span>
                          </td>
                          <td>{Number(producto.stockMinimo) || 0}</td>
                          <td>
                            {lotes.length === 0 ? (
                              <span>{formatCurrency(Number(producto.precioCompra) || 0)}</span>
                            ) : (
                              <div className="inv-price-lots">
                                {lotes.map((l, idx) => (
                                  <span className="inv-price-lot" key={idx}>
                                    {l.cantidad}u × {formatCurrency(l.costo)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="inv-cell-value">{formatCurrency(valor)}</td>
                          <td>
                            <span className={`inv-status-badge ${getEstadoClass(estado)}`}>
                              <span className="inv-status-dot"></span>
                              {estado}
                            </span>
                          </td>
                          <td>
                            <div className="inv-actions-cell">
                              <button
                                className="inv-action-btn adjust"
                                onClick={() => openAdjustModal(producto)}
                                title="Ajustar stock"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9"></path>
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                              </button>
                              <button
                                className="inv-action-btn delete"
                                onClick={() => askDeleteConfirmation(producto)}
                                title="Eliminar producto"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="inv-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h3>No hay productos en el inventario</h3>
                  <p>Registra productos para visualizar el control de stock, valor y estado del inventario.</p>
                </div>
              )
            ) : (
              filteredMovimientos.length > 0 ? (
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Movimiento</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovimientos.map((mov) => {
                      const cantidad = Number(mov.cantidad) || 0;
                      return (
                        <tr key={mov.id} className="inv-row">
                          <td className="inv-cell-date">{formatDateTime(mov.fechaCreacion)}</td>
                          <td>
                            <span className={`inv-mov-badge ${(mov.tipo || "").toLowerCase()}`}>
                              {mov.tipo}
                            </span>
                          </td>
                          <td className="inv-text-bold">{mov.producto}</td>
                          <td className={cantidad >= 0 ? "inv-qty-positive" : "inv-qty-negative"}>
                            {cantidad > 0 ? `+${cantidad}` : cantidad}
                          </td>
                          <td className="inv-text-bold" style={{ fontSize: "0.75rem" }}>
                            {mov.registradoPor || resolvedDisplayName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="inv-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h3>Sin movimientos de inventario</h3>
                  <p>Las compras, ventas y ajustes de stock quedarán registrados aquí como historial.</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ===== AJUSTE DE STOCK MODAL ===== */}
      {showAdjustModal && adjustProduct && (
        <div className="inv-modal-overlay">
          <div className="inv-modal-container">
            <div className="inv-modal-header">
              <div className="inv-modal-title">
                <div className="inv-modal-title-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                  </svg>
                </div>
                <div>
                  <h3>Ajustar Stock</h3>
                  <p className="inv-modal-subtitle">Corrige la cantidad disponible del producto</p>
                </div>
              </div>
              <button className="inv-modal-close-btn" onClick={() => setShowAdjustModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="inv-form">
              <div className="inv-adjust-product-info">
                <div className="inv-adjust-product-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div className="inv-adjust-product-details">
                  <span className="inv-adjust-label">Producto</span>
                  <strong>{adjustProduct.nombre}</strong>
                  <span className="inv-adjust-code">Código: {adjustProduct.codigo || "—"}</span>
                </div>
              </div>

              <div className="inv-adjust-grid">
                <div className="inv-form-group">
                  <label>Stock Actual</label>
                  <div className="inv-input-wrapper readonly">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    </svg>
                    <input
                      type="number"
                      value={Number(adjustProduct.stock) || 0}
                      readOnly
                      className="inv-input"
                    />
                  </div>
                </div>

                <div className="inv-form-group">
                  <label htmlFor="newStock">Stock Nuevo<span className="required-mark">*</span></label>
                  <div className={`inv-input-wrapper ${adjustError ? "error" : ""}`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    <input
                      type="number"
                      id="newStock"
                      min="0"
                      step="1"
                      value={newStock}
                      onChange={(e) => {
                        setNewStock(e.target.value);
                        setAdjustError("");
                      }}
                      className="inv-input"
                    />
                  </div>
                  {adjustError && (
                    <span className="inv-field-error">{adjustError}</span>
                  )}
                </div>
              </div>

              <div className="inv-adjust-summary">
                <div className="inv-diff-row">
                  <span className="inv-diff-label">Diferencia</span>
                  <strong className={(Number(newStock) - (Number(adjustProduct.stock) || 0)) >= 0 ? "inv-diff-positive" : "inv-diff-negative"}>
                    {(() => {
                      const diff = Number(newStock) - (Number(adjustProduct.stock) || 0);
                      return diff > 0 ? `+${diff} unidades` : `${diff} unidades`;
                    })()}
                  </strong>
                </div>
                <span className="inv-adjust-hint">
                  Se registrará un movimiento de tipo "Ajuste" en el historial de inventario.
                </span>
              </div>

              <div className="inv-modal-footer">
                <button type="button" className="inv-btn-secondary" onClick={() => setShowAdjustModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="inv-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="avatar-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Ajuste"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && productoToDelete && (
        <div className="inv-modal-overlay">
          <div className="inv-modal-container delete-confirm">
            <div className="inv-delete-modal-content">
              <div className="inv-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="inv-delete-text">
                <h4>¿Eliminar producto del inventario?</h4>
                <p>
                  Esta acción eliminará a <strong>{productoToDelete.nombre}</strong> de la base de datos de Firestore
                  {Number(productoToDelete.stock) > 0 ? ` y su stock (${productoToDelete.stock} unidades) se descontará del historial de movimientos` : ""}.
                  Esta operación no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="inv-modal-footer">
              <button type="button" className="inv-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="inv-btn-danger" onClick={handleConfirmDelete} disabled={submitting}>
                {submitting ? "Eliminando..." : "Eliminar Producto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`inv-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="inv-toast-close" onClick={() => setToastAlert(null)}>
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

export default Inventario;
