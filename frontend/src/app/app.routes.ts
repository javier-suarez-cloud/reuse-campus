import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { Login } from './pages/login/login';
import { Registro } from './pages/registro/registro';
import { Publicaciones } from './pages/publicaciones/publicaciones';
import { PublicacionDetalle } from './pages/publicacion-detalle/publicacion-detalle';
import { PublicacionForm } from './pages/publicacion-form/publicacion-form';
import { MisSolicitudes } from './pages/mis-solicitudes/mis-solicitudes';
import { SolicitudesRecibidas } from './pages/solicitudes-recibidas/solicitudes-recibidas';
import { Entregas } from './pages/entregas/entregas';
import { authGuard, visitanteGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Inicio, pathMatch: 'full' },
  { path: 'login', component: Login, canActivate: [visitanteGuard] },
  { path: 'registro', component: Registro, canActivate: [visitanteGuard] },
  { path: 'publicaciones', component: Publicaciones, canActivate: [authGuard] },
  // "nueva" va antes de ":id" para que no se confunda con un id
  { path: 'publicaciones/nueva', component: PublicacionForm, canActivate: [authGuard] },
  { path: 'publicaciones/:id', component: PublicacionDetalle, canActivate: [authGuard] },
  { path: 'publicaciones/:id/editar', component: PublicacionForm, canActivate: [authGuard] },
  { path: 'solicitudes/mias', component: MisSolicitudes, canActivate: [authGuard] },
  { path: 'solicitudes/recibidas', component: SolicitudesRecibidas, canActivate: [authGuard] },
  { path: 'entregas', component: Entregas, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
