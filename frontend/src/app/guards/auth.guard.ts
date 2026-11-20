import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Solo deja entrar si hay sesión; si no, manda a /login
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.haySesion() ? true : router.createUrlTree(['/login']);
};

// Solo para administradores: con sesión pero sin rol ADMINISTRADOR se manda a /publicaciones.
// (El backend vuelve a exigir el rol en cada petición; esto solo evita mostrar la pantalla.)
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.haySesion()) return router.createUrlTree(['/login']);
  return auth.esAdmin() ? true : router.createUrlTree(['/publicaciones']);
};

// Para login y registro: si ya hay sesión, no tiene sentido mostrarlos
export const visitanteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.haySesion() ? router.createUrlTree(['/publicaciones']) : true;
};
