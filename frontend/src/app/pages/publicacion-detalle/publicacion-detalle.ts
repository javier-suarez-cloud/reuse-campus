import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Publicacion, PublicacionesService } from '../../services/publicaciones.service';
import { SolicitudesService } from '../../services/solicitudes.service';
import { mensajeDeError } from '../../utils/mensaje-error';

@Component({
  selector: 'app-publicacion-detalle',
  imports: [RouterLink, DatePipe, ReactiveFormsModule],
  templateUrl: './publicacion-detalle.html',
  styleUrl: './publicacion-detalle.css',
})
export class PublicacionDetalle implements OnInit {
  private servicio = inject(PublicacionesService);
  private solicitudes = inject(SolicitudesService);
  private ruta = inject(ActivatedRoute);
  auth = inject(AuthService);

  publicacion = signal<Publicacion | null>(null);
  cargando = signal(true);
  error = signal('');
  exito = signal('');

  // Solicitud: mensaje opcional de hasta 255 caracteres (igual que el backend)
  mensajeSolicitud = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(255)],
  });
  enviando = signal(false);
  solicitudEnviada = signal(false);

  ngOnInit() {
    this.cargar();
  }

  // Solicitar: publicación DISPONIBLE y que no sea mía (RN03, RN04).
  // El backend vuelve a validarlo; esto solo decide si se muestra el formulario.
  puedeSolicitar(p: Publicacion) {
    return p.estado === 'DISPONIBLE' && this.auth.usuario()?.id !== p.usuario_id;
  }

  solicitar(p: Publicacion) {
    if (this.mensajeSolicitud.invalid) {
      this.mensajeSolicitud.markAsTouched();
      return;
    }
    this.error.set('');
    this.exito.set('');
    this.enviando.set(true);

    this.solicitudes.crear(p.id, this.mensajeSolicitud.value.trim()).subscribe({
      next: (resp) => {
        this.enviando.set(false);
        this.solicitudEnviada.set(true);
        this.exito.set(resp.mensaje);
        this.mensajeSolicitud.reset('');
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e, 'Error al enviar la solicitud'));
        // Si el estado cambió (409), se vuelve a cargar la publicación
        this.cargar();
      },
    });
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
