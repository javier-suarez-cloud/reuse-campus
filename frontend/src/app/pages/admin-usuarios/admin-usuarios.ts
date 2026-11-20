import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  EstadoUsuario, RolUsuario, UsuarioAdmin, UsuariosService,
} from '../../services/usuarios.service';
import { mensajeDeError } from '../../utils/mensaje-error';

@Component({
  selector: 'app-admin-usuarios',
  imports: [FormsModule],
  templateUrl: './admin-usuarios.html',
  styleUrl: './admin-usuarios.css',
})
export class AdminUsuarios implements OnInit {
  private servicio = inject(UsuariosService);
  auth = inject(AuthService);

  usuarios = signal<UsuarioAdmin[]>([]);
  cargando = signal(true);
  error = signal('');
  exito = signal('');
  trabajando = signal(false);

  // Filtros (ligados a los select con ngModel)
  rol: RolUsuario | '' = '';
  estado: EstadoUsuario | '' = '';

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);

    this.servicio.listar({ rol: this.rol, estado: this.estado }).subscribe({
      next: (datos) => {
        this.usuarios.set(datos);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e, 'Error al cargar los usuarios'));
      },
    });
  }

  // Un administrador no puede modificar su propia cuenta (el backend responde 409):
  // en su fila se ocultan los botones.
  esMiCuenta(u: UsuarioAdmin) {
    return this.auth.usuario()?.id === u.id;
  }

  alternarEstado(u: UsuarioAdmin) {
    const nuevo: EstadoUsuario = u.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const accion = nuevo === 'INACTIVO' ? 'desactivar' : 'activar';
    if (!confirm(`¿Seguro que quieres ${accion} la cuenta de ${u.nombre}?`)) return;

    this.ejecutar(this.servicio.cambiarEstado(u.id, nuevo), 'Error al cambiar el estado');
  }

  alternarRol(u: UsuarioAdmin) {
    const nuevo: RolUsuario = u.rol === 'ADMINISTRADOR' ? 'USUARIO' : 'ADMINISTRADOR';
    if (!confirm(`¿Cambiar el rol de ${u.nombre} a ${nuevo}?`)) return;

    this.ejecutar(this.servicio.cambiarRol(u.id, nuevo), 'Error al cambiar el rol');
  }

  private ejecutar(peticion: Observable<{ mensaje: string }>, porDefecto: string) {
    this.error.set('');
    this.exito.set('');
    this.trabajando.set(true);

    peticion.subscribe({
      next: (resp) => {
        this.trabajando.set(false);
        this.exito.set(resp.mensaje);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.trabajando.set(false);
        this.error.set(mensajeDeError(e, porDefecto));
        this.cargar();
      },
    });
  }
}
