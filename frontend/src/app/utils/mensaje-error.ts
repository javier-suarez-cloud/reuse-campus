import { HttpErrorResponse } from '@angular/common/http';

// Convierte un error HTTP en el texto que se muestra al usuario.
// El backend responde los errores como { mensaje } (400, 403, 404, 409): se muestra ese texto.
export function mensajeDeError(e: HttpErrorResponse, porDefecto: string): string {
  if (e.status === 0) {
    return 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.';
  }
  return e.error?.mensaje ?? porDefecto;
}
