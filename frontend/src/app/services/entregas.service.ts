import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../config';
import { EstadoPublicacion } from './publicaciones.service';

export type EstadoEntrega = 'PENDIENTE' | 'COMPLETADA';

// Una entrega en la que participo (GET /api/entregas/mias)
export interface Entrega {
  id: number;
  publicacion_id: number;
  solicitud_id: number;
  propietario_id: number;
  receptor_id: number;
  fecha_acuerdo: string;
  fecha_entrega: string | null;
  estado: EstadoEntrega;
  publicacion_titulo: string;
  publicacion_estado: EstadoPublicacion;
  propietario: string;
  receptor: string;
  // El backend indica si en esta entrega yo soy el propietario o el receptor
  mi_rol: 'PROPIETARIO' | 'RECEPTOR';
}

@Injectable({ providedIn: 'root' })
export class EntregasService {
  private http = inject(HttpClient);
  private url = `${API_URL}/entregas`;

  mias() {
    return this.http.get<Entrega[]>(`${this.url}/mias`);
  }

  // Confirmar completa la entrega y deja la publicación ENTREGADA (transacción en el backend)
  confirmar(id: number) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/confirmar`, {});
  }
}
