import { collection, addDoc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Movimiento
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} tipo - Tipo de movimiento ('Compra' | 'Venta' | 'Ajuste').
 * @property {string} productoId - ID del producto afectado.
 * @property {string} producto - Nombre del producto al momento del movimiento.
 * @property {number} cantidad - Cantidad afectada con signo (+ entrada, - salida).
 * @property {string} [referencia] - ID de la compra, venta o ajuste que originó el movimiento.
 * @property {string} creadoPor - ID de usuario del creador (uid).
 * @property {string} registradoPor - Nombre del usuario que realizó el movimiento.
 * @property {import("firebase/firestore").Timestamp | Date} fechaCreacion - Fecha del movimiento.
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
  return `movimientos_${sanitized}`;
};

/**
 * Suscribe a los cambios en tiempo real de la colección de movimientos de un usuario.
 */
export const subscribeMovimientos = (userDisplayName, userId, callback, onError) => {
  const movimientosRef = collection(db, getCollectionName(userDisplayName));
  const q = query(
    movimientosRef,
    where("creadoPor", "==", userId)
  );

  return onSnapshot(q, (querySnapshot) => {
    const movimientos = [];
    querySnapshot.forEach((docSnap) => {
      movimientos.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    movimientos.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    callback(movimientos);
  }, (error) => {
    console.error("Error en suscripción de movimientos:", error);
    if (onError) onError(error);
  });
};

/**
 * Registra un movimiento de inventario.
 * @param {Object} params
 * @param {string} params.tipo - 'Compra' | 'Venta' | 'Ajuste'
 * @param {string} params.productoId - ID del producto afectado.
 * @param {string} params.producto - Nombre del producto.
 * @param {number} params.cantidad - Cantidad con signo (+ entrada, - salida).
 * @param {string} [params.referencia] - ID del documento que originó el movimiento.
 */
export const addMovimiento = async ({ tipo, productoId, producto, cantidad, referencia = "" }, userId, userDisplayName) => {
  try {
    const nuevoMovimiento = {
      tipo,
      productoId: productoId || "",
      producto: producto || "Producto sin nombre",
      cantidad: Number(cantidad) || 0,
      referencia: referencia || "",
      creadoPor: userId,
      registradoPor: userDisplayName || "Usuario",
      fechaCreacion: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, getCollectionName(userDisplayName)), nuevoMovimiento);
    return docRef.id;
  } catch (error) {
    console.error("Error al registrar movimiento de inventario en Firestore:", error);
    throw error;
  }
};
