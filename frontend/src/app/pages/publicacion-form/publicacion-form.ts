import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PublicacionesService } from '../../services/publicaciones.service';

// Sirve para crear (/publicaciones/nueva) y para editar (/publicaciones/:id/editar)
@Component({
  selector: 'app-publicacion-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './publicacion-form.html',
  styleUrl: '../formulario.css',
})
export class PublicacionForm implements OnInit {
  private fb = inject(FormBuilder);
  private servicio = inject(PublicacionesService);
  private router = inject(Router);
  private ruta = inject(ActivatedRoute);
  private auth = inject(AuthService);

  // Si la ruta trae :id estamos editando
  id: number | null = null;
  error = signal('');
  cargando = signal(false);

  form = this.fb.nonNullable.group({
    titulo: ['', [Validators.required, Validators.maxLength(150)]],
    descripcion: ['', [Validators.required]],
    categoria: ['', [Validators.required, Validators.maxLength(50)]],
    modalidad: ['DONACION' as 'DONACION' | 'INTERCAMBIO', [Validators.required]],
  });

  get editando() {
    return this.id !== null;
  }

  ngOnInit() {
    const param = this.ruta.snapshot.paramMap.get('id');
    if (!param) return;

    this.id = Number(param);
    this.cargando.set(true);

    this.servicio.obtener(this.id).subscribe({
      next: (p) => {
        // Solo el propietario puede editar y solo si sigue DISPONIBLE
        if (p.usuario_id !== this.auth.usuario()?.id || p.estado !== 'DISPONIBLE') {
          this.router.navigate(['/publicaciones', p.id]);
          return;
        }
        this.form.patchValue(p);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(this.mensajeError(e, 'Error al cargar la publicación'));
      },
    });
  }

  enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.cargando.set(true);

    const datos = this.form.getRawValue();
    const alFallar = (e: HttpErrorResponse) => {
      this.cargando.set(false);
      this.error.set(this.mensajeError(e, 'Error al guardar la publicación'));
    };

    if (this.id !== null) {
      const id = this.id;
      this.servicio.actualizar(id, datos).subscribe({
        next: () => this.router.navigate(['/publicaciones', id]),
        error: alFallar,
      });
    } else {
      this.servicio.crear(datos).subscribe({
        next: (resp) => this.router.navigate(['/publicaciones', resp.id]),
        error: alFallar,
      });
    }
  }

  private mensajeError(e: HttpErrorResponse, porDefecto: string) {
    if (e.status === 0) return 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.';
    if (e.status === 404) return 'La publicación no existe.';
    return e.error?.mensaje ?? porDefecto;
  }
}
