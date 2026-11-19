import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Solo deja entrar si hay sesión; si no, manda a /login
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.haySesion() ? true : router.createUrlTree(['/login']);
};

// Para login y registro: si ya hay sesión, no tiene sentido mostrarlos
export const visitanteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.haySesion() ? router.createUrlTree(['/publicaciones']) : true;
};
