import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import {
  setDoc,
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase/firebaseConfig";

export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("There isnt authprovider");
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logSessionStart = async (user, provider = "email") => {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.data() || {};
    const displayNameParts = (user.displayName || "").split(" ");

    // Obtener email: user.email puede ser null en FB/GitHub,
    // así que buscamos también en providerData
    const providerEmail = user.providerData?.find((p) => p.email)?.email || "";
    const email = user.email || userData.email || providerEmail;

    await addDoc(collection(db, "sessionHistory"), {
      userId: user.uid,
      email: email,
      nombre: userData.nombre || displayNameParts[0] || "",
      apellidos: userData.apellidos || displayNameParts[1] || "",
      provider: provider,
      startTime: serverTimestamp(),
      endTime: null,
      status: "Activa",
    });
  };

  const logSessionEnd = async (userId) => {
    if (!userId) return;
    const q = query(
      collection(db, "sessionHistory"),
      where("userId", "==", userId),
      where("status", "==", "Activa")
    );
    const querySnapshot = await getDocs(q);
    
    // Esperar a que se actualicen todos los documentos antes de cerrar sesión
    const updatePromises = [];
    querySnapshot.forEach((document) => {
      updatePromises.push(
        updateDoc(doc(db, "sessionHistory", document.id), {
          endTime: serverTimestamp(),
          status: "Finalizado",
        })
      );
    });
    
    await Promise.all(updatePromises);
  };

  const signup = async (email, password, userData) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Guardar datos adicionales en Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email,
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        createdAt: new Date(),
      });
    } catch (error) {
      // Mapear errores de Firebase a mensajes amigables
      if (error.code === "auth/email-already-in-use") {
        throw new Error("Este correo ya está en uso. Por favor, intenta con otro o inicia sesión.");
      } else if (error.code === "auth/invalid-email") {
        throw new Error("El correo electrónico no es válido.");
      } else if (error.code === "auth/weak-password") {
        throw new Error("La contraseña es muy débil. Debe tener al menos 6 caracteres.");
      } else if (error.code === "auth/invalid-credential") {
        throw new Error("Las credenciales son inválidas o han expirado.");
      }
      throw error;
    }
  };

  const signin = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await logSessionStart(userCredential.user, "email");
    } catch (error) {
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        throw new Error("Correo o contraseña incorrectos.");
      } else if (error.code === "auth/invalid-email") {
        throw new Error("El correo electrónico no es válido.");
      } else if (error.code === "auth/too-many-requests") {
        throw new Error("Demasiados intentos fallidos. Por favor, intenta más tarde.");
      }
      throw error;
    }
  };

  const resetPassword = async (email) => {
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/reset`,
        handleCodeInApp: true,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
    } catch (error) {
      throw error;
    }
  };

  const verifyResetCode = async (oobCode) => {
    try {
      const email = await verifyPasswordResetCode(auth, oobCode);
      return email;
    } catch (error) {
      throw error;
    }
  };

  const confirmReset = async (oobCode, newPassword) => {
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
    } catch (error) {
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const user = userCredential.user;
      const displayNameParts = (user.displayName || "").split(" ");

      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          nombre: displayNameParts[0] || "",
          apellidos: displayNameParts.slice(1).join(" ") || "",
          photoURL: user.photoURL || "",
          createdAt: new Date(),
          registroConGoogle: true,
        });
      } else if (!userDocSnap.data().email && user.email) {
        await setDoc(userDocRef, { email: user.email }, { merge: true });
      }
      await logSessionStart(user, "google");
      return user;
    } catch (error) {
      if (error.code === "auth/popup-closed-by-user") {
        throw new Error("La ventana de autenticación fue cerrada antes de completar el proceso.");
      } else if (error.code === "auth/invalid-credential") {
        throw new Error("Error en las credenciales de Google. Por favor, intenta de nuevo.");
      }
      throw error;
    }
  };



  const logout = async () => {
    try {
      if (user) {
        await logSessionEnd(user.uid);
      }
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  // --- Sistema de Auto-Cierre de Sesión (5 Minutos de Inactividad) ---
  useEffect(() => {
    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      // Solo iniciamos el timer si hay un usuario logueado
      if (user) {
        timeoutId = setTimeout(() => {
          console.log("Sesión expirada por inactividad (5 minutos).");
          logout();
          alert("Tu sesión ha expirado por inactividad. Serás redirigido al login.");
        }, 5 * 60 * 1000); // 300,000ms = 5 minutos
      }
    };

    // Eventos que reinician el contador de inactividad
    const activityEvents = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "click"];

    if (user) {
      resetTimer();
      activityEvents.forEach((event) => {
        window.addEventListener(event, resetTimer);
      });
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  useEffect(() => {
    const unsuscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsuscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        signup,
        signin,
        user,
        logout,
        loading,
        signInWithGoogle,
        resetPassword,
        verifyResetCode,
        confirmReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;