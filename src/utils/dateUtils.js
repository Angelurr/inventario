// Devuelve la fecha de HOY en zona horaria local como YYYY-MM-DD.
// No usar new Date().toISOString() porque entrega la fecha en UTC,
// que puede adelantarse o atrasarse un día según la zona horaria.
export const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Convierte una fecha "YYYY-MM-DD" (formato de input date / Firestore)
// a "DD/MM/YYYY" para mostrarla en pantalla con el día primero.
export const formatDateShort = (dateString) => {
  if (!dateString) return "";
  const [year, month, day] = String(dateString).split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

