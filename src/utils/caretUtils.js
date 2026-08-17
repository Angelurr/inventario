// Restaura la posición del cursor después de que React re-renderice el input
// con un valor transformado (mayúsculas, formato de miles, etc.).
// oldValue se usa para recalcular la posición cuando la transformación cambia
// la longitud del texto (ej. separadores de miles).
export const restoreCaret = (input, position) => {
  requestAnimationFrame(() => {
    if (input && document.activeElement === input) {
      const safePos = Math.max(0, Math.min(position, input.value.length));
      try {
        input.setSelectionRange(safePos, safePos);
      } catch {
        // algunos tipos de input (email, number) no permiten setSelectionRange
      }
    }
  });
};

// Calcula la nueva posición del cursor después de una transformación.
// Para mayúsculas la posición no cambia. Para formato de miles se busca
// mantener el cursor "detrás" de la misma cantidad de dígitos.
export const getNewCaret = (oldValue, newValue, oldCaret) => {
  const oldBefore = oldValue.slice(0, oldCaret);
  const digitsBefore = (oldBefore.match(/\d/g) || []).length;
  if (!digitsBefore) return oldCaret;

  let digits = 0;
  for (let i = 0; i < newValue.length; i++) {
    if (/\d/.test(newValue[i])) digits++;
    if (digits === digitsBefore) return i + 1;
  }
  return newValue.length;
};
