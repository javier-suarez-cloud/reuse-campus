import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

// Validador de grupo: las dos contraseñas deben coincidir
function passwordsIguales(grupo: AbstractControl): ValidationErrors | null {
  const a = grupo.get('password')?.value;
  const b = grupo.get('confirmar')?.value;
  return a === b ? null : { noCoinciden: true };
}

@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro.html',
  styleUrl: '../formulario.css',
})
export class Registro {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  error = signal('');
  cargando = signal(false);

  form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      correo: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmar: ['', [Validators.required]],
    },
    { validators: passwordsIguales }
  );

  enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.cargando.set(true);

    const { nombre, correo, password } = this.form.getRawValue();
    this.auth.registrar({ nombre, correo, password }).subscribe({
      // Tras registrarse, se inicia sesión automáticamente
      next: () =>
        this.auth.login({ correo, password }).subscribe({
          next: () => this.router.navigate(['/publicaciones']),
          error: () => this.router.navigate(['/login']),
        }),
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          e.status === 0
            ? 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.'
            : (e.error?.mensaje ?? 'Error al registrar el usuario')
        );
      },
    });
  }
}
