import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import {
  EstadoSolicitud, SolicitudRecibida, SolicitudesService,
} from '../../services/solicitudes.service';
import { mensajeDeError } from '../../utils/mensaje-error';

@Component({
  selector: 'app-solicitudes-recibidas',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './solicitudes-recibidas.html',
  styleUrl: './solicitudes-recibidas.css',
})
export class SolicitudesRecibidas implements OnInit {
  private servicio = inject(SolicitudesService);
  private ruta = inject(ActivatedRoute);

  solicitudes = signal<SolicitudRecibida[]>([]);
  cargando = signal(true);
  error = signal('');
  exito = signal('');
  // Se desactivan los botones mientras hay una operación en curso (evita doble clic)
  trabajando = signal(false);

  // Filtros: el estado se liga al select; la publicación puede venir en la URL (?publicacion_id=3)
  estado: EstadoSolicitud | '' = 'PENDIENTE';
  publicacionId: number | null = null;

  ngOnInit() {
    const id = Number(this.ruta.snapshot.queryParamMap.get('publicacion_id'));
    this.publicacionId = Number.isInteger(id) && id > 0 ? id : null;
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);

    this.servicio.recibidas({ estado: this.estado, publicacion_id: this.publicacionId }).subscribe({
      next: (datos) => {
        this.solicitudes.set(datos);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e, 'Error al cargar las solicitudes recibidas'));
      },
    });
  }

  quitarFiltroPublicacion() {
    this.publicacionId = null;
    this.cargar();
  }

  // RN08: solo se acepta si la publicación sigue DISPONIBLE y la solicitud está PENDIENTE
  puedeAceptar(s: SolicitudRecibida) {
    return s.estado === 'PENDIENTE' && s.publicacion_estado === 'DISPONIBLE';
  }

  aceptar(s: SolicitudRecibida) {
    const texto = `¿Aceptar la solicitud de ${s.solicitante}? Las demás solicitudes pendientes de esta publicación se rechazarán.`;
    if (!confirm(texto)) return;

    this.ejecutar(this.servicio.aceptar(s.id), 'Error al aceptar la solicitud');
  }

  rechazar(s: SolicitudRecibida) {
    if (!confirm(`¿Rechazar la solicitud de ${s.solicitante}?`)) return;

    this.ejecutar(this.servicio.rechazar(s.id), 'Error al rechazar la solicitud');
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
        // Si el estado cambió mientras tanto (409), se refresca la lista
        this.cargar();
      },
    });
  }
}
