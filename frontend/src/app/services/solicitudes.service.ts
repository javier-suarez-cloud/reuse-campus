import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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

// Una solicitud que llegó a una de mis publicaciones (GET /api/solicitudes/recibidas)
export interface SolicitudRecibida {
  id: number;
  publicacion_id: number;
  solicitante_id: number;
  mensaje: string | null;
  fecha_solicitud: string;
  estado: EstadoSolicitud;
  publicacion_titulo: string;
  publicacion_estado: EstadoPublicacion;
  solicitante: string;
}

export interface FiltrosRecibidas {
  estado?: EstadoSolicitud | '';
  publicacion_id?: number | null;
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

  recibidas(filtros: FiltrosRecibidas = {}) {
    let params = new HttpParams();
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.publicacion_id) params = params.set('publicacion_id', filtros.publicacion_id);
    return this.http.get<SolicitudRecibida[]>(`${this.url}/recibidas`, { params });
  }

  // Aceptar crea la entrega y reserva la publicación (todo en una transacción del backend)
  aceptar(id: number) {
    return this.http.patch<{ mensaje: string; entrega_id: number }>(`${this.url}/${id}/aceptar`, {});
  }

  rechazar(id: number) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/rechazar`, {});
  }
}
