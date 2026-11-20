import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../config';
import { EstadoPublicacion } from './publicaciones.service';

export type EstadoSolicitud = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';

// Una solicitud que yo hice (GET /api/solicitudes/mias)
export interface SolicitudMia {
  id: number;
  publicacion_id: number;
  mensaje: string | null;
  fecha_solicitud: string;
  estado: EstadoSolicitud;
  publicacion_titulo: string;
  publicacion_estado: EstadoPublicacion;
  propietario: string;
}

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  private http = inject(HttpClient);
  private url = `${API_URL}/solicitudes`;

  crear(publicacionId: number, mensaje: string) {
    return this.http.post<{ mensaje: string; id: number }>(this.url, {
      publicacion_id: publicacionId,
      mensaje,
    });
  }

  mias() {
    return this.http.get<SolicitudMia[]>(`${this.url}/mias`);
  }

  cancelar(id: number) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/cancelar`, {});
  }
}
