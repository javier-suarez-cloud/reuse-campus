import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_URL } from '../config';

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: 'USUARIO' | 'ADMINISTRADOR';
}

interface RespuestaLogin {
  token: string;
  usuario: Usuario;
}

const CLAVE_TOKEN = 'reuse_token';
const CLAVE_USUARIO = 'reuse_usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  // La sesión se guarda en localStorage para sobrevivir a recargar la página
  private _usuario = signal<Usuario | null>(this.leerUsuarioGuardado());

  usuario = this._usuario.asReadonly();
  haySesion = computed(() => this._usuario() !== null);
  esAdmin = computed(() => this._usuario()?.rol === 'ADMINISTRADOR');

  registrar(datos: { nombre: string; correo: string; password: string }) {
    return this.http.post<{ mensaje: string; id: number }>(`${API_URL}/auth/registro`, datos);
  }

  login(datos: { correo: string; password: string }) {
    return this.http.post<RespuestaLogin>(`${API_URL}/auth/login`, datos).pipe(
      tap((resp) => {
        localStorage.setItem(CLAVE_TOKEN, resp.token);
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(resp.usuario));
        this._usuario.set(resp.usuario);
      })
    );
  }

  logout() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    this._usuario.set(null);
    this.router.navigate(['/login']);
  }

  obtenerToken(): string | null {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  private leerUsuarioGuardado(): Usuario | null {
    try {
      const texto = localStorage.getItem(CLAVE_USUARIO);
      return texto && localStorage.getItem(CLAVE_TOKEN) ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }
}
