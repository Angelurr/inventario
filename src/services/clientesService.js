import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Cliente
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} tipoDocumento - Tipo de identificación (ej. CC, CE, NIT, PP).
 * @property {string} documento - Número de documento de identidad.
 * @property {string} nombres - Nombres del cliente.
 * @property {string} apellidos - Apellidos del cliente.
 * @property {string} email - Correo electrónico de contacto.
 * @property {string} [telefono] - Número telefónico (opcional).
 * @property {string} [direccion] - Dirección de contacto (opcional).
 * @property {string} estado - Estado del cliente ('Activo' | 'Inactivo').
 * @property {string} creadoPor - ID de usuario del creador (uid).
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
  return `clientes_${sanitized}`;
};

/**
 * Suscribe a los cambios en tiempo real de la colección de clientes de un usuario.
 */
export const subscribeClientes = (userDisplayName, userId, callback, onError) => {
  const clientesRef = collection(db, getCollectionName(userDisplayName));
  const q = query(
    clientesRef,
    where("creadoPor", "==", userId)
  );

  return onSnapshot(q, (querySnapshot) => {
    const clientes = [];
    querySnapshot.forEach((docSnap) => {
      clientes.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Ordenar del más nuevo al más antiguo en el lado del cliente (evita requerir índice compuesto)
    clientes.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    callback(clientes);
  }, (error) => {
    console.error("Error en suscripción de clientes:", error);
    if (onError) onError(error);
  });
};

/**
 * Agrega un nuevo cliente a Firestore.
 */
export const addCliente = async (clienteData, userId, userDisplayName) => {
  try {
    const nuevoCliente = {
      ...clienteData,
      creadoPor: userId,
      registradoPor: userDisplayName || "Usuario",
      fechaCreacion: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, getCollectionName(userDisplayName)), nuevoCliente);
    return docRef.id;
  } catch (error) {
    console.error("Error al agregar cliente en Firestore:", error);
    throw error;
  }
};

/**
 * Obtiene todos los clientes registrados por un usuario específico de Firestore de forma única.
 */
export const getClientes = async (userDisplayName, userId) => {
  try {
    const clientesRef = collection(db, getCollectionName(userDisplayName));
    const q = query(
      clientesRef, 
      where("creadoPor", "==", userId)
    );
    
    const querySnapshot = await getDocs(q);
    const clientes = [];
    querySnapshot.forEach((docSnap) => {
      clientes.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Ordenar del más nuevo al más antiguo en el lado del cliente (evita requerir índice compuesto)
    clientes.sort((a, b) => {
      const timeA = a.fechaCreacion?.seconds || (a.fechaCreacion instanceof Date ? a.fechaCreacion.getTime() / 1000 : 0);
      const timeB = b.fechaCreacion?.seconds || (b.fechaCreacion instanceof Date ? b.fechaCreacion.getTime() / 1000 : 0);
      return timeB - timeA;
    });

    return clientes;
  } catch (error) {
    console.error("Error al obtener clientes de Firestore:", error);
    throw error;
  }
};

/**
 * Actualiza los datos de un cliente existente.
 */
export const updateCliente = async (userDisplayName, id, updatedData) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await updateDoc(docRef, updatedData);
  } catch (error) {
    console.error("Error al actualizar cliente en Firestore:", error);
    throw error;
  }
};

/**
 * Elimina un cliente por su ID.
 */
export const deleteCliente = async (userDisplayName, id) => {
  try {
    const docRef = doc(db, getCollectionName(userDisplayName), id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error al eliminar cliente de Firestore:", error);
    throw error;
  }
};
