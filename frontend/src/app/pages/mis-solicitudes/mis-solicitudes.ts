import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SolicitudMia, SolicitudesService } from '../../services/solicitudes.service';
import { mensajeDeError } from '../../utils/mensaje-error';

@Component({
  selector: 'app-mis-solicitudes',
  imports: [RouterLink, DatePipe],
  templateUrl: './mis-solicitudes.html',
  styleUrl: './mis-solicitudes.css',
})
export class MisSolicitudes implements OnInit {
  private servicio = inject(SolicitudesService);

  solicitudes = signal<SolicitudMia[]>([]);
  cargando = signal(true);
  error = signal('');
  exito = signal('');

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.servicio.mias().subscribe({
      next: (datos) => {
        this.solicitudes.set(datos);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e, 'Error al cargar tus solicitudes'));
      },
    });
  }

  // RN16: solo se cancela mientras esté PENDIENTE (el botón solo aparece en ese caso)
  cancelar(s: SolicitudMia) {
    if (!confirm('¿Seguro que quieres cancelar esta solicitud?')) return;

    this.error.set('');
    this.exito.set('');
    this.servicio.cancelar(s.id).subscribe({
      next: (resp) => {
        this.exito.set(resp.mensaje);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(mensajeDeError(e, 'Error al cancelar la solicitud'));
        // Si el estado cambió mientras tanto (409), se refresca la lista
        this.cargar();
      },
    });
  }
}
