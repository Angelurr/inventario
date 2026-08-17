import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Compra
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} fecha - Fecha de la compra (YYYY-MM-DD).
 * @property {string} proveedorId - ID del proveedor asociado.
 * @property {string} proveedorNombre - Nombre del proveedor al momento de registrar la compra.
 * @property {Array<{productoId, producto, cantidad, costoUnitario, subtotal}>} items - Productos comprados.
 * @property {number} cantidad - Cantidad total de artículos comprados (suma de items).
 * @property {number} total - Total de la compra (suma de subtotales).
 * @property {string} creadoPor - ID de usuario del creador (uid).
 * @property {string} registradoPor - Nombre del usuario que registró la compra.
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
  return `compras_${sanitized}`;
};

const normalizeItems = (items) => {
  const list = Array.isArray(items) && items.length > 0
    ? items.map((it) => ({
        productoId: it.productoId || "",
        producto: it.producto || "",
        cantidad: Number(it.cantidad) || 0,
        costoUnitario: Number(it.costoUnitario || 0),
        subtotal: (Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0),
      }))
    : [{
        productoId: "",
        producto: "",
        cantidad: 0,
        costoUnitario: 0,
        subtotal: 0,
      }];

  return list;
};

/**
 * Suscribe a los cambios en tiempo real de la colección de compras de un usuario.
 */
export const subscribeCompras = (userDisplayName, userId, callback, onError) => {
  const comprasRef = collection(db, getCollectionName(userDisplayName));
  const q = query(
    comprasRef,
    where("creadoPor", "==", userId)
  );

  return onSnapshot(q, (querySnapshot) => {
    const compras = [];
    querySnapshot.forEach((docSnap) => {
      compras.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    compras.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    callback(compras);
  }, (error) => {
    console.error("Error en suscripción de compras:", error);
    if (onError) onError(error);
  });
};

/**
 * Agrega una nueva compra a Firestore.
 */
export const addCompra = async (compraData, userId, userDisplayName) => {
  try {
    const items = normalizeItems(compraData.items);
    const cantidad = items.reduce((acc, it) => acc + it.cantidad, 0);
    const total = items.reduce((acc, it) => acc + it.subtotal, 0);

    const nuevaCompra = {
      ...compraData,
      items,
      cantidad,
      total,
      creadoPor: userId,
      registradoPor: userDisplayName || "Usuario",
      fechaCreacion: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, getCollectionName(userDisplayName)), nuevaCompra);
    return docRef.id;
  } catch (error) {
    console.error("Error al agregar compra en Firestore:", error);
    throw error;
  }
};

/**
 * Actualiza los datos de una compra existente.
 */
export const updateCompra = async (userDisplayName, id, updatedData) => {
  try {
    const dataToSave = { ...updatedData };

    if (Array.isArray(dataToSave.items)) {
      dataToSave.items = normalizeItems(dataToSave.items);
      dataToSave.cantidad = dataToSave.items.reduce((acc, it) => acc + it.cantidad, 0);
      dataToSave.total = dataToSave.items.reduce((acc, it) => acc + it.subtotal, 0);
    }

    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await updateDoc(docRef, dataToSave);
  } catch (error) {
    console.error("Error al actualizar compra en Firestore:", error);
    throw error;
  }
};

/**
 * Elimina una compra por su ID.
 */
export const deleteCompra = async (userDisplayName, id) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error al eliminar compra de Firestore:", error);
    throw error;
  }
};
