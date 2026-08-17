import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Proveedor
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} nombre - Nombre o razón social del proveedor (único).
 * @property {string} [empresa] - Empresa a la que pertenece (opcional).
 * @property {string} [telefono] - Teléfono de contacto (opcional).
 * @property {string} [correo] - Correo electrónico de contacto (opcional).
 * @property {string} [direccion] - Dirección de contacto (opcional).
 * @property {string} estado - Estado del proveedor ('Activo' | 'Inactivo').
 * @property {string} creadoPor - ID de usuario del creador (uid).
 * @property {string} registradoPor - Nombre del usuario que registró el proveedor.
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
  return `proveedores_${sanitized}`;
};

/**
 * Verifica si ya existe un proveedor con el mismo nombre (ignorando mayúsculas).
 */
export const checkProveedorExiste = async (userDisplayName, nombre, excludeId = null) => {
  try {
    const proveedoresRef = collection(db, getCollectionName(userDisplayName));
    const q = query(proveedoresRef, where("nombre", "==", nombre));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return false;
    }

    if (excludeId) {
      const match = querySnapshot.docs.find(doc => doc.id !== excludeId);
      return !!match;
    }

    return true;
  } catch (error) {
    console.error("Error al verificar proveedor existente:", error);
    throw error;
  }
};

/**
 * Suscribe a los cambios en tiempo real de la colección de proveedores de un usuario.
 */
export const subscribeProveedores = (userDisplayName, userId, callback, onError) => {
  const proveedoresRef = collection(db, getCollectionName(userDisplayName));
  const q = query(
    proveedoresRef,
    where("creadoPor", "==", userId)
  );

  return onSnapshot(q, (querySnapshot) => {
    const proveedores = [];
    querySnapshot.forEach((docSnap) => {
      proveedores.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    proveedores.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    callback(proveedores);
  }, (error) => {
    console.error("Error en suscripción de proveedores:", error);
    if (onError) onError(error);
  });
};

/**
 * Agrega un nuevo proveedor a Firestore.
 */
export const addProveedor = async (proveedorData, userId, userDisplayName) => {
  try {
    const existe = await checkProveedorExiste(userDisplayName, proveedorData.nombre);
    if (existe) {
      throw new Error(`Ya existe un proveedor registrado con el nombre ${proveedorData.nombre}`);
    }

    const nuevoProveedor = {
      ...proveedorData,
      creadoPor: userId,
      registradoPor: userDisplayName || "Usuario",
      fechaCreacion: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, getCollectionName(userDisplayName)), nuevoProveedor);
    return docRef.id;
  } catch (error) {
    console.error("Error al agregar proveedor en Firestore:", error);
    throw error;
  }
};

/**
 * Actualiza los datos de un proveedor existente.
 */
export const updateProveedor = async (userDisplayName, id, updatedData) => {
  try {
    if (updatedData.nombre) {
      const existe = await checkProveedorExiste(userDisplayName, updatedData.nombre, id);
      if (existe) {
        throw new Error(`Ya existe otro proveedor registrado con el nombre ${updatedData.nombre}`);
      }
    }

    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await updateDoc(docRef, updatedData);
  } catch (error) {
    console.error("Error al actualizar proveedor en Firestore:", error);
    throw error;
  }
};

/**
 * Elimina un proveedor por su ID.
 */
export const deleteProveedor = async (userDisplayName, id) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error al eliminar proveedor de Firestore:", error);
    throw error;
  }
};
