import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Publicacion, PublicacionesService } from '../../services/publicaciones.service';

@Component({
  selector: 'app-publicacion-detalle',
  imports: [RouterLink, DatePipe],
  templateUrl: './publicacion-detalle.html',
  styleUrl: './publicacion-detalle.css',
})
export class PublicacionDetalle implements OnInit {
  private servicio = inject(PublicacionesService);
  private ruta = inject(ActivatedRoute);
  auth = inject(AuthService);

  publicacion = signal<Publicacion | null>(null);
  cargando = signal(true);
  error = signal('');
  exito = signal('');

  ngOnInit() {
    this.cargar();
  }

  // Editar y cancelar: el propietario o un administrador, y solo si está DISPONIBLE.
  // (El backend vuelve a validarlo; esto solo decide si se muestran los botones.)
  puedeModificar(p: Publicacion) {
    const esPropietario = this.auth.usuario()?.id === p.usuario_id;
    return (esPropietario || this.auth.esAdmin()) && p.estado === 'DISPONIBLE';
  }

  cargar() {
    const id = Number(this.ruta.snapshot.paramMap.get('id'));

    this.servicio.obtener(id).subscribe({
      next: (p) => {
        this.publicacion.set(p);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(this.mensajeError(e, 'Error al cargar la publicación'));
      },
    });
  }

  cancelar(p: Publicacion) {
    if (!confirm('¿Seguro que quieres cancelar esta publicación?')) return;

    this.error.set('');
    this.servicio.cancelar(p.id).subscribe({
      next: (resp) => {
        this.exito.set(resp.mensaje);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => this.error.set(this.mensajeError(e, 'Error al cancelar')),
    });
  }

  private mensajeError(e: HttpErrorResponse, porDefecto: string) {
    if (e.status === 0) return 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.';
    if (e.status === 404) return 'La publicación no existe.';
    return e.error?.mensaje ?? porDefecto;
  }
}
