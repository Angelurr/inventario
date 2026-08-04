import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { subscribeVentas } from "../../services/ventasService";
import "./Reportes.css";

function Reportes({ currentUserDisplayName }) {
  const { user } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState("mes"); // "hoy" | "ayer" | "semana" | "mes" | "todo" | "customMonth"
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarYear, setSelectedCalendarYear] = useState(new Date().getFullYear());

  // Resolved Display Name to dynamically connect to the user's isolated Firestore collection
  const resolvedDisplayName = currentUserDisplayName || user?.displayName || "usuario";

  // Subscripción en tiempo real a las ventas del usuario
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const unsubscribe = subscribeVentas(
      resolvedDisplayName,
      user.uid,
      (data) => {
        setVentas(data);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error al suscribirse a reportes:", error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user, resolvedDisplayName]);

  // Helper para formatear monedas en pesos colombianos (COP)
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatCalendarCurrency = (value) => {
    return `$${Number(value).toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Helper para formatear fechas
  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const getSaleDate = (v) => {
    if (!v.fechaCreacion) return new Date();
    if (v.fechaCreacion.seconds) return new Date(v.fechaCreacion.seconds * 1000);
    if (v.fechaCreacion instanceof Date) return v.fechaCreacion;
    return new Date(v.fechaCreacion);
  };

  // Filtrar ventas por período
  const getFilteredVentas = () => {
    const now = new Date();
    const todayStr = now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    return ventas.filter((v) => {
      const saleDate = getSaleDate(v);
      const saleDateStr = saleDate.toDateString();

      if (filterPeriod === "hoy") {
        return saleDateStr === todayStr;
      }
      if (filterPeriod === "ayer") {
        return saleDateStr === yesterdayStr;
      }
      if (filterPeriod === "semana") {
        const diffTime = Math.abs(now - saleDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      if (filterPeriod === "mes") {
        return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
      }
      if (filterPeriod === "customMonth") {
        return saleDate.getMonth() === selectedCalendarMonth && saleDate.getFullYear() === selectedCalendarYear;
      }
      return true; // "todo"
    });
  };

  const filteredVentas = getFilteredVentas();

  // Calcular métricas principales del período filtrado
  const totalTransacciones = filteredVentas.length;

  const totalVendido = filteredVentas.reduce((acc, curr) => {
    const total = Number(curr.total) || 0;
    const pending = Number(curr.saldoPendiente) || 0;
    return acc + (total - pending);
  }, 0);

  const totalGanancias = filteredVentas.reduce((acc, curr) => {
    const total = Number(curr.total) || 0;
    const pending = Number(curr.saldoPendiente) || 0;
    const qty = Number(curr.cantidad) || 0;
    const buyPrice = Number(curr.precioCompra) || 0;
    const cost = qty * buyPrice;
    const received = total - pending;
    const profit = Math.max(0, received - cost);
    return acc + profit;
  }, 0);

  const totalProductosVendidos = filteredVentas.reduce((acc, curr) => {
    return acc + (Number(curr.cantidad) || 0);
  }, 0);

  const clientesAtendidos = new Set(
    filteredVentas.map((v) => v.clienteId || v.clienteNombre).filter(Boolean)
  ).size;

  const ticketPromedio = totalTransacciones > 0 ? totalVendido / totalTransacciones : 0;

  // Calcular totales históricos acumulados
  const allTimeRevenue = ventas.reduce((acc, curr) => {
    const total = Number(curr.total) || 0;
    const pending = Number(curr.saldoPendiente) || 0;
    return acc + (total - pending);
  }, 0);

  const allTimeProfit = ventas.reduce((acc, curr) => {
    const total = Number(curr.total) || 0;
    const pending = Number(curr.saldoPendiente) || 0;
    const qty = Number(curr.cantidad) || 0;
    const buyPrice = Number(curr.precioCompra) || 0;
    const cost = qty * buyPrice;
    const received = total - pending;
    const profit = Math.max(0, received - cost);
    return acc + profit;
  }, 0);

  // Calcular ranking de productos del período filtrado
  const productGroup = {};
  filteredVentas.forEach((v) => {
    const prodName = v.producto || "Desconocido";
    const qty = Number(v.cantidad) || 0;
    const total = Number(v.total) || 0;
    const pending = Number(v.saldoPendiente) || 0;
    const received = total - pending;

    if (!productGroup[prodName]) {
      productGroup[prodName] = {
        name: prodName,
        cantidad: 0,
        ingresos: 0,
      };
    }
    productGroup[prodName].cantidad += qty;
    productGroup[prodName].ingresos += received;
  });
  const rankedProducts = Object.values(productGroup).sort((a, b) => b.cantidad - a.cantidad);
  const topProduct = rankedProducts[0] || { name: "Ninguno", cantidad: 0, ingresos: 0 };

  // Calcular ranking de clientes del período filtrado
  const clientGroup = {};
  filteredVentas.forEach((v) => {
    const clientName = v.clienteNombre || "Cliente General";
    const total = Number(v.total) || 0;
    const pending = Number(v.saldoPendiente) || 0;
    const received = total - pending;

    if (!clientGroup[clientName]) {
      clientGroup[clientName] = {
        name: clientName,
        compras: 0,
        gastado: 0,
      };
    }
    clientGroup[clientName].compras += 1;
    clientGroup[clientName].gastado += received;
  });
  const rankedClients = Object.values(clientGroup).sort((a, b) => b.gastado - a.gastado);
  const topClient = rankedClients[0] || { name: "Ninguno", compras: 0, gastado: 0 };

  // Obtener estadísticas de un mes específico para pintar en el calendario de meses
  const getMonthStatsForCalendar = (monthIdx, yearVal) => {
    let count = 0;
    let totalVendido = 0;
    let totalGanado = 0;
    ventas.forEach((v) => {
      const d = getSaleDate(v);
      if (d.getMonth() === monthIdx && d.getFullYear() === yearVal) {
        count += 1;
        const total = Number(v.total) || 0;
        const pending = Number(v.saldoPendiente) || 0;
        const qty = Number(v.cantidad) || 0;
        const buyPrice = Number(v.precioCompra) || 0;
        const cost = qty * buyPrice;
        const received = total - pending;
        const profit = Math.max(0, received - cost);

        totalVendido += received;
        totalGanado += profit;
      }
    });
    return { count, totalVendido, totalGanado };
  };

  const handleMonthClick = (monthIdx) => {
    setFilterPeriod("customMonth");
    setSelectedCalendarMonth(monthIdx);
  };

  // Resumen de Ventas mensual (historial completo agrupado)
  const getMonthlyStats = () => {
    const monthsMap = {};
    ventas.forEach((v) => {
      const date = getSaleDate(v);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      const monthKey = `${year}-${String(monthIndex).padStart(2, "0")}`;
      const monthLabel = `${monthNames[monthIndex]} ${year}`;

      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = {
          key: monthKey,
          label: monthLabel,
          count: 0,
          totalVendido: 0,
          totalGanado: 0
        };
      }

      const total = Number(v.total) || 0;
      const pending = Number(v.saldoPendiente) || 0;
      const qty = Number(v.cantidad) || 0;
      const buyPrice = Number(v.precioCompra) || 0;
      const cost = qty * buyPrice;
      const received = total - pending;
      const profit = Math.max(0, received - cost);

      monthsMap[monthKey].count += 1;
      monthsMap[monthKey].totalVendido += received;
      monthsMap[monthKey].totalGanado += profit;
    });

    return Object.values(monthsMap).sort((a, b) => b.key.localeCompare(a.key));
  };

  const monthlyStats = getMonthlyStats();

  // Buscar el valor máximo mensual de ventas para dimensionar el gráfico de barras CSS
  const maxMonthlySales = Math.max(...monthlyStats.map((m) => m.totalVendido), 1);

  // Exportar a Excel (CSV del resumen mensual)
  const exportExcelResumenMensual = () => {
    try {
      const headers = ["Mes", "Transacciones", "Total Vendido (Ingresos)", "Ganancias Generadas"];
      const rows = monthlyStats.map((m) => [
        m.label,
        m.count,
        m.totalVendido,
        m.totalGanado
      ]);

      const csvContent = "\uFEFF" + [
        headers.join(";"),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `resumen_mensual_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error al exportar Excel de reportes:", error);
    }
  };

  // Exportar PDF de las métricas actuales
  const exportPDFReporte = async () => {
    try {
      let jsPDFClass = window.jspdf?.jsPDF;
      if (!jsPDFClass) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          script.onload = () => {
            const autoTableScript = document.createElement("script");
            autoTableScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
            autoTableScript.onload = resolve;
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

      const doc = new jsPDFClass("portrait");

      // Título
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(46, 92, 138); // #2E5C8A
      doc.text("SessionApp — Reporte Métricas Comerciales", 14, 20);

      // Detalles
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha del Reporte: ${new Date().toLocaleString("es-CO")}`, 14, 28);

      const periodLabels = {
        hoy: "Hoy",
        ayer: "Ayer",
        semana: "Últimos 7 Días",
        mes: "Este Mes",
        todo: "Historial Completo"
      };
      doc.text(`Período de Métricas: ${periodLabels[filterPeriod]} | Registrado por: ${resolvedDisplayName}`, 14, 34);

      // Línea divisoria
      doc.setDrawColor(212, 227, 245);
      doc.setLineWidth(0.5);
      doc.line(14, 38, 196, 38);

      // Escribir Métricas
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(46, 92, 138);
      doc.text("Métricas Resumen del Período", 14, 46);

      const metricsTableColumns = ["Métrica", "Valor"];
      const metricsTableRows = [
        ["Total Ventas Realizadas (Transacciones)", String(totalTransacciones)],
        ["Total Vendido (Ingresos Reales)", formatCurrency(totalVendido)],
        ["Ganancias Netas del Período", formatCurrency(totalGanancias)],
        ["Productos Vendidos (Unidades)", String(totalProductosVendidos)],
        ["Clientes Únicos Atendidos", String(clientesAtendidos)],
        ["Ticket Promedio Cobrado", formatCurrency(ticketPromedio)],
        ["Producto Estrella / Más Vendido", topProduct.name !== "Ninguno" ? `${topProduct.name} (${topProduct.cantidad} uds)` : "—"],
        ["Cliente Principal (Mayor Consumo)", topClient.name !== "Ninguno" ? `${topClient.name} (${formatCurrency(topClient.gastado)})` : "—"]
      ];

      doc.autoTable({
        head: [metricsTableColumns],
        body: metricsTableRows,
        startY: 50,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: "normal", cellWidth: 100 },
          1: { fontStyle: "bold", halign: "right" }
        }
      });

      // Escribir Historial Mensual
      const nextY = doc.lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(46, 92, 138);
      doc.text("Resumen de Ventas por Meses", 14, nextY);

      const monthlyColumns = ["Mes", "Transacciones", "Total Vendido (Cobrado)", "Ganancias Generadas"];
      const monthlyRows = monthlyStats.map(m => [
        m.label,
        String(m.count),
        formatCurrency(m.totalVendido),
        formatCurrency(m.totalGanado)
      ]);

      doc.autoTable({
        head: [monthlyColumns],
        body: monthlyRows,
        startY: nextY + 4,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [46, 92, 138], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 253] }
      });

      // Escribir Detalle de Ventas del Período ("Qué se vendió")
      const nextY2 = doc.lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(46, 92, 138);
      doc.text("Detalle de Ventas del Período (¿Qué se vendió?)", 14, nextY2);

      const transColumns = ["Fecha", "Cliente", "Producto", "Cant.", "Total", "Utilidad", "Pago", "Estado"];
      const transRows = filteredVentas.map(v => {
        const total = Number(v.total) || 0;
        const pending = Number(v.saldoPendiente) || 0;
        const qty = Number(v.cantidad) || 0;
        const buyPrice = Number(v.precioCompra) || 0;
        const cost = qty * buyPrice;
        const received = total - pending;
        const profit = Math.max(0, received - cost);

        return [
          formatDate(v.fechaCreacion),
          v.clienteNombre || "Cliente General",
          v.producto || "—",
          String(qty),
          formatCurrency(received),
          formatCurrency(profit),
          v.metodoPago || "—",
          v.estado || "—"
        ];
      });

      doc.autoTable({
        head: [transColumns],
        body: transRows,
        startY: nextY2 + 4,
        theme: "striped",
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [46, 92, 138], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 253] }
      });

      doc.save(`reporte_comercial_${filterPeriod}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
    }
  };

  return (
    <div className="reportes-container">
      {/* ===== HEADER SECTOR ===== */}
      <div className="rep-header">
        <div className="rep-header-title">
          <div className="rep-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <div>
            <h2 className="rep-title">Módulo de Reportes</h2>
            <p className="rep-subtitle">Análisis de ingresos, margen de ganancias y transacciones comerciales</p>
          </div>
        </div>

        <div className="rep-header-actions">
          <button
            className="rep-export-pdf-btn"
            onClick={exportPDFReporte}
            title="Exportar Reporte a PDF"
            disabled={ventas.length === 0}
            style={{ opacity: ventas.length === 0 ? 0.6 : 1, cursor: ventas.length === 0 ? "not-allowed" : "pointer" }}
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
        </div>
      </div>

      {/* ===== CONTENIDO PRINCIPAL ===== */}
      {isLoading ? (
        <div className="rep-loading-card">
          <div className="rep-spinner"></div>
          <p>Cargando información y calculando métricas...</p>
        </div>
      ) : (
        <div className="rep-content">
          {/* Fila de Filtros y Controladores */}
          <div className="rep-filters-bar">
            <div className="rep-filters-title">Período de Análisis:</div>
            <div className="rep-period-selector">
              <button
                className={`rep-period-btn ${filterPeriod === "hoy" ? "active" : ""}`}
                onClick={() => setFilterPeriod("hoy")}
              >
                Hoy
              </button>
              <button
                className={`rep-period-btn ${filterPeriod === "ayer" ? "active" : ""}`}
                onClick={() => setFilterPeriod("ayer")}
              >
                Ayer
              </button>
              <button
                className={`rep-period-btn ${filterPeriod === "semana" ? "active" : ""}`}
                onClick={() => setFilterPeriod("semana")}
              >
                7 Días
              </button>
              <button
                className={`rep-period-btn ${filterPeriod === "mes" ? "active" : ""}`}
                onClick={() => setFilterPeriod("mes")}
              >
                Este Mes
              </button>
              <button
                className={`rep-period-btn ${filterPeriod === "todo" ? "active" : ""}`}
                onClick={() => setFilterPeriod("todo")}
              >
                Historial
              </button>
            </div>
            {filterPeriod === "customMonth" && (
              <div className="rep-selected-month-badge">
                Filtro: {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][selectedCalendarMonth]} de {selectedCalendarYear}
              </div>
            )}
          </div>

          {/* ===== CALENDARIO DE LOS MESES ===== */}
          <div className="rep-calendar-card-modern">
            <div className="rep-calendar-header-modern">
              <div className="rep-calendar-title-modern">
                <span className="rep-calendar-icon-modern">📅</span>
                <h2 className="rep-calendar-main-title-modern">Resumen por Meses</h2>
              </div>
            </div>
            <div className="rep-calendar-title-underline-modern"></div>

            <div className="rep-calendar-year-selector-modern">
              <span className="rep-calendar-year-label-modern">Año:</span>
              <select
                value={selectedCalendarYear}
                onChange={(e) => setSelectedCalendarYear(Number(e.target.value))}
                className="rep-calendar-year-select-modern"
              >
                {[2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="rep-calendar-grid-modern">
              {[
                "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
                "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
              ].map((monthName, idx) => {
                const stats = getMonthStatsForCalendar(idx, selectedCalendarYear);
                const isSelected =
                  (filterPeriod === "customMonth" && selectedCalendarMonth === idx) ||
                  (filterPeriod === "mes" && idx === new Date().getMonth() && selectedCalendarYear === new Date().getFullYear());

                return (
                  <div
                    key={idx}
                    className={`rep-calendar-month-cell-modern ${isSelected ? "active" : ""}`}
                    onClick={() => handleMonthClick(idx)}
                  >
                    <div className="rep-month-head-modern">
                      <span className="rep-month-name-modern">{monthName}</span>
                      {isSelected && <span className="rep-month-active-dot-modern">✓</span>}
                    </div>
                    <div className="rep-month-body-modern">
                      <div className="rep-month-stat-modern">
                        <span className="rep-month-stat-label-modern">Ventas</span>
                        <span className="rep-month-stat-value-modern sales">{formatCalendarCurrency(stats.totalVendido)}</span>
                      </div>
                      <div className="rep-month-stat-modern">
                        <span className="rep-month-stat-label-modern">Ganancia</span>
                        <span className="rep-month-stat-value-modern earnings">{formatCalendarCurrency(stats.totalGanado)}</span>
                      </div>
                    </div>
                    <div className="rep-month-footer-modern">
                      <span className="rep-month-count-modern">{stats.count}</span>
                      {stats.count === 1 ? " transacción" : " transacciones"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fila de Tarjetas de Métricas */}
          <div className="rep-metrics-grid">
            <div className="rep-metric-card font-blue">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Transacciones</span>
                <h3 className="rep-card-value">{totalTransacciones}</h3>
                <span className="rep-card-trend">Facturas Registradas</span>
              </div>
            </div>

            <div className="rep-metric-card font-emerald">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Total Vendido (Ingresos)</span>
                <h3 className="rep-card-value">{formatCurrency(totalVendido)}</h3>
                <span className="rep-card-trend">Efectivo Recibido</span>
              </div>
            </div>

            <div className="rep-metric-card font-green">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Ganancia Neta Real</span>
                <h3 className="rep-card-value">{formatCurrency(totalGanancias)}</h3>
                <span className="rep-card-trend">Beneficio de Abonos</span>
              </div>
            </div>

            <div className="rep-metric-card font-purple">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Productos Vendidos</span>
                <h3 className="rep-card-value">{totalProductosVendidos}</h3>
                <span className="rep-card-trend">Unidades Totales</span>
              </div>
            </div>

            <div className="rep-metric-card font-orange">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Clientes Atendidos</span>
                <h3 className="rep-card-value">{clientesAtendidos}</h3>
                <span className="rep-card-trend">Clientes Distintos</span>
              </div>
            </div>

            <div className="rep-metric-card font-teal">
              <div className="rep-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
              </div>
              <div className="rep-card-info">
                <span className="rep-card-label">Ticket Promedio</span>
                <h3 className="rep-card-value">{formatCurrency(ticketPromedio)}</h3>
                <span className="rep-card-trend">Promedio por Transacción</span>
              </div>
            </div>
          </div>

          {/* ===== SECCIÓN DE ACUMULADOS HISTÓRICOS Y RANKINGS ===== */}
          <div className="rep-historic-rankings-section">
            <div className="rep-historic-totals-card">
              <h3 className="rep-section-title">Totales Históricos Acumulados</h3>
              <div className="rep-metrics-grid historic-grid">
                <div className="rep-metric-card font-blue compact">
                  <div className="rep-card-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                  </div>
                  <div className="rep-card-info">
                    <span className="rep-card-label">Transacciones Totales</span>
                    <h4 className="rep-card-value">{ventas.length}</h4>
                    <span className="rep-card-trend">Facturas totales</span>
                  </div>
                </div>

                <div className="rep-metric-card font-emerald compact">
                  <div className="rep-card-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                  </div>
                  <div className="rep-card-info">
                    <span className="rep-card-label">Ingresos Totales</span>
                    <h4 className="rep-card-value">{formatCurrency(allTimeRevenue)}</h4>
                    <span className="rep-card-trend">Recaudado histórico</span>
                  </div>
                </div>

                <div className="rep-metric-card font-green compact">
                  <div className="rep-card-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                  </div>
                  <div className="rep-card-info">
                    <span className="rep-card-label">Ganancias Totales</span>
                    <h4 className="rep-card-value">{formatCurrency(allTimeProfit)}</h4>
                    <span className="rep-card-trend">Utilidad neta histórica</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rep-rankings-grid">
              {/* Ranking de Productos */}
              <div className="rep-ranking-card">
                <h3 className="rep-ranking-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                  Productos Más Vendidos ({filterPeriod === 'todo' ? 'Histórico' : 'Período'})
                </h3>
                {rankedProducts.length > 0 ? (
                  <div className="rep-ranking-list">
                    {rankedProducts.slice(0, 5).map((prod, index) => (
                      <div className="rep-ranking-item" key={prod.name}>
                        <div className="rep-ranking-rank">{index + 1}</div>
                        <div className="rep-ranking-details">
                          <span className="rep-ranking-name">{prod.name}</span>
                          <span className="rep-ranking-sub">{prod.cantidad} unidades vendidas</span>
                        </div>
                        <div className="rep-ranking-val">{formatCurrency(prod.ingresos)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rep-ranking-empty">No hay datos en este período</div>
                )}
              </div>

              {/* Ranking de Clientes */}
              <div className="rep-ranking-card">
                <h3 className="rep-ranking-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  Clientes de Mayor Consumo ({filterPeriod === 'todo' ? 'Histórico' : 'Período'})
                </h3>
                {rankedClients.length > 0 ? (
                  <div className="rep-ranking-list">
                    {rankedClients.slice(0, 5).map((client, index) => (
                      <div className="rep-ranking-item" key={client.name}>
                        <div className="rep-ranking-rank">{index + 1}</div>
                        <div className="rep-ranking-details">
                          <span className="rep-ranking-name">{client.name}</span>
                          <span className="rep-ranking-sub">{client.compras} compras</span>
                        </div>
                        <div className="rep-ranking-val">{formatCurrency(client.gastado)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rep-ranking-empty">No hay datos en este período</div>
                )}
              </div>
            </div>
          </div>

          {/* Gráfico de Barras Custom CSS */}
          {monthlyStats.length > 0 && (
            <div className="rep-chart-card">
              <h3 className="rep-chart-title">Evolución Histórica de Ventas vs Ganancias por Mes</h3>
              <div className="rep-chart-scroller">
                <div className="rep-chart-axis-y">
                  <span>{formatCurrency(maxMonthlySales)}</span>
                  <span>{formatCurrency(maxMonthlySales / 2)}</span>
                  <span>$ 0</span>
                </div>
                <div className="rep-chart-bars-container">
                  {monthlyStats.slice(0, 6).reverse().map((month) => (
                    <div className="rep-chart-bar-wrapper" key={month.key}>
                      <div className="rep-chart-bar-container">
                        {/* Barra de Ventas */}
                        <div
                          className="rep-chart-bar-sales"
                          style={{ height: `${(month.totalVendido / maxMonthlySales) * 100}%` }}
                          title={`Ventas: ${formatCurrency(month.totalVendido)}`}
                        >
                          {month.totalVendido > 0 && (
                            <span className="rep-bar-tooltip">{formatCurrency(month.totalVendido)}</span>
                          )}
                        </div>
                        {/* Barra de Ganancias */}
                        <div
                          className="rep-chart-bar-earnings"
                          style={{ height: `${(month.totalGanado / maxMonthlySales) * 100}%` }}
                          title={`Ganancias: ${formatCurrency(month.totalGanado)}`}
                        >
                          {month.totalGanado > 0 && (
                            <span className="rep-bar-tooltip">{formatCurrency(month.totalGanado)}</span>
                          )}
                        </div>
                      </div>
                      <span className="rep-chart-bar-label">{month.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rep-chart-legend">
                <div className="rep-legend-item">
                  <span className="rep-legend-dot sales"></span>
                  Vendido (Ingreso Real)
                </div>
                <div className="rep-legend-item">
                  <span className="rep-legend-dot earnings"></span>
                  Ganancia Neta Real
                </div>
              </div>
            </div>
          )}

          {/* Tabla de Detalle de Ventas del Período */}
          <div className="rep-table-section">
            <div className="rep-table-header-row">
              <div>
                <h3 className="rep-table-title">Detalle de Ventas del Período (¿Qué se vendió?)</h3>
                <p className="rep-table-subtitle" style={{ fontSize: "0.8rem", color: "#7A9AC7", margin: "4px 0 0 0" }}>
                  Listado individual de productos y servicios facturados en el período seleccionado
                </p>
              </div>
            </div>

            <div className="rep-table-container">
              {filteredVentas.length > 0 ? (
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Total Cobrado</th>
                      <th>Ganancia Margen</th>
                      <th>Pago</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVentas.map((v) => {
                      const total = Number(v.total) || 0;
                      const pending = Number(v.saldoPendiente) || 0;
                      const qty = Number(v.cantidad) || 0;
                      const buyPrice = Number(v.precioCompra) || 0;
                      const cost = qty * buyPrice;
                      const received = total - pending;
                      const profit = Math.max(0, received - cost);

                      return (
                        <tr className="rep-row" key={v.id}>
                          <td>{formatDate(v.fechaCreacion)}</td>
                          <td className="rep-text-bold">{v.clienteNombre || "Cliente General"}</td>
                          <td>{v.producto || "—"}</td>
                          <td>{qty}</td>
                          <td className="rep-val-sales">{formatCurrency(received)}</td>
                          <td className="rep-val-earnings">{formatCurrency(profit)}</td>
                          <td>
                            <span className={`rep-badge payment ${v.metodoPago?.toLowerCase() || ""}`}>
                              {v.metodoPago || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={`rep-badge status ${v.estado?.toLowerCase() || ""}`}>
                              {v.estado || "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="rep-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  <h3>No hay transacciones registradas</h3>
                  <p>Registra ventas para comenzar a visualizar el detalle en este período.</p>
                </div>
              )}
            </div>
          </div>

          {/* Tabla de Resumen por Meses */}
          <div className="rep-table-section">
            <div className="rep-table-header-row">
              <h3 className="rep-table-title">Resumen de Ventas Agrupado por Meses</h3>
              <button
                className="rep-export-excel-btn"
                onClick={exportExcelResumenMensual}
                disabled={monthlyStats.length === 0}
                style={{ opacity: monthlyStats.length === 0 ? 0.6 : 1, cursor: monthlyStats.length === 0 ? "not-allowed" : "pointer" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
                Exportar Resumen a Excel
              </button>
            </div>

            <div className="rep-table-container">
              {monthlyStats.length > 0 ? (
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Transacciones Generadas</th>
                      <th>Total Ventas Generadas (Ingresos)</th>
                      <th>Ganancias Generadas (Beneficio)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.map((month) => (
                      <tr className="rep-row" key={month.key}>
                        <td className="rep-text-bold">{month.label}</td>
                        <td>{month.count}</td>
                        <td className="rep-val-sales">{formatCurrency(month.totalVendido)}</td>
                        <td className="rep-val-earnings">{formatCurrency(month.totalGanado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="rep-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  <h3>No hay transacciones registradas</h3>
                  <p>Registra ventas para comenzar a agrupar tu historial por meses y generar métricas.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reportes;
