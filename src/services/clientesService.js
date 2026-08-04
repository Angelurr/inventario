import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * @typedef {Object} Cliente
 * @property {string} [id] - ID único autogenerado por Firestore.
 * @property {string} tipoDocumento - Tipo de identificación (ej. CC, CE, NIT, PP).
 * @property {string} documento - Número de documento de identidad (único).
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
 * Verifica si ya existe un cliente con el mismo tipo y número de documento.
 */
export const checkDocumentoExiste = async (userDisplayName, tipoDocumento, documento, excludeId = null) => {
  try {
    const clientesRef = collection(db, getCollectionName(userDisplayName));
    const q = query(
      clientesRef,
      where("tipoDocumento", "==", tipoDocumento),
      where("documento", "==", documento)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return false;
    }
    
    // Si hay registros, verificar si el ID no es el que estamos editando
    if (excludeId) {
      const match = querySnapshot.docs.find(doc => doc.id !== excludeId);
      return !!match;
    }
    
    return true;
  } catch (error) {
    console.error("Error al verificar documento existente:", error);
    throw error;
  }
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
    // Validar duplicado antes de insertar
    const existe = await checkDocumentoExiste(userDisplayName, clienteData.tipoDocumento, clienteData.documento);
    if (existe) {
      throw new Error(`Ya existe un cliente registrado con el documento ${clienteData.tipoDocumento} ${clienteData.documento}`);
    }

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
    // Si se está cambiando el documento, verificar duplicados excluyendo el cliente actual
    if (updatedData.tipoDocumento || updatedData.documento) {
      const existe = await checkDocumentoExiste(
        userDisplayName,
        updatedData.tipoDocumento, 
        updatedData.documento, 
        id
      );
      if (existe) {
        throw new Error(`Ya existe otro cliente registrado con el documento ${updatedData.tipoDocumento} ${updatedData.documento}`);
      }
    }

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
