import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { subscribeCompras, addCompra, updateCompra, deleteCompra } from "../../services/comprasService";
import { subscribeProveedores } from "../../services/proveedoresService";
import { subscribeProductos, updateProducto } from "../../services/productosService";
import { addMovimiento } from "../../services/movimientosService";
import { restoreCaret } from "../../utils/caretUtils";
import { getLocalDateString, formatDateShort } from "../../utils/dateUtils";
import "./Compras.css";

function Compras({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("lista"); // 'lista' | 'esquema'
  const [searchTerm, setSearchTerm] = useState("");

  // Estados de los Modales
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [currentCompraId, setCurrentCompraId] = useState(null);

  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [compraToDelete, setCompraToDelete] = useState(null);

  // Estados del Formulario
  const initialFormState = {
      fecha: getLocalDateString(),
    proveedorId: ""
  };
  const [formData, setFormData] = useState(initialFormState);
  const [cartItems, setCartItems] = useState([]); // { productoId, producto, cantidad, costoUnitario }
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Estados de Notificación / Toast Alerts
  const [toastAlert, setToastAlert] = useState(null);

  // Definición del esquema para visualización
  const schemaDefinition = [
    { name: "id", type: "string", required: "Sí (Autogenerado)", desc: "Identificador único de la compra asignado automáticamente por Firestore." },
    { name: "fecha", type: "string (YYYY-MM-DD)", required: "Sí", desc: "Fecha en que se realizó la compra de mercancía." },
    { name: "proveedorId", type: "string", required: "Sí", desc: "ID del documento del proveedor al que se le compró." },
    { name: "proveedorNombre", type: "string", required: "Sí", desc: "Nombre del proveedor al momento de registrar la compra." },
    { name: "items", type: "array<object>", required: "Sí", desc: "Productos comprados. Cada elemento: { productoId, producto, cantidad, costoUnitario, subtotal }." },
    { name: "cantidad", type: "number", required: "Sí", desc: "Cantidad total de artículos comprados (suma de todos los items)." },
    { name: "total", type: "number", required: "Sí", desc: "Total de la compra (suma de subtotales)." },
    { name: "creadoPor", type: "string", required: "Sí", desc: "ID único (uid) del usuario administrador que registró la compra." },
    { name: "registradoPor", type: "string", required: "Sí", desc: "Nombre del usuario administrador que registró la compra." },
    { name: "fechaCreacion", type: "timestamp / date", required: "Sí", desc: "Marca de tiempo del servidor al momento del registro." },
  ];

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "Usuario";

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeProveedores(
      resolvedDisplayName,
      user.uid,
      (updated) => {
        const active = updated.filter((p) => p.estado === "Activo");
        setProveedores(active);
      },
      (error) => console.error("Error al obtener proveedores para el selector de compras:", error)
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeProductos(
      resolvedDisplayName,
      user.uid,
      (updated) => {
        const active = updated.filter((p) => p.estado === "Activo");
        setProductos(active);
      },
      (error) => console.error("Error al obtener productos para el selector de compras:", error)
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    const unsubscribe = subscribeCompras(
      resolvedDisplayName,
      user.uid,
      (updatedCompras) => {
        setCompras(updatedCompras);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error al obtener compras de Firestore:", error);
        setIsLoading(false);
        triggerToast("error", "Error de conexión con la base de datos: " + error.message);
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

  const compraProductNames = (c) => {
    if (c && Array.isArray(c.items) && c.items.length) {
      return c.items.map((it) => it.producto || "").join(" ");
    }
    return "";
  };

  const filteredCompras = compras.filter((c) => {
    const matchesSearch =
      compraProductNames(c).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.proveedorNombre || "").toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatCurrencyInput = (value) => {
    const n = Number(value) || 0;
    return n ? new Intl.NumberFormat("es-CO").format(n) : "";
  };

  const getCompraItems = (compra) => {
    if (compra && Array.isArray(compra.items) && compra.items.length) return compra.items;
    return [];
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
      doc.text("AuroInventario — Registro de Compras", 14, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);

      doc.text(`Total: ${filteredCompras.length} compras`, 14, 34);

      doc.setDrawColor(212, 227, 245);
      doc.setLineWidth(0.5);
      doc.line(14, 38, 282, 38);

      const tableColumns = ["Fecha", "Proveedor", "Producto", "Cant.", "Costo Unitario", "Subtotal", "Registrado por", "Registro"];
      const tableRows = [];
      filteredCompras.forEach((c) => {
        const items = getCompraItems(c);
        items.forEach((it) => {
          const qty = Number(it.cantidad) || 0;
          const costo = Number(it.costoUnitario) || 0;
          tableRows.push([
            formatDateShort(c.fecha) || "—",
            c.proveedorNombre || "—",
            it.producto || "—",
            qty,
            formatCurrency(costo),
            formatCurrency(qty * costo),
            c.registradoPor || resolvedDisplayName,
            formatDate(c.fechaCreacion)
          ]);
        });
      });

      doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 42,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
        headStyles: { fillColor: [46, 92, 138], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 253] },
      });

      doc.save(`compras_${getLocalDateString()}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      const headers = ["Fecha", "Proveedor", "Producto", "Cant.", "Costo Unitario", "Subtotal", "Registrado por", "Registro"];
      const rows = [];
      filteredCompras.forEach((c) => {
        const items = getCompraItems(c);
        items.forEach((it) => {
          const qty = Number(it.cantidad) || 0;
          const costo = Number(it.costoUnitario) || 0;
          rows.push([
            formatDateShort(c.fecha) || "",
            c.proveedorNombre || "",
            it.producto || "",
            qty,
            costo,
            qty * costo,
            c.registradoPor || resolvedDisplayName,
            formatDate(c.fechaCreacion)
          ]);
        });
      });

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `compras_${getLocalDateString()}.csv`);
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
    const nuevoValor = esTexto ? value.toUpperCase() : value;
    setFormData((prev) => ({ ...prev, [name]: nuevoValor }));
    if (nuevoValor !== value) {
      restoreCaret(e.target, caret);
    }
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const addCartItem = () => {
    setCartItems((prev) => [
      ...prev,
      { productoId: "", producto: "", cantidad: 1, costoUnitario: 0 }
    ]);
  };

  const handleCartProductChange = (index, productoId) => {
    const selectedProd = productos.find((p) => p.id === productoId);
    const precioProveedorActual = selectedProd?.preciosProveedor?.[formData.proveedorId];
    setCartItems((prev) => prev.map((item, i) =>
      i === index
        ? {
            ...item,
            productoId,
            producto: selectedProd?.nombre || "",
            costoUnitario: precioProveedorActual ?? (selectedProd?.precioCompra || 0)
          }
        : item
    ));
    if (formErrors[`item-${index}`]) {
      setFormErrors((prev) => ({ ...prev, [`item-${index}`]: "" }));
    }
  };

  const handleCartFieldChange = (index, field, value) => {
    setCartItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === "costoUnitario") {
        const numericValue = value.replace(/\D/g, "");
        return { ...item, [field]: numericValue ? Number(numericValue) : 0 };
      }
      return { ...item, [field]: value };
    }));
    if (formErrors[`item-${index}`]) {
      setFormErrors((prev) => ({ ...prev, [`item-${index}`]: "" }));
    }
  };

  const removeCartItem = (index) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[`item-${index}`];
      return next;
    });
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.fecha) errors.fecha = "La fecha es requerida";
    if (!formData.proveedorId) errors.proveedorId = "Debe seleccionar un proveedor";

    if (cartItems.length === 0) {
      errors.items = "Agregue al menos un producto a la compra";
    }

    cartItems.forEach((item, index) => {
      if (!item.productoId) {
        errors[`item-${index}`] = "Seleccione un producto";
        return;
      }
      const cantidadInput = Number(item.cantidad);
      if (!item.cantidad || cantidadInput <= 0) {
        errors[`item-${index}`] = "La cantidad debe ser mayor a 0";
        return;
      }
      if (!item.costoUnitario || Number(item.costoUnitario) < 0) {
        errors[`item-${index}`] = "El costo unitario no puede ser negativo";
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    if (proveedores.length === 0) {
      triggerToast("error", "No puedes registrar compras sin proveedores activos. Registra un proveedor primero.");
      return;
    }
    if (productos.length === 0) {
      triggerToast("error", "No puedes registrar compras sin productos activos. Registra un producto primero.");
      return;
    }
    setFormData({
      ...initialFormState,
    fecha: getLocalDateString(),
      proveedorId: proveedores[0]?.id || ""
    });
    setCartItems([
      {
        productoId: productos[0]?.id || "",
        producto: productos[0]?.nombre || "",
        cantidad: 1,
        costoUnitario: productos[0]?.precioCompra || 0
      }
    ]);
    setFormErrors({});
    setModalMode("create");
    setCurrentCompraId(null);
    setShowModal(true);
  };

  const openEditModal = (compra) => {
    setCartItems(
      getCompraItems(compra).map((it) => ({
        productoId: it.productoId || "",
        producto: it.producto || "",
        cantidad: Number(it.cantidad) || 1,
        costoUnitario: Number(it.costoUnitario) || 0
      }))
    );
    setFormData({
      fecha: compra.fecha || getLocalDateString(),
      proveedorId: compra.proveedorId || ""
    });
    setFormErrors({});
    setModalMode("edit");
    setCurrentCompraId(compra.id);
    setShowModal(true);
  };

  const applyStockAndMovements = async (proveedorId, items, sign) => {
    for (const it of items) {
      const prod = productos.find((p) => p.id === it.productoId || p.nombre === it.producto);
      if (prod) {
        const stockProveedor = { ...(prod.stockProveedor || {}) };
        stockProveedor[proveedorId] = Math.max(0, (stockProveedor[proveedorId] || 0) + (sign * (Number(it.cantidad) || 0)));
        await updateProducto(resolvedDisplayName, prod.id, {
          stock: Math.max(0, (prod.stock || 0) + (sign * (Number(it.cantidad) || 0))),
          stockProveedor
        });
      }
      await addMovimiento(
        {
          tipo: "Compra",
          productoId: it.productoId,
          producto: it.producto,
          cantidad: sign * (Number(it.cantidad) || 0)
        },
        user.uid,
        resolvedDisplayName
      );
    }
  };

  // Al editar, aplica el delta neto de stock por producto para no duplicar unidades
  const aplicarEdicionStock = async (originalCompra, items) => {
    const cambios = {};
    const acumular = (productoId, proveedorId, delta) => {
      if (!cambios[productoId]) cambios[productoId] = { stockDelta: 0, stockProvDelta: {} };
      cambios[productoId].stockDelta += delta;
      cambios[productoId].stockProvDelta[proveedorId] = (cambios[productoId].stockProvDelta[proveedorId] || 0) + delta;
    };

    getCompraItems(originalCompra).forEach((it) => {
      const prod = productos.find((p) => p.id === it.productoId || p.nombre === it.producto);
      if (prod) acumular(prod.id, originalCompra.proveedorId, -(Number(it.cantidad) || 0));
    });
    items.forEach((it) => {
      const prod = productos.find((p) => p.id === it.productoId || p.nombre === it.producto);
      if (prod) acumular(prod.id, formData.proveedorId, Number(it.cantidad) || 0);
    });

    for (const [productoId, chg] of Object.entries(cambios)) {
      const prod = productos.find((p) => p.id === productoId);
      if (!prod) continue;
      const stockProveedor = { ...(prod.stockProveedor || {}) };
      for (const [provId, delta] of Object.entries(chg.stockProvDelta)) {
        stockProveedor[provId] = Math.max(0, (stockProveedor[provId] || 0) + delta);
      }
      await updateProducto(resolvedDisplayName, prod.id, {
        stock: Math.max(0, (Number(prod.stock) || 0) + chg.stockDelta),
        stockProveedor
      });
    }
  };

  const registrarMovimientos = async (items, sign) => {
    for (const it of items) {
      await addMovimiento(
        {
          tipo: "Compra",
          productoId: it.productoId,
          producto: it.producto,
          cantidad: sign * (Number(it.cantidad) || 0)
        },
        user.uid,
        resolvedDisplayName
      );
    }
  };

  // Sincroniza el costo unitario pagado por producto hacia el precio por proveedor del producto
  const syncPreciosProveedor = async (proveedorId, proveedorNombre, items) => {
    for (const it of items) {
      const prod = productos.find((p) => p.id === it.productoId || p.nombre === it.producto);
      if (!prod) continue;
      const costo = Number(it.costoUnitario) || 0;
      const preciosProveedor = { ...(prod.preciosProveedor || {}), [proveedorId]: costo };
      const updateData = { preciosProveedor };
      if (prod.proveedorId === proveedorId) {
        updateData.precioCompra = costo;
      }
      await updateProducto(resolvedDisplayName, prod.id, updateData);
    }
  };

  // Recalcula el precio de un proveedor para un producto a partir de las compras restantes
  const recomputePreciosProveedor = async (proveedorId, productoId) => {
    const prod = productos.find((p) => p.id === productoId || p.nombre === productoId);
    if (!prod) return;

    const precios = [];
    compras.forEach((c) => {
      if (c.id === compraToDelete?.id) return;
      if (c.proveedorId !== proveedorId) return;
      if (!Array.isArray(c.items)) return;
      c.items.forEach((it) => {
        if (it.productoId === productoId) {
          precios.push(Number(it.costoUnitario) || 0);
        }
      });
    });

    const preciosProveedor = { ...(prod.preciosProveedor || {}) };
    if (precios.length === 0) {
      delete preciosProveedor[proveedorId];
    } else {
      preciosProveedor[proveedorId] = precios[precios.length - 1];
    }

    const updateData = { preciosProveedor };
    if (prod.proveedorId === proveedorId) {
      if (precios.length === 0) {
        updateData.precioCompra = Number(prod.precioCompra) || 0;
      } else {
        updateData.precioCompra = precios[precios.length - 1];
      }
    }
    await updateProducto(resolvedDisplayName, prod.id, updateData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const selectedProv = proveedores.find((p) => p.id === formData.proveedorId);
      const items = cartItems.map((it) => ({
        productoId: it.productoId,
        producto: it.producto,
        cantidad: Number(it.cantidad),
        costoUnitario: Number(it.costoUnitario) || 0
      }));

      const dataToSave = {
        ...formData,
        proveedorNombre: selectedProv ? selectedProv.nombre : "Proveedor Desconocido",
        items
      };

      if (modalMode === "create") {
        await addCompra(dataToSave, user.uid, resolvedDisplayName);
        await applyStockAndMovements(formData.proveedorId, items, 1);
        await syncPreciosProveedor(formData.proveedorId, dataToSave.proveedorNombre, items);
        triggerToast("success", "¡Compra registrada y stock actualizado correctamente!");
      } else {
        const originalCompra = compras.find((c) => c.id === currentCompraId);
        const originalItems = getCompraItems(originalCompra);
        await updateCompra(resolvedDisplayName, currentCompraId, dataToSave);

        // Revertir movimientos originales y registrar los nuevos
        await registrarMovimientos(originalItems, -1);
        await registrarMovimientos(items, 1);
        // Aplicar el delta neto de stock por producto (resta original, suma nuevo)
        await aplicarEdicionStock(originalCompra, items);
        await syncPreciosProveedor(formData.proveedorId, dataToSave.proveedorNombre, items);

        triggerToast("success", "¡Registro de compra actualizado correctamente!");
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar compra:", error);
      triggerToast("error", error.message || "Error al procesar la solicitud en Firestore.");
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteConfirmation = (compra) => {
    setCompraToDelete(compra);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!compraToDelete) return;

    try {
      await deleteCompra(resolvedDisplayName, compraToDelete.id);
      // Devolver stock de la compra y registrar movimientos inversos
      await applyStockAndMovements(compraToDelete.proveedorId, getCompraItems(compraToDelete), -1);
      // Recalcular el precio por proveedor de los productos afectados
      const proveedorIdBorrado = compraToDelete.proveedorId;
      getCompraItems(compraToDelete).forEach((it) => {
        recomputePreciosProveedor(proveedorIdBorrado, it.productoId)
          .catch((err) => console.error("Error al recalcular precio por proveedor:", err));
      });
      triggerToast("success", "¡Registro de compra eliminado correctamente!");
    } catch (error) {
      console.error("Error al eliminar compra:", error);
      triggerToast("error", "No se pudo eliminar el registro de compra.");
    } finally {
      setShowDeleteConfirm(false);
      setCompraToDelete(null);
    }
  };

  const totalInvertido = filteredCompras.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  const unidadesCompradas = filteredCompras.reduce((acc, c) => acc + (Number(c.cantidad) || 0), 0);
  const totalCalculado = cartItems.reduce(
    (acc, it) => acc + ((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0)),
    0
  );

  return (
    <div className="compras-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="com-header">
        <div className="com-header-title">
          <div className="com-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </div>
          <div>
            <h2 className="com-title">Gestión de Compras</h2>
            <p className="com-subtitle">Control de mercancía comprada a proveedores, con aumento automático de stock</p>
          </div>
        </div>

        <div className="com-header-actions">
          <div className="com-tabs">
            <button
              className={`com-tab-btn ${activeTab === "lista" ? "active" : ""}`}
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
              Compras
            </button>
            <button
              className={`com-tab-btn ${activeTab === "esquema" ? "active" : ""}`}
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
                className="com-export-pdf-btn"
                onClick={exportToPDF}
                title="Exportar a PDF"
                disabled={filteredCompras.length === 0}
                style={{ opacity: filteredCompras.length === 0 ? 0.6 : 1, cursor: filteredCompras.length === 0 ? "not-allowed" : "pointer" }}
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
                className="com-export-excel-btn"
                onClick={exportToExcel}
                title="Exportar a Excel"
                disabled={filteredCompras.length === 0}
                style={{ opacity: filteredCompras.length === 0 ? 0.6 : 1, cursor: filteredCompras.length === 0 ? "not-allowed" : "pointer" }}
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
              <button className="com-add-btn" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nueva Compra
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="com-content-wrapper">
        {activeTab === "lista" ? (
          <div className="com-tab-content">
            {/* Tarjetas de estadísticas */}
            <div className="com-stats-summary">
              <div className="com-stat-card">
                <span className="com-stat-label">TOTAL INVERTIDO EN COMPRAS</span>
                <h3 className="com-stat-value">{formatCurrency(totalInvertido)}</h3>
              </div>
              <div className="com-stat-card">
                <span className="com-stat-label">COMPRAS REGISTRADAS</span>
                <h3 className="com-stat-value">{filteredCompras.length}</h3>
              </div>
              <div className="com-stat-card">
                <span className="com-stat-label">UNIDADES COMPRADAS</span>
                <h3 className="com-stat-value">{unidadesCompradas}</h3>
              </div>
            </div>

            <div className="com-filters-bar">
              <div className="com-search-box">
                <svg className="com-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por proveedor o producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="com-search-input"
                />
              </div>

              <div className="com-crud-alert">
                <span className="com-badge-info">En línea</span>
                <span className="com-text-success">Firestore Sincronizado</span>
              </div>
            </div>

            <div className="com-table-container">
              {isLoading ? (
                <div className="com-loading-overlay">
                  <div className="com-loading-spinner"></div>
                  <p>Conectando con base de datos de compras...</p>
                </div>
              ) : filteredCompras.length > 0 ? (
                <table className="com-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Proveedor</th>
                      <th>Productos</th>
                      <th>Cant.</th>
                      <th>Total</th>
                      <th>Registrado por</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompras.map((compra) => {
                      const compraItems = getCompraItems(compra);
                      const compraQty = compraItems.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
                      return (
                        <tr key={compra.id} className="com-row">
                          <td className="com-cell-date">{formatDateShort(compra.fecha) || formatDate(compra.fechaCreacion)}</td>
                          <td className="com-text-bold">{compra.proveedorNombre || "—"}</td>
                          <td>
                            {compraItems.length > 1 ? (
                              <div className="com-product-list">
                                {compraItems.map((it, i) => (
                                  <div className="com-product-item" key={i}>
                                    <span className="com-product-item-name">{it.producto || "—"}</span>
                                    <span className="com-product-item-qty">x{it.cantidad}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span>{compraItems[0]?.producto || "—"}</span>
                            )}
                          </td>
                          <td>{compraQty}</td>
                          <td className="com-cell-total">{formatCurrency(compra.total)}</td>
                          <td className="com-text-bold" style={{ fontSize: "0.75rem" }}>
                            {compra.registradoPor || resolvedDisplayName}
                          </td>
                          <td>
                            <div className="com-actions-cell">
                              <button
                                className="com-action-btn edit"
                                onClick={() => openEditModal(compra)}
                                title="Editar"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                              <button
                                className="com-action-btn delete"
                                onClick={() => askDeleteConfirmation(compra)}
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
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="com-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                  </svg>
                  <h3>No hay compras registradas</h3>
                  <p>Registra tu primera compra de mercancía y el stock aumentará automáticamente.</p>
                  <button className="com-add-btn" onClick={openCreateModal}>
                    Registrar Compra
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="com-tab-content">
            <div className="com-schema-panel">
              <div className="com-schema-info-card">
                <h3>Definición de Atributos — Colección de Compras</h3>
                <p>El siguiente listado define cada uno de los campos estructurales implementados en el modelo de compras en Firestore. Al registrar una compra, el stock de cada producto aumenta automáticamente y queda registrado en el historial de movimientos de inventario.</p>

                <div className="com-schema-meta">
                  <div className="com-meta-item">
                    <strong>Nombre de la Colección:</strong>
                    <code>compras</code>
                  </div>
                  <div className="com-meta-item">
                    <strong>Proveedor de BD:</strong>
                    <span>Firebase Firestore (NoSQL Document Database)</span>
                  </div>
                </div>
              </div>

              <div className="com-schema-grid">
                {schemaDefinition.map((field) => (
                  <div className="com-schema-card" key={field.name}>
                    <div className="com-schema-card-header">
                      <h4 className="com-field-name">{field.name}</h4>
                      <span className={`com-field-req ${field.required.includes("No") ? "optional" : "required"}`}>
                        {field.required}
                      </span>
                    </div>
                    <div className="com-schema-card-body">
                      <div className="com-field-type">
                        <strong>Tipo de dato:</strong>
                        <code>{field.type}</code>
                      </div>
                      <p className="com-field-desc">{field.desc}</p>
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
        <div className="com-modal-overlay">
          <div className="com-modal-container">
            <div className="com-modal-header">
              <h3>{modalMode === "create" ? "Registrar Nueva Compra" : "Editar Registro de Compra"}</h3>
              <button className="com-modal-close-btn" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="com-form">
              <div className="com-form-grid">
                <div className="com-form-group">
                  <label htmlFor="fecha">Fecha de la Compra<span className="required-mark">*</span></label>
                  <input
                    type="date"
                    id="fecha"
                    name="fecha"
                    value={formData.fecha}
                    onChange={handleInputChange}
                    className={`com-input ${formErrors.fecha ? "error" : ""}`}
                  />
                  {formErrors.fecha && (
                    <span className="com-field-error">{formErrors.fecha}</span>
                  )}
                </div>

                <div className="com-form-group">
                  <label htmlFor="proveedorId">Proveedor<span className="required-mark">*</span></label>
                  <select
                    id="proveedorId"
                    name="proveedorId"
                    value={formData.proveedorId}
                    onChange={handleInputChange}
                    className={`com-select ${formErrors.proveedorId ? "error" : ""}`}
                  >
                    <option value="" disabled>Seleccione un proveedor...</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}{p.empresa ? ` — ${p.empresa}` : ""}
                      </option>
                    ))}
                  </select>
                  {formErrors.proveedorId && (
                    <span className="com-field-error">{formErrors.proveedorId}</span>
                  )}
                </div>

                {/* Productos (Carrito Multi-Producto) */}
                <div className="com-form-group span-2">
                  <label>Productos Comprados (Puede agregar varios)<span className="required-mark">*</span></label>
                  {formErrors.items && (
                    <span className="com-field-error">{formErrors.items}</span>
                  )}

                  <div className="com-cart-box">
                    {cartItems.map((item, index) => {
                      const subtotal = (Number(item.cantidad) || 0) * (Number(item.costoUnitario) || 0);

                      return (
                        <div className="com-cart-row" key={index}>
                          <div className="com-cart-col product">
                            <select
                              value={item.productoId}
                              onChange={(e) => handleCartProductChange(index, e.target.value)}
                              className={`com-select ${formErrors[`item-${index}`] ? "error" : ""}`}
                            >
                              <option value="" disabled>Seleccione un producto...</option>
                              {productos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{p.codigo}] {p.nombre} — (Stock: {p.stock !== undefined ? p.stock : 0})
                                </option>
                              ))}
                            </select>
                            {formErrors[`item-${index}`] && (
                              <span className="com-field-error">{formErrors[`item-${index}`]}</span>
                            )}
                          </div>

                          <div className="com-cart-col qty">
                            <label>Cant.</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="1"
                              value={item.cantidad}
                              onChange={(e) => handleCartFieldChange(index, "cantidad", e.target.value)}
                              className={`com-input ${formErrors[`item-${index}`] ? "error" : ""}`}
                            />
                          </div>

                          <div className="com-cart-col price">
                            <label>Costo Unit.</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={formatCurrencyInput(item.costoUnitario)}
                              onChange={(e) => handleCartFieldChange(index, "costoUnitario", e.target.value)}
                              className="com-input"
                            />
                          </div>

                          <div className="com-cart-col subtotal">
                            <label>Subtotal</label>
                            <span className="com-cart-subtotal">{formatCurrency(subtotal)}</span>
                          </div>

                          <div className="com-cart-col remove">
                            <button
                              type="button"
                              className="com-cart-remove-btn"
                              onClick={() => removeCartItem(index)}
                              title="Quitar producto"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button type="button" className="com-cart-add-btn" onClick={addCartItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Agregar otro producto
                    </button>
                  </div>

                  <div className="com-total-summary">
                    <span>Total de la compra</span>
                    <strong>{formatCurrency(totalCalculado)}</strong>
                  </div>
                </div>
              </div>

              <div className="com-modal-footer">
                <button type="button" className="com-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="com-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="avatar-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Compra"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && compraToDelete && (
        <div className="com-modal-overlay">
          <div className="com-modal-container delete-confirm">
            <div className="com-delete-modal-content">
              <div className="com-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="com-delete-text">
                <h4>¿Eliminar compra permanentemente?</h4>
                <p>
                  Esta acción eliminará la compra de <strong>{compraToDelete.proveedorNombre}</strong> por{" "}
                  <strong>{formatCurrency(compraToDelete.total)}</strong> y descontará los productos del inventario.
                  Esta operación no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="com-modal-footer">
              <button type="button" className="com-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="com-btn-danger" onClick={handleConfirmDelete}>
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`com-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="com-toast-close" onClick={() => setToastAlert(null)}>
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

export default Compras;
