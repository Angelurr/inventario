import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
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

    callback(clientes => {});
    callback(ventas);
  }, (error) => {
    console.error("Error en suscripción de ventas:", error);
    if (onError) onError(error);
  });
};

/**
 * Agrega una nueva venta a Firestore.
 */
export const addVenta = async (ventaData, userId, userDisplayName) => {
  try {
    const nuevaVenta = {
      ...ventaData,
      cantidad: Number(ventaData.cantidad),
      precioCompra: Number(ventaData.precioCompra || 0),
      precioVenta: Number(ventaData.precioVenta || 0),
      total: Number(ventaData.cantidad) * Number(ventaData.precioVenta || 0),
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
    
    // Si cambiaron cantidad, precioVenta o precioCompra, los convertimos a números y recalculamos el total
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
