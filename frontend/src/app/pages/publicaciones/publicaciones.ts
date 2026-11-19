import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  EstadoPublicacion, Modalidad, Publicacion, PublicacionesService,
} from '../../services/publicaciones.service';

@Component({
  selector: 'app-publicaciones',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './publicaciones.html',
  styleUrl: './publicaciones.css',
})
export class Publicaciones implements OnInit {
  private servicio = inject(PublicacionesService);

  publicaciones = signal<Publicacion[]>([]);
  cargando = signal(true);
  error = signal('');

  // Filtros (se ligan a los select con ngModel)
  estado: EstadoPublicacion | '' = 'DISPONIBLE';
  modalidad: Modalidad | '' = '';
  soloPropias = false;

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.error.set('');

    this.servicio
      .listar({ estado: this.estado, modalidad: this.modalidad, propias: this.soloPropias })
      .subscribe({
        next: (datos) => {
          this.publicaciones.set(datos);
          this.cargando.set(false);
        },
        error: (e: HttpErrorResponse) => {
          this.cargando.set(false);
          this.error.set(
            e.status === 0
              ? 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.'
              : (e.error?.mensaje ?? 'Error al cargar las publicaciones')
          );
        },
      });
  }
}
