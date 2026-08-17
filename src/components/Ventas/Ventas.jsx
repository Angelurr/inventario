import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { 
  subscribeVentas, 
  addVenta, 
  updateVenta, 
  deleteVenta 
} from "../../services/ventasService";
import { subscribeClientes } from "../../services/clientesService";
import { subscribeProductos, updateProducto } from "../../services/productosService";
import { addMovimiento } from "../../services/movimientosService";
import { restoreCaret, getNewCaret } from "../../utils/caretUtils";
import { getLocalDateString } from "../../utils/dateUtils";
import "./Ventas.css";

function Ventas({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("lista"); // 'lista' | 'esquema'
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Estados de los Modales
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [currentVentaId, setCurrentVentaId] = useState(null);
  
  // Estado de Confirmación de Eliminación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [ventaToDelete, setVentaToDelete] = useState(null);

  // Estados del Formulario
  const initialFormState = {
    clienteId: "",
    metodoPago: "Efectivo",
    estado: "Completada",
    saldoPendiente: 0
  };
  const [formData, setFormData] = useState(initialFormState);
  const [cartItems, setCartItems] = useState([]); // Arreglo de productos a vender: { productoId, producto, cantidad, precioCompra, precioVenta }
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Estados de Notificación / Toast Alerts
  const [toastAlert, setToastAlert] = useState(null);

  // Definición del esquema para visualización
  const schemaDefinition = [
    { name: "id", type: "string", required: "Sí (Autogenerado)", desc: "Identificador único de la venta asignado automáticamente por Firestore." },
    { name: "clienteId", type: "string", required: "Sí", desc: "ID del documento del cliente asociado." },
    { name: "clienteNombre", type: "string", required: "Sí", desc: "Nombre completo del cliente al momento de registrar la venta." },
    { name: "producto", type: "string", required: "Sí", desc: "Nombre del producto vendido (primero de la venta)." },
    { name: "items", type: "array<object>", required: "Sí", desc: "Lista de productos de la venta. Cada elemento: { productoId, producto, cantidad, precioCompra, precioVenta, subtotal }. Permite registrar varios productos en una misma venta." },
    { name: "cantidad", type: "number", required: "Sí", desc: "Cantidad total de artículos vendidos (suma de todos los items)." },
    { name: "precioCompra", type: "number", required: "Sí", desc: "Precio unitario de compra (al costo)." },
    { name: "precioVenta", type: "number", required: "Sí", desc: "Precio al que se vende al cliente." },
    { name: "total", type: "number", required: "Sí", desc: "Total de la transacción (cantidad * precioVenta)." },
    { name: "metodoPago", type: "string", required: "Sí", desc: "Forma de pago de la venta. Valores: 'Efectivo' | 'Tarjeta' | 'Transferencia'." },
    { name: "estado", type: "string", required: "Sí", desc: "Estado de la transacción. Valores: 'Completada' | 'Pendiente'." },
    { name: "saldoPendiente", type: "number", required: "No", desc: "Cantidad de dinero que quedó pendiente de pago (solo si el estado es Pendiente)." },
    { name: "creadoPor", type: "string", required: "Sí", desc: "ID único (uid) del usuario administrador que registró la venta." },
    { name: "registradoPor", type: "string", required: "Sí", desc: "Nombre completo o email del administrador que registró la venta." },
    { name: "fechaCreacion", type: "timestamp / date", required: "Sí", desc: "Marca de tiempo del servidor al momento del registro." },
  ];

  // Resolver el nombre del usuario de forma robusta (prop, auth o localStorage)
  const savedUserData = localStorage.getItem(`userData_${user?.uid}`);
  const userData = savedUserData ? JSON.parse(savedUserData) : null;
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || (userData ? `${userData.nombre || ""} ${userData.apellidos || ""}`.trim() : "") || "Usuario";

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeClientes(
      resolvedDisplayName,
      user.uid,
      (updatedClientes) => {
        // Filtrar clientes para mostrar solo los Activos
        const activeClientes = updatedClientes.filter(c => c.estado === "Activo");
        setClientes(activeClientes);
      },
      (error) => {
        console.error("Error al obtener clientes para el selector de ventas:", error);
      }
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeProductos(
      resolvedDisplayName,
      user.uid,
      (updatedProductos) => {
        // Filtrar productos para mostrar solo los Activos
        const activeProductos = updatedProductos.filter(p => p.estado === "Activo");
        setProductos(activeProductos);
      },
      (error) => {
        console.error("Error al obtener productos para el selector de ventas:", error);
      }
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  // Suscripción en tiempo real a las ventas de Firestore para el usuario activo
  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    const unsubscribe = subscribeVentas(
      resolvedDisplayName,
      user.uid, 
      (updatedVentas) => {
        setVentas(updatedVentas);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error al obtener ventas de Firestore:", error);
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
  const ventaProductNames = (v) => {
    if (v && Array.isArray(v.items) && v.items.length) {
      return v.items.map((it) => it.producto || "").join(" ");
    }
    return v.producto || "";
  };

  const filteredVentas = ventas.filter((v) => {
    const matchesSearch =
      ventaProductNames(v).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.clienteNombre || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesEstado = 
      filterEstado === "todos" || 
      (v.estado || "").toLowerCase() === filterEstado.toLowerCase();

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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    }).format(value);
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
      doc.setTextColor(125, 60, 152); // #7D3C98
      doc.text("AuroInventario — Registro de Ventas", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-CO")}`, 14, 28);
      
      let filterText = "Todas";
      if (searchTerm) {
        filterText = `Búsqueda: "${searchTerm}"`;
      }
      const estadoText = filterEstado === "todos" ? "Todos" : filterEstado.toUpperCase();
      doc.text(`Filtros: ${filterText} | Estado: ${estadoText} | Total: ${filteredVentas.length} registros`, 14, 34);
      
      // Dibujar una línea decorativa
      doc.setDrawColor(235, 222, 240); // #EBDEF0
      doc.setLineWidth(0.5);
      doc.line(14, 38, 282, 38);

      const tableColumns = [
        "Cliente",
        "Producto",
        "Cant.",
        "Precio Compra",
        "Precio Venta",
        "Total Costo",
        "Total Venta",
        "Ganancia",
        "Método de Pago",
        "Estado",
        "Monto Pendiente",
        "Registrado por",
        "Fecha"
      ];

      const tableRows = [];
      filteredVentas.forEach((v) => {
        const ventaItems = Array.isArray(v.items) && v.items.length ? v.items : [v];
        ventaItems.forEach((it) => {
          const qty = Number(it.cantidad) || 0;
          const buy = Number(it.precioCompra) || 0;
          const sell = Number(it.precioVenta) || 0;
          tableRows.push([
            v.clienteNombre || "—",
            it.producto || "",
            qty,
            formatCurrency(buy),
            formatCurrency(sell),
            formatCurrency(qty * buy),
            formatCurrency(qty * sell),
            formatCurrency(Math.max(0, (qty * sell) - (qty * buy))),
            v.metodoPago || "",
            v.estado || "",
            v.estado === "Pendiente" ? formatCurrency(v.saldoPendiente || 0) : "—",
            v.registradoPor || resolvedDisplayName,
            formatDate(v.fechaCreacion)
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

      doc.save(`ventas_${getLocalDateString()}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      triggerToast("error", error.message || "Hubo un error al generar el PDF.");
    }
  };

  const exportToExcel = () => {
    try {
      const headers = [
        "Cliente",
        "Producto",
        "Cant.",
        "Precio Compra",
        "Precio Venta",
        "Total Costo",
        "Total Venta",
        "Ganancia",
        "Método de Pago",
        "Estado",
        "Monto Pendiente",
        "Registrado por",
        "Fecha"
      ];
      
      const rows = [];
      filteredVentas.forEach((v) => {
        const ventaItems = Array.isArray(v.items) && v.items.length ? v.items : [v];
        ventaItems.forEach((it) => {
          const qty = Number(it.cantidad) || 0;
          const buy = Number(it.precioCompra) || 0;
          const sell = Number(it.precioVenta) || 0;
          rows.push([
            v.clienteNombre || "—",
            it.producto || "",
            qty,
            buy,
            sell,
            qty * buy,
            qty * sell,
            Math.max(0, (qty * sell) - (qty * buy)),
            v.metodoPago || "",
            v.estado || "",
            v.estado === "Pendiente" ? Number(v.saldoPendiente) || 0 : 0,
            v.registradoPor || resolvedDisplayName,
            formatDate(v.fechaCreacion)
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
      link.setAttribute("download", `ventas_${getLocalDateString()}.csv`);
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
    let { name, value, type } = e.target;
    const caret = e.target.selectionStart;
    const oldValue = value;

    // Formatear saldo con separadores de miles
    if (name === "saldoPendiente") {
      const numericValue = value.replace(/\D/g, "");
      value = numericValue ? new Intl.NumberFormat("es-CO").format(numericValue) : "";
    }

    // Convertir a mayúsculas los campos de texto
    if (name !== "saldoPendiente") {
      const esTexto = type === "text" || type === "search" || type === "tel" || type === "textarea";
      if (esTexto) value = value.toUpperCase();
    }

    // Mantener la posición del cursor al transformar el valor
    if (value !== oldValue) {
      const newCaret = name === "saldoPendiente"
        ? getNewCaret(oldValue, value, caret)
        : caret;
      restoreCaret(e.target, newCaret);
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

  // ==== LÓGICA DEL CARRITO DE PRODUCTOS ====
  const formatCurrencyInput = (value) => {
    const n = Number(value) || 0;
    return n ? new Intl.NumberFormat("es-CO").format(n) : "";
  };

  const getVentaItems = (venta) => {
    if (venta && Array.isArray(venta.items) && venta.items.length) return venta.items;
    if (!venta) return [];
    return [{
      productoId: venta.productoId || "",
      producto: venta.producto || "",
      cantidad: Number(venta.cantidad) || 1,
      precioCompra: Number(venta.precioCompra) || 0,
      precioVenta: Number(venta.precioVenta) || 0,
    }];
  };

  const ajustarStockProveedor = (product, cantidad, signo) => {
    const stockProveedor = { ...(product.stockProveedor || {}) };
    if (product.proveedorId && stockProveedor[product.proveedorId] !== undefined) {
      stockProveedor[product.proveedorId] = Math.max(0, (Number(stockProveedor[product.proveedorId]) || 0) + signo * cantidad);
    }
    return stockProveedor;
  };

  const addCartItem = () => {
    setCartItems((prev) => [
      ...prev,
      { productoId: "", producto: "", cantidad: 1, precioCompra: 0, precioVenta: 0 }
    ]);
  };

  const handleCartProductChange = (index, productoId) => {
    const selectedProd = productos.find(p => p.id === productoId);
    setCartItems((prev) => prev.map((item, i) =>
      i === index
        ? {
            ...item,
            productoId,
            producto: selectedProd?.nombre || "",
            precioCompra: selectedProd?.precioCompra || 0,
            precioVenta: selectedProd?.precioVenta || 0
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
      if (field === "precioCompra" || field === "precioVenta") {
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
    if (!formData.clienteId) errors.clienteId = "Debe seleccionar un cliente";

    if (cartItems.length === 0) {
      errors.items = "Agregue al menos un producto a la venta";
    }

    cartItems.forEach((item, index) => {
      if (!item.productoId) {
        errors[`item-${index}`] = "Seleccione un producto";
        return;
      }

      const selectedProduct = productos.find(p => p.id === item.productoId);
      if (!selectedProduct) {
        errors[`item-${index}`] = "El producto seleccionado no existe o está inactivo";
        return;
      }

      const cantidadInput = Number(item.cantidad);
      if (!item.cantidad || cantidadInput <= 0) {
        errors[`item-${index}`] = "La cantidad debe ser mayor a 0";
        return;
      }

      let availableStock = selectedProduct.stock || 0;
      if (modalMode === "edit" && currentVentaId) {
        const originalVenta = ventas.find(v => v.id === currentVentaId);
        const originalItems = getVentaItems(originalVenta);
        const originalItem = originalItems.find(o => o.productoId === item.productoId || o.producto === item.producto);
        if (originalItem) {
          availableStock += Number(originalItem.cantidad) || 0;
        }
      }

      if (cantidadInput > availableStock) {
        errors[`item-${index}`] = `La cantidad supera el stock disponible (${availableStock} unidades)`;
        return;
      }

      if (!item.precioVenta || Number(item.precioVenta) <= 0) {
        errors[`item-${index}`] = "El precio a vender debe ser mayor a 0";
      }
    });

    if (formData.estado === "Pendiente") {
      const saldoNumerico = Number(String(formData.saldoPendiente || "0").replace(/\D/g, ""));
      if (saldoNumerico <= 0) {
        errors.saldoPendiente = "El monto pendiente debe ser mayor a cero";
      } else if (saldoNumerico > totalCalculado) {
        errors.saldoPendiente = `El monto pendiente no puede superar el total de la venta (${formatCurrency(totalCalculado)})`;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    if (clientes.length === 0) {
      triggerToast("error", "No puedes registrar ventas sin clientes activos. Registra un cliente primero.");
      return;
    }
    if (productos.length === 0) {
      triggerToast("error", "No puedes registrar ventas sin productos activos. Registra un producto primero.");
      return;
    }
    setFormData({
      ...initialFormState,
      clienteId: clientes[0]?.id || ""
    });
    setCartItems([
      {
        productoId: productos[0]?.id || "",
        producto: productos[0]?.nombre || "",
        cantidad: 1,
        precioCompra: productos[0]?.precioCompra || 0,
        precioVenta: productos[0]?.precioVenta || 0
      }
    ]);
    setFormErrors({});
    setModalMode("create");
    setCurrentVentaId(null);
    setShowModal(true);
  };

  const openEditModal = (venta) => {
    setCartItems(
      getVentaItems(venta).map((it) => ({
        productoId: it.productoId || "",
        producto: it.producto || "",
        cantidad: Number(it.cantidad) || 1,
        precioCompra: Number(it.precioCompra) || 0,
        precioVenta: Number(it.precioVenta) || 0
      }))
    );
    setFormData({
      clienteId: venta.clienteId || "",
      metodoPago: venta.metodoPago || "Efectivo",
      estado: venta.estado || "Completada",
      saldoPendiente: venta.saldoPendiente ? new Intl.NumberFormat("es-CO").format(venta.saldoPendiente) : 0
    });
    setFormErrors({});
    setModalMode("edit");
    setCurrentVentaId(venta.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      // Obtener el nombre del cliente desde el listado local
      const selectedClientObj = clientes.find(c => c.id === formData.clienteId);
      const clienteNombre = selectedClientObj 
        ? `${selectedClientObj.nombres} ${selectedClientObj.apellidos}`.trim()
        : "Cliente Desconocido";

      const items = cartItems.map((it) => ({
        productoId: it.productoId,
        producto: it.producto,
        cantidad: Number(it.cantidad),
        precioCompra: Number(it.precioCompra),
        precioVenta: Number(it.precioVenta)
      }));

      const dataToSave = {
        ...formData,
        clienteNombre,
        items,
        total: totalCalculado,
        saldoPendiente: formData.estado === "Pendiente" ? Number(String(formData.saldoPendiente).replace(/\D/g, "")) : 0
      };

      if (modalMode === "create") {
        const ventaId = await addVenta(dataToSave, user.uid, resolvedDisplayName);

        // Descontar stock de cada producto vendido y registrar movimiento de inventario
        for (const it of items) {
          const selectedProduct = productos.find(p => p.id === it.productoId);
          if (selectedProduct) {
            const newStock = (selectedProduct.stock || 0) - it.cantidad;
            await updateProducto(resolvedDisplayName, selectedProduct.id, {
              stock: newStock,
              stockProveedor: ajustarStockProveedor(selectedProduct, it.cantidad, -1)
            });
          }
          await addMovimiento(
            {
              tipo: "Venta",
              productoId: it.productoId,
              producto: it.producto,
              cantidad: -(Number(it.cantidad) || 0),
              referencia: ventaId
            },
            user.uid,
            resolvedDisplayName
          );
        }

        triggerToast("success", "¡Venta registrada correctamente!");
      } else {
        // En modo edición: devolver stock original y descontar el nuevo
        const originalVenta = ventas.find(v => v.id === currentVentaId);
        await updateVenta(resolvedDisplayName, currentVentaId, dataToSave);

        const originalItems = getVentaItems(originalVenta);
        for (const oi of originalItems) {
          const prod = productos.find(p => p.id === oi.productoId || p.nombre === oi.producto);
          if (prod) {
            await updateProducto(resolvedDisplayName, prod.id, {
              stock: (prod.stock || 0) + (Number(oi.cantidad) || 0),
              stockProveedor: ajustarStockProveedor(prod, Number(oi.cantidad) || 0, 1)
            });
          }
          await addMovimiento(
            {
              tipo: "Venta",
              productoId: oi.productoId,
              producto: oi.producto,
              cantidad: Number(oi.cantidad) || 0,
              referencia: currentVentaId
            },
            user.uid,
            resolvedDisplayName
          );
        }
        for (const it of items) {
          const prod = productos.find(p => p.id === it.productoId);
          if (prod) {
            await updateProducto(resolvedDisplayName, prod.id, {
              stock: (prod.stock || 0) - it.cantidad,
              stockProveedor: ajustarStockProveedor(prod, it.cantidad, -1)
            });
          }
          await addMovimiento(
            {
              tipo: "Venta",
              productoId: it.productoId,
              producto: it.producto,
              cantidad: -(Number(it.cantidad) || 0),
              referencia: currentVentaId
            },
            user.uid,
            resolvedDisplayName
          );
        }

        triggerToast("success", "¡Registro de venta actualizado correctamente!");
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar venta:", error);
      triggerToast("error", error.message || "Error al procesar la solicitud en Firestore.");
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteConfirmation = (venta) => {
    setVentaToDelete(venta);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!ventaToDelete) return;

    try {
      await deleteVenta(resolvedDisplayName, ventaToDelete.id);

      // Devolver stock de todos los productos de la venta y registrar el movimiento de reversión
      const ventaItems = getVentaItems(ventaToDelete);
      for (const it of ventaItems) {
        const prodId = it.productoId || productos.find(p => p.nombre === it.producto)?.id;
        if (prodId) {
          const product = productos.find(p => p.id === prodId);
          if (product) {
            const restoredStock = (product.stock || 0) + (Number(it.cantidad) || 0);
            await updateProducto(resolvedDisplayName, product.id, {
              stock: restoredStock,
              stockProveedor: ajustarStockProveedor(product, Number(it.cantidad) || 0, 1)
            });
          }
        }
        await addMovimiento(
          {
            tipo: "Venta",
            productoId: it.productoId || prodId,
            producto: it.producto,
            cantidad: Number(it.cantidad) || 0,
            referencia: ventaToDelete.id
          },
          user.uid,
          resolvedDisplayName
        );
      }

      triggerToast("success", "¡Registro de venta eliminado correctamente!");
    } catch (error) {
      console.error("Error al eliminar venta:", error);
      triggerToast("error", "No se pudo eliminar el registro de venta.");
    } finally {
      setShowDeleteConfirm(false);
      setVentaToDelete(null);
    }
  };

  const totalVentasCompletas = filteredVentas.reduce((acc, curr) => {
    const total = (curr.total && !isNaN(Number(curr.total))) ? Number(curr.total) : 0;
    const pending = (curr.saldoPendiente && !isNaN(Number(curr.saldoPendiente))) ? Number(curr.saldoPendiente) : 0;
    const received = total - pending;
    return acc + received;
  }, 0);

  const totalGanancias = filteredVentas.reduce((acc, curr) => {
    const total = (curr.total && !isNaN(Number(curr.total))) ? Number(curr.total) : 0;
    const pending = (curr.saldoPendiente && !isNaN(Number(curr.saldoPendiente))) ? Number(curr.saldoPendiente) : 0;
    const received = total - pending;
    const items = getVentaItems(curr);
    const cost = items.reduce((a, it) => a + ((Number(it.cantidad) || 0) * (Number(it.precioCompra) || 0)), 0);
    const profit = Math.max(0, received - cost);
    return acc + (isNaN(profit) ? 0 : profit);
  }, 0);

  const totalCalculado = cartItems.reduce(
    (acc, it) => acc + ((Number(it.cantidad) || 0) * (Number(it.precioVenta) || 0)),
    0
  );

  return (
    <div className="ventas-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="ven-header">
        <div className="ven-header-title">
          <div className="ven-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div>
            <h2 className="ven-title">Gestión de Ventas</h2>
            <p className="ven-subtitle">Registro y control de transacciones comerciales de tus clientes</p>
          </div>
        </div>

        {/* Tab Selector & Add Button */}
        <div className="ven-header-actions">
          <div className="ven-tabs">
            <button 
              className={`ven-tab-btn ${activeTab === "lista" ? "active" : ""}`}
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
              Ventas
            </button>
            <button 
              className={`ven-tab-btn ${activeTab === "esquema" ? "active" : ""}`}
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
                className="ven-export-pdf-btn" 
                onClick={exportToPDF} 
                title="Exportar a PDF"
                disabled={filteredVentas.length === 0}
                style={{ opacity: filteredVentas.length === 0 ? 0.6 : 1, cursor: filteredVentas.length === 0 ? "not-allowed" : "pointer" }}
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
                className="ven-export-excel-btn" 
                onClick={exportToExcel} 
                title="Exportar a Excel"
                disabled={filteredVentas.length === 0}
                style={{ opacity: filteredVentas.length === 0 ? 0.6 : 1, cursor: filteredVentas.length === 0 ? "not-allowed" : "pointer" }}
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
              <button className="ven-add-btn" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nueva Venta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT SECTOR ===== */}
      <div className="ven-content-wrapper">
        {activeTab === "lista" ? (
          <div className="ven-tab-content">
            {/* Tarjetas de estadísticas */}
            <div className="ven-stats-summary" style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
              <div className="ven-stat-card" style={{ flex: 1, padding: "16px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e0e0e0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <span style={{ fontSize: "0.85rem", color: "#7d3c98", fontWeight: "600" }}>TOTAL DE VENTAS</span>
                <h3 style={{ fontSize: "1.6rem", color: "#2c3e50", margin: "8px 0 0 0" }}>{formatCurrency(totalVentasCompletas)}</h3>
              </div>
              <div className="ven-stat-card" style={{ flex: 1, padding: "16px", backgroundColor: "#f4fcf7", borderRadius: "12px", border: "1px solid #d1f2db", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <span style={{ fontSize: "0.85rem", color: "#196f3d", fontWeight: "600" }}>TOTAL GANANCIAS</span>
                <h3 style={{ fontSize: "1.6rem", color: "#196f3d", margin: "8px 0 0 0" }}>{formatCurrency(totalGanancias)}</h3>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="ven-filters-bar">
              <div className="ven-search-box">
                <svg className="ven-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  placeholder="Buscar por cliente o producto..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ven-search-input"
                />
              </div>

              <div className="ven-status-select-wrapper">
                <label>Estado:</label>
                <select 
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="ven-status-select"
                >
                  <option value="todos">Todos</option>
                  <option value="completada">Completada</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
              
              <div className="ven-crud-alert">
                <span className="ven-badge-info">En línea</span>
                <span className="ven-text-success">Firestore Sincronizado</span>
              </div>
            </div>

            {/* Ventas Table or Loading State */}
            <div className="ven-table-container">
              {isLoading ? (
                <div className="ven-loading-overlay">
                  <div className="ven-loading-spinner"></div>
                  <p>Conectando con base de datos de ventas...</p>
                </div>
              ) : filteredVentas.length > 0 ? (
                <table className="ven-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Productos</th>
                      <th>Cant.</th>
                      <th>Total (Costo / Venta)</th>
                      <th>Ganancia</th>
                      <th>Pago</th>
                      <th>Estado</th>
                      <th>Monto Pendiente</th>
                      <th>Registrado por</th>
                      <th>Fecha</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVentas.map((venta) => {
                      const ventaItems = getVentaItems(venta);
                      const ventaQty = ventaItems.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
                      const ventaCost = ventaItems.reduce((a, it) => a + ((Number(it.cantidad) || 0) * (Number(it.precioCompra) || 0)), 0);
                      const ventaReceived = (Number(venta.total) || 0) - (Number(venta.saldoPendiente) || 0);
                      const ventaProfit = Math.max(0, ventaReceived - ventaCost);

                      return (
                      <tr key={venta.id} className="ven-row">
                        <td className="ven-text-bold">{venta.clienteNombre || "—"}</td>
                        <td>
                          {ventaItems.length > 1 ? (
                            <div className="ven-product-list">
                              {ventaItems.map((it, i) => (
                                <div className="ven-product-item" key={i}>
                                  <span className="ven-product-item-name">{it.producto || "—"}</span>
                                  <span className="ven-product-item-qty">x{it.cantidad}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span>{ventaItems[0]?.producto || venta.producto || "—"}</span>
                          )}
                        </td>
                        <td>{ventaQty}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Costo: {formatCurrency(ventaCost)}</span>
                            <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#2E5C8A" }}>Venta: {formatCurrency(ventaReceived)}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: "700", color: "#27ae60" }}>
                          {formatCurrency(isNaN(ventaProfit) ? 0 : ventaProfit)}
                        </td>
                        <td>
                          <span className="ven-doc-badge">{venta.metodoPago}</span>
                        </td>
                        <td>
                          <span 
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 8px",
                              borderRadius: "12px",
                              fontSize: "0.75rem",
                              fontWeight: "600",
                              backgroundColor: venta.estado === "Completada" ? "#e6f4ea" : "#fef3c7",
                              color: venta.estado === "Completada" ? "#137333" : "#d97706"
                            }}
                          >
                            <span 
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                backgroundColor: venta.estado === "Completada" ? "#137333" : "#d97706"
                              }}
                            ></span>
                            {venta.estado}
                          </span>
                        </td>
                        <td style={{ fontWeight: "600", color: venta.estado === "Pendiente" ? "#d97706" : "#64748b" }}>
                          {venta.estado === "Pendiente" ? formatCurrency(venta.saldoPendiente || 0) : "—"}
                        </td>
                        <td className="ven-text-bold" style={{ fontSize: "0.75rem" }}>
                          {venta.registradoPor || resolvedDisplayName}
                        </td>
                        <td className="ven-cell-date">{formatDate(venta.fechaCreacion)}</td>
                        <td>
                          <div className="ven-actions-cell">
                            <button 
                              className="ven-action-btn edit" 
                              onClick={() => openEditModal(venta)}
                              title="Editar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button 
                              className="ven-action-btn delete" 
                              onClick={() => askDeleteConfirmation(venta)}
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
                <div className="ven-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <h3>No hay ventas registradas</h3>
                  <p>Inicia registrando tu primera venta en la base de datos de Firestore.</p>
                  <button className="ven-add-btn" onClick={openCreateModal}>
                    Registrar Venta
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="ven-tab-content">
            {/* Schema Documentation Panel */}
            <div className="ven-schema-panel">
              <div className="ven-schema-info-card">
                <h3>Definición de Atributos — Colección de Ventas</h3>
                <p>El siguiente listado define cada uno de los campos estructurales implementados en el modelo de ventas en Firestore. Garantiza coherencia financiera, integridad transaccional y total trazabilidad de las operaciones registradas por los administradores.</p>
                
                <div className="ven-schema-meta">
                  <div className="ven-meta-item">
                    <strong>Nombre de la Colección:</strong>
                    <code>ventas</code>
                  </div>
                  <div className="ven-meta-item">
                    <strong>Proveedor de BD:</strong>
                    <span>Firebase Firestore (NoSQL Document Database)</span>
                  </div>
                </div>
              </div>

              <div className="ven-schema-grid">
                {schemaDefinition.map((field) => (
                  <div className="ven-schema-card" key={field.name}>
                    <div className="ven-schema-card-header">
                      <h4 className="ven-field-name">{field.name}</h4>
                      <span className={`ven-field-req ${field.required.includes("No") ? "optional" : "required"}`}>
                        {field.required}
                      </span>
                    </div>
                    <div className="ven-schema-card-body">
                      <div className="ven-field-type">
                        <strong>Tipo de dato:</strong>
                        <code>{field.type}</code>
                      </div>
                      <p className="ven-field-desc">{field.desc}</p>
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
        <div className="ven-modal-overlay">
          <div className="ven-modal-container">
            <div className="ven-modal-header">
              <h3>{modalMode === "create" ? "Registrar Nueva Venta" : "Editar Registro de Venta"}</h3>
              <button className="ven-modal-close-btn" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="ven-form">
              <div className="ven-form-grid">
                {/* Cliente */}
                <div className="ven-form-group span-2">
                  <label htmlFor="clienteId">Cliente Asociado<span className="required-mark">*</span></label>
                  <select 
                    id="clienteId" 
                    name="clienteId"
                    value={formData.clienteId}
                    onChange={handleInputChange}
                    className={`ven-select ${formErrors.clienteId ? "error" : ""}`}
                  >
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombres} {c.apellidos} — ({c.tipoDocumento} {c.documento})
                      </option>
                    ))}
                  </select>
                  {formErrors.clienteId && (
                    <span className="ven-field-error">{formErrors.clienteId}</span>
                  )}
                </div>

                {/* Productos (Carrito Multi-Producto) */}
                <div className="ven-form-group span-2">
                  <label>Productos a Vender (Puede agregar varios)<span className="required-mark">*</span></label>
                  {formErrors.items && (
                    <span className="ven-field-error">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      {formErrors.items}
                    </span>
                  )}

                  <div className="ven-cart-box">
                    {cartItems.map((item, index) => {
                      const selectedProduct = productos.find(p => p.id === item.productoId);
                      const stock = selectedProduct?.stock || 0;
                      const subtotal = (Number(item.cantidad) || 0) * (Number(item.precioVenta) || 0);

                      return (
                        <div className="ven-cart-row" key={index}>
                          <div className="ven-cart-col product">
                            <select
                              value={item.productoId}
                              onChange={(e) => handleCartProductChange(index, e.target.value)}
                              className={`ven-select ${formErrors[`item-${index}`] ? "error" : ""}`}
                            >
                              <option value="" disabled>Seleccione un producto...</option>
                              {productos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{p.codigo}] {p.nombre} — (Stock: {p.stock !== undefined ? p.stock : 0})
                                </option>
                              ))}
                            </select>
                            {formErrors[`item-${index}`] && (
                              <span className="ven-field-error">{formErrors[`item-${index}`]}</span>
                            )}
                            {item.productoId && !formErrors[`item-${index}`] && (
                              <span className="ven-stock-info">Stock disponible: <strong>{stock}</strong> unidades.</span>
                            )}
                          </div>

                          <div className="ven-cart-col qty">
                            <label>Cant.</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="1"
                              value={item.cantidad}
                              onChange={(e) => handleCartFieldChange(index, "cantidad", e.target.value)}
                              className={`ven-input ${formErrors[`item-${index}`] ? "error" : ""}`}
                            />
                          </div>

                          <div className="ven-cart-col price">
                            <label>P. Compra</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={formatCurrencyInput(item.precioCompra)}
                              onChange={(e) => handleCartFieldChange(index, "precioCompra", e.target.value)}
                              className="ven-input"
                            />
                          </div>

                          <div className="ven-cart-col price">
                            <label>P. Venta</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ej. 50.000"
                              value={formatCurrencyInput(item.precioVenta)}
                              onChange={(e) => handleCartFieldChange(index, "precioVenta", e.target.value)}
                              className={`ven-input ${formErrors[`item-${index}`] ? "error" : ""}`}
                            />
                          </div>

                          <div className="ven-cart-col subtotal">
                            <label>Subtotal</label>
                            <span className="ven-cart-subtotal">{formatCurrency(subtotal)}</span>
                          </div>

                          <div className="ven-cart-col remove">
                            <button
                              type="button"
                              className="ven-cart-remove-btn"
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

                    <button type="button" className="ven-cart-add-btn" onClick={addCartItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Agregar otro producto
                    </button>
                  </div>
                </div>

                {/* Método Pago */}
                <div className="ven-form-group">
                  <label htmlFor="metodoPago">Método de Pago<span className="required-mark">*</span></label>
                  <select 
                    id="metodoPago" 
                    name="metodoPago"
                    value={formData.metodoPago}
                    onChange={handleInputChange}
                    className="ven-select"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                  </select>
                </div>

                {/* Estado */}
                <div className="ven-form-group">
                  <label htmlFor="estado">Estado de la Venta<span className="required-mark">*</span></label>
                  <select 
                    id="estado" 
                    name="estado"
                    value={formData.estado}
                    onChange={handleInputChange}
                    className="ven-select"
                  >
                    <option value="Completada">Completada</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>

                {/* Monto Pendiente (Solo si es Pendiente) */}
                {formData.estado === "Pendiente" && (
                  <div className="ven-form-group">
                    <label htmlFor="saldoPendiente">Monto Pendiente ($ COP)<span className="required-mark">*</span></label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      id="saldoPendiente"
                      name="saldoPendiente"
                      placeholder="Ej. 10.000"
                      value={formData.saldoPendiente}
                      onChange={handleInputChange}
                      className={`ven-input ${formErrors.saldoPendiente ? "error" : ""}`}
                    />
                    {formErrors.saldoPendiente && (
                      <span className="ven-field-error">{formErrors.saldoPendiente}</span>
                    )}
                  </div>
                )}

                {/* Total (Autocalculado) */}
                <div className="ven-form-group span-2">
                  <label htmlFor="total">Total Transacción (Calculado)</label>
                  <input 
                    type="text" 
                    id="total"
                    name="total"
                    value={formatCurrency(totalCalculado)}
                    disabled
                    className="ven-input"
                  />
                </div>
              </div>

              <div className="ven-modal-footer">
                <button type="button" className="ven-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="ven-btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="ven-loading-spinner" style={{ width: "14px", height: "14px" }}></div>
                      Guardando...
                    </>
                  ) : (
                    "Guardar Venta"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && ventaToDelete && (
        <div className="ven-modal-overlay">
          <div className="ven-modal-container delete-confirm">
            <div className="ven-delete-modal-content">
              <div className="ven-warning-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div className="ven-delete-text">
                <h4>¿Eliminar registro de venta permanentemente?</h4>
                <p>
                  Esta acción eliminará la venta de{" "}
                  <strong>
                    {(() => {
                      const items = getVentaItems(ventaToDelete);
                      return items.length > 1
                        ? `${items.length} productos (${items.map(it => it.producto).join(", ")})`
                        : items[0]?.producto || ventaToDelete.producto || "producto";
                    })()}
                  </strong>{" "}
                  realizada a <strong>{ventaToDelete.clienteNombre}</strong> por{" "}
                  <strong>{formatCurrency(ventaToDelete.total)}</strong> de la base de datos de Firestore. Esta operación no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="ven-modal-footer">
              <button type="button" className="ven-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="ven-btn-danger" onClick={handleConfirmDelete}>
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTIFICATION ALERTS ===== */}
      {toastAlert && (
        <div className={`ven-alert-toast ${toastAlert.type}`}>
          <span>{toastAlert.message}</span>
          <button className="ven-toast-close" onClick={() => setToastAlert(null)}>
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

export default Ventas;
