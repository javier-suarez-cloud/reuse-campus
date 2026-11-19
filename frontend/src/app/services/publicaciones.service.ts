import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_URL } from '../config';

export type Modalidad = 'DONACION' | 'INTERCAMBIO';
export type EstadoPublicacion = 'DISPONIBLE' | 'RESERVADA' | 'ENTREGADA' | 'CANCELADA';

export interface Publicacion {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  modalidad: Modalidad;
  estado: EstadoPublicacion;
  fecha_publicacion: string;
  usuario_id: number;
  propietario: string;
}

export interface DatosPublicacion {
  titulo: string;
  descripcion: string;
  categoria: string;
  modalidad: Modalidad;
}

export interface FiltrosPublicaciones {
  estado?: EstadoPublicacion | '';
  modalidad?: Modalidad | '';
  propias?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PublicacionesService {
  private http = inject(HttpClient);
  private url = `${API_URL}/publicaciones`;

  listar(filtros: FiltrosPublicaciones = {}) {
    let params = new HttpParams();
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.modalidad) params = params.set('modalidad', filtros.modalidad);
    if (filtros.propias) params = params.set('propias', '1');
    return this.http.get<Publicacion[]>(this.url, { params });
  }

  obtener(id: number) {
    return this.http.get<Publicacion>(`${this.url}/${id}`);
  }

  crear(datos: DatosPublicacion) {
    return this.http.post<{ mensaje: string; id: number }>(this.url, datos);
  }

  actualizar(id: number, datos: DatosPublicacion) {
    return this.http.put<{ mensaje: string }>(`${this.url}/${id}`, datos);
  }

  cancelar(id: number) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/cancelar`, {});
  }
}
