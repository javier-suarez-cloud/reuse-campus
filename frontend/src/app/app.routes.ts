import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { Login } from './pages/login/login';
import { Registro } from './pages/registro/registro';
import { Publicaciones } from './pages/publicaciones/publicaciones';
import { authGuard, visitanteGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Inicio, pathMatch: 'full' },
  { path: 'login', component: Login, canActivate: [visitanteGuard] },
  { path: 'registro', component: Registro, canActivate: [visitanteGuard] },
  { path: 'publicaciones', component: Publicaciones, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
