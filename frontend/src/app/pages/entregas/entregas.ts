import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Entrega, EntregasService } from '../../services/entregas.service';
import { mensajeDeError } from '../../utils/mensaje-error';

@Component({
  selector: 'app-entregas',
  imports: [RouterLink, DatePipe],
  templateUrl: './entregas.html',
  styleUrl: './entregas.css',
})
export class Entregas implements OnInit {
  private servicio = inject(EntregasService);

  entregas = signal<Entrega[]>([]);
  cargando = signal(true);
  error = signal('');
  exito = signal('');
  trabajando = signal(false);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.servicio.mias().subscribe({
      next: (datos) => {
        this.entregas.set(datos);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e, 'Error al cargar tus entregas'));
      },
    });
  }

  // Con quién es la entrega: si yo soy el propietario, la otra persona es el receptor y al revés
  contraparte(e: Entrega) {
    return e.mi_rol === 'PROPIETARIO' ? e.receptor : e.propietario;
  }

  // RN13 y RN14: confirmar completa la entrega y la publicación pasa a ENTREGADA
  confirmar(e: Entrega) {
    if (!confirm('¿Confirmas que la entrega ya se realizó? Esta acción no se puede deshacer.')) return;

    this.error.set('');
    this.exito.set('');
    this.trabajando.set(true);

    this.servicio.confirmar(e.id).subscribe({
      next: (resp) => {
        this.trabajando.set(false);
        this.exito.set(resp.mensaje);
        this.cargar();
      },
      error: (err: HttpErrorResponse) => {
        this.trabajando.set(false);
        this.error.set(mensajeDeError(err, 'Error al confirmar la entrega'));
        // Si el estado cambió mientras tanto (409), se refresca la lista
        this.cargar();
      },
    });
  }
}
