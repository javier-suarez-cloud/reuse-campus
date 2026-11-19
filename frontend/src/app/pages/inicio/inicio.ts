import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  template: `
    <section class="portada">
      <h1>ReUse Campus</h1>
      <p>Dona o intercambia objetos con tu comunidad del campus y dales una segunda vida.</p>
      @if (auth.haySesion()) {
        <a class="boton" routerLink="/publicaciones">Ver publicaciones</a>
      } @else {
        <a class="boton" routerLink="/registro">Crear cuenta</a>
        <a class="boton secundario" routerLink="/login">Iniciar sesión</a>
      }
    </section>
  `,
  styles: `
    .portada { text-align: center; padding: 3rem 1rem; }
    .portada h1 { font-size: 2.2rem; margin-bottom: 0.5rem; }
    .boton {
      display: inline-block; margin: 0.5rem; padding: 0.65rem 1.2rem;
      background: #2e7d32; color: #fff; border-radius: 6px; text-decoration: none;
    }
    .secundario { background: #fff; color: #2e7d32; border: 1px solid #2e7d32; }
  `,
})
export class Inicio {
  auth = inject(AuthService);
}
