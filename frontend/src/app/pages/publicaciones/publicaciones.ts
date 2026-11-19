import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';

// Pantalla protegida de ejemplo; el CRUD real llega con el issue #4
@Component({
  selector: 'app-publicaciones',
  template: `
    <section class="contenido">
      <h1>Publicaciones</h1>
      <p>Hola, {{ auth.usuario()?.nombre }}. Aquí se mostrará el listado de publicaciones.</p>
    </section>
  `,
  styles: `.contenido { max-width: 900px; margin: 1.5rem auto; padding: 0 1rem; }`,
})
export class Publicaciones {
  auth = inject(AuthService);
}
