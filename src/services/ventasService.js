import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Venta
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} clienteId - ID único del cliente asociado.
 * @property {string} clienteNombre - Nombre completo del cliente para visualización.
 * @property {string} producto - Nombre o descripción del producto/concepto.
 * @property {number} cantidad - Cantidad vendida.
 * @property {number} precioUnitario - Precio unitario del producto/concepto.
 * @property {number} total - Total de la venta (cantidad * precioUnitario).
 * @property {string} metodoPago - Método de pago ('Efectivo' | 'Tarjeta' | 'Transferencia').
 * @property {string} estado - Estado de la venta ('Completada' | 'Pendiente' | 'Cancelada').
 * @property {string} creadoPor - ID de usuario del creador (uid).
 * @property {string} registradoPor - Nombre del usuario que registró la venta.
 * @property {import("firebase/firestore").Timestamp | Date} fechaCreacion - Fecha de registro.
 */

// Función helper para obtener el nombre de la colección dinámicamente
const getCollectionName = (userDisplayName) => {
  const name = userDisplayName || "usuario";
  const sanitized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .trim();
  return `ventas_${sanitized}`;
};

/**
 * Suscribe a los cambios en tiempo real de la colección de ventas de un usuario.
 */
export const subscribeVentas = (userDisplayName, userId, callback, onError) => {
  const ventasRef = collection(db, getCollectionName(userDisplayName));
  const q = query(
    ventasRef,
    where("creadoPor", "==", userId)
  );

  return onSnapshot(q, (querySnapshot) => {
    const ventas = [];
    querySnapshot.forEach((docSnap) => {
      ventas.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Ordenar del más nuevo al más antiguo en el lado del cliente (evita index compuesto)
    ventas.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    callback(ventas);
  }, (error) => {
    console.error("Error en suscripción de ventas:", error);
    if (onError) onError(error);
  });
};

/**
 * Agrega una nueva venta a Firestore.
 * Soporta ventas con múltiples productos mediante el campo `items`
 * (arreglo de { productoId, producto, cantidad, precioCompra, precioVenta }).
 */
export const addVenta = async (ventaData, userId, userDisplayName) => {
  try {
    const items = Array.isArray(ventaData.items) && ventaData.items.length > 0
      ? ventaData.items.map((it) => ({
          productoId: it.productoId || "",
          producto: it.producto || "",
          cantidad: Number(it.cantidad) || 0,
          precioCompra: Number(it.precioCompra || 0),
          precioVenta: Number(it.precioVenta || 0),
          subtotal: (Number(it.cantidad) || 0) * (Number(it.precioVenta) || 0),
        }))
      : [{
          productoId: ventaData.productoId || "",
          producto: ventaData.producto || "",
          cantidad: Number(ventaData.cantidad) || 0,
          precioCompra: Number(ventaData.precioCompra || 0),
          precioVenta: Number(ventaData.precioVenta || 0),
          subtotal: (Number(ventaData.cantidad) || 0) * (Number(ventaData.precioVenta) || 0),
        }];

    const totalQty = items.reduce((acc, it) => acc + it.cantidad, 0);
    const total = items.reduce((acc, it) => acc + it.subtotal, 0);
    const totalCost = items.reduce((acc, it) => acc + (it.cantidad * it.precioCompra), 0);

    const nuevaVenta = {
      ...ventaData,
      items,
      producto: ventaData.producto || items[0]?.producto || "",
      cantidad: totalQty,
      precioCompra: totalQty > 0 ? totalCost / totalQty : 0,
      precioVenta: totalQty > 0 ? total / totalQty : 0,
      total,
      creadoPor: userId,
      registradoPor: userDisplayName || "Usuario",
      fechaCreacion: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, getCollectionName(userDisplayName)), nuevaVenta);
    return docRef.id;
  } catch (error) {
    console.error("Error al agregar venta en Firestore:", error);
    throw error;
  }
};

/**
 * Actualiza los datos de una venta existente.
 */
export const updateVenta = async (userDisplayName, id, updatedData) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    const dataToSave = { ...updatedData };

    if (Array.isArray(dataToSave.items) && dataToSave.items.length > 0) {
      dataToSave.items = dataToSave.items.map((it) => ({
        productoId: it.productoId || "",
        producto: it.producto || "",
        cantidad: Number(it.cantidad) || 0,
        precioCompra: Number(it.precioCompra || 0),
        precioVenta: Number(it.precioVenta || 0),
        subtotal: (Number(it.cantidad) || 0) * (Number(it.precioVenta) || 0),
      }));

      const totalQty = dataToSave.items.reduce((acc, it) => acc + it.cantidad, 0);
      const totalCost = dataToSave.items.reduce((acc, it) => acc + (it.cantidad * it.precioCompra), 0);
      dataToSave.cantidad = totalQty;
      dataToSave.total = dataToSave.items.reduce((acc, it) => acc + it.subtotal, 0);
      dataToSave.precioCompra = totalQty > 0 ? totalCost / totalQty : 0;
      dataToSave.precioVenta = totalQty > 0 ? dataToSave.total / totalQty : 0;
      dataToSave.producto = dataToSave.items[0]?.producto || "";
    } else if (dataToSave.cantidad !== undefined || dataToSave.precioVenta !== undefined) {
      // Compatibilidad con ventas antiguas de un solo producto
      if (dataToSave.cantidad !== undefined) {
        dataToSave.cantidad = Number(dataToSave.cantidad);
      }
      if (dataToSave.precioCompra !== undefined) {
        dataToSave.precioCompra = Number(dataToSave.precioCompra);
      }
      if (dataToSave.precioVenta !== undefined) {
        dataToSave.precioVenta = Number(dataToSave.precioVenta);
      }

      if (dataToSave.cantidad !== undefined || dataToSave.precioVenta !== undefined) {
        const q = dataToSave.cantidad !== undefined ? dataToSave.cantidad : 0;
        const p = dataToSave.precioVenta !== undefined ? dataToSave.precioVenta : 0;
        dataToSave.total = q * p;
      }
    }

    await updateDoc(docRef, dataToSave);
  } catch (error) {
    console.error("Error al actualizar venta en Firestore:", error);
    throw error;
  }
};

/**
 * Elimina una venta por su ID.
 */
export const deleteVenta = async (userDisplayName, id) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error al eliminar venta de Firestore:", error);
    throw error;
  }
};
