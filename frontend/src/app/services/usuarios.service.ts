import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_URL } from '../config';

export type RolUsuario = 'USUARIO' | 'ADMINISTRADOR';
export type EstadoUsuario = 'ACTIVO' | 'INACTIVO';

// Un usuario tal como lo entrega GET /api/usuarios (nunca incluye la contraseña)
export interface UsuarioAdmin {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  estado: EstadoUsuario;
  publicaciones: number;
}

export interface FiltrosUsuarios {
  rol?: RolUsuario | '';
  estado?: EstadoUsuario | '';
}

// Todas estas rutas son solo para administradores (el backend responde 403 a los demás)
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private url = `${API_URL}/usuarios`;

  listar(filtros: FiltrosUsuarios = {}) {
    let params = new HttpParams();
    if (filtros.rol) params = params.set('rol', filtros.rol);
    if (filtros.estado) params = params.set('estado', filtros.estado);
    return this.http.get<UsuarioAdmin[]>(this.url, { params });
  }

  cambiarEstado(id: number, estado: EstadoUsuario) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/estado`, { estado });
  }

  cambiarRol(id: number, rol: RolUsuario) {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/rol`, { rol });
  }
}
