# ReUse Campus

Plataforma web de economía circular para la comunidad del Instituto Profesional Virginio Gómez (sede Chillán): permite publicar artículos que ya no se usan para **donarlos o intercambiarlos**, solicitar los de otras personas y llevar el control de cada entrega hasta el final. Evaluación integradora de la asignatura *Backend y TDD con Node.js* (2026).

**Integrantes:** Javier Suarez (`javier-suarez-cloud`) y Fabián Díaz (`Talisk1`).

## Resumen

**Problema que resuelve y arquitectura.** Entre estudiantes, los artículos que ya no se usan (libros, calculadoras, componentes, accesorios) suelen quedarse guardados o regalarse de manera informal, sin saber quién los pidió ni en qué quedó el trato. ReUse Campus ordena el flujo completo: una persona publica un artículo, otras lo solicitan, el propietario acepta **una** solicitud, el sistema reserva la publicación, rechaza las demás solicitudes y genera una entrega; al confirmarla, la publicación queda entregada y el historial se conserva.

* **Frontend (`frontend/`):** SPA en Angular 22 (puerto `4200`) con `HttpClient`, rutas con *guards* de sesión, un servicio por recurso, un interceptor que envía el token JWT en `Authorization: Bearer` y formularios reactivos con validaciones.
* **Backend (`backend/`):** API REST en Node.js + Express 5 (puerto `3000`) con `mysql2` (consultas con `?`), contraseñas encriptadas con `bcryptjs`, sesión con JWT, middleware de roles y **transacciones** para las operaciones críticas.
* **Base de datos:** MySQL 8 (`reuse_campus`) con 4 tablas relacionadas por claves foráneas.

**Modelo de datos, roles y reglas.** Las entidades son `usuarios`, `publicaciones`, `solicitudes` y `entregas`. Los estados son `ENUM` en la base (publicación `DISPONIBLE`, `RESERVADA`, `ENTREGADA`, `CANCELADA`; solicitud `PENDIENTE`, `ACEPTADA`, `RECHAZADA`, `CANCELADA`; entrega `PENDIENTE`, `COMPLETADA`). Hay dos roles, **Usuario** y **Administrador**, y las 18 reglas de negocio del enunciado (RN01 a RN18) se validan en el backend (`401` sin sesión válida, `403` sin permiso, `404` si no existe el recurso, `409` si el estado actual no lo permite y `400` si los datos son inválidos). Aceptar una solicitud (RN08 a RN11) y confirmar una entrega (RN14) se hacen dentro de una transacción con bloqueo de filas (`SELECT ... FOR UPDATE`), de modo que o se guardan todos los cambios o ninguno.

**Organización.** Trabajamos entre el 17 y el 20 de noviembre de 2026, con ramas por tarea, Pull Requests, *merge commit* (sin *squash*, para conservar los commits de cada integrante) y un tablero Kanban en GitHub. Javier se encargó del modelo de datos y del backend; Fabián del frontend. Las pruebas automáticas (`npm test`) cubren la API con 228 comprobaciones sobre una base de prueba aparte.

El detalle de cada punto pedido por la evaluación está a continuación.

---

## 1. Problema que resuelve

Los artículos en buen estado que una persona ya no usa suelen terminar guardados o regalados sin ningún control. Quien los necesita no se entera, y cuando varias personas piden lo mismo no hay forma ordenada de decidir ni de dejar registro de lo que pasó.

ReUse Campus permite que cualquier integrante de la comunidad publique un artículo (donación o intercambio), que otras personas lo soliciten y que el propietario decida a quién entregarlo. El sistema impide errores típicos (pedir algo propio, pedir dos veces, pedir algo ya reservado o entregado, o dejar dos solicitudes aceptadas) y conserva el historial de cada operación.

## 2. Integrantes

| Integrante | GitHub |
|---|---|
| Javier Suarez | [javier-suarez-cloud](https://github.com/javier-suarez-cloud) |
| Fabián Díaz | [Talisk1](https://github.com/Talisk1) |

## 3. Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22 (componentes, servicios, `HttpClient`, interceptor, *guards*, formularios reactivos, *signals*) |
| Backend | Node.js 22 o superior + Express 5, `mysql2`, `cors` |
| Seguridad | `bcryptjs` (hash de contraseñas), `jsonwebtoken` (JWT de 8 horas), middleware `verificarToken` y `soloAdmin` |
| Base de datos | MySQL 8 |
| Pruebas | Pruebas automáticas propias contra la API real (`npm test`) y pruebas manuales documentadas |
| Proceso | Git, GitHub (ramas, Pull Requests), Kanban en GitHub Projects |

## 4. Arquitectura y estructura de la solución

```
Navegador (Angular, puerto 4200)
   │  HttpClient + JSON · token en el encabezado Authorization: Bearer
   ▼
API REST (Express, puerto 3000)
   │  middleware verificarToken → ruta → regla de negocio → db.query / transacción
   ▼
MySQL (base reuse_campus)
```

```
reuse-campus/
├── database/
│   └── reuse_campus.sql              Crea la base y las 4 tablas
├── backend/
│   ├── server.js                     Arranca Express, monta las rutas y los manejadores de error
│   ├── db.js                         Pool de conexiones a MySQL (lee el .env)
│   ├── seed.js                       Datos de ejemplo (npm run seed)
│   ├── .env.example                  Plantilla de variables de entorno (el .env real no se sube)
│   ├── middleware/auth.js            verificarToken (sesión) y soloAdmin (rol)
│   ├── routes/                       auth, publicaciones, solicitudes, entregas, usuarios
│   ├── utils/negocio.js              ErrorNegocio, enTransaccion y responderError
│   └── tests/                        Pruebas automáticas (npm test)
└── frontend/
    └── src/app/
        ├── app.config.ts             Router, HttpClient e interceptor
        ├── app.routes.ts             Rutas y guards
        ├── services/                 auth, publicaciones, solicitudes y entregas
        ├── interceptors/             token.interceptor.ts
        ├── guards/                   authGuard y visitanteGuard
        └── pages/                    Una carpeta por pantalla
```

## 5. Modelo de datos y relaciones

| Entidad | Campos principales | Relaciones |
|---|---|---|
| `usuarios` | id, nombre, correo (único), password (hash bcrypt), rol (`USUARIO`/`ADMINISTRADOR`), estado (`ACTIVO`/`INACTIVO`) | Propietario de publicaciones; solicitante; propietario o receptor de entregas |
| `publicaciones` | id, titulo, descripcion, categoria, modalidad (`DONACION`/`INTERCAMBIO`), estado, fecha_publicacion, usuario_id | `usuario_id` → `usuarios` (propietario, RN02) |
| `solicitudes` | id, publicacion_id, solicitante_id, mensaje, fecha_solicitud, estado | `publicacion_id` → `publicaciones` · `solicitante_id` → `usuarios` |
| `entregas` | id, publicacion_id, solicitud_id (único), propietario_id, receptor_id, fecha_acuerdo, fecha_entrega, estado | `publicacion_id` → `publicaciones` · `solicitud_id` → `solicitudes` · `propietario_id` y `receptor_id` → `usuarios` |

**Flujo de estados** (lo que ocurre en el backend):

| Paso | Qué pasa | Estados |
|---|---|---|
| 1 | Una persona publica un artículo | Publicación `DISPONIBLE` |
| 2 | Otras personas lo solicitan | Solicitudes `PENDIENTE` |
| 3 | El propietario acepta una | Solicitud `ACEPTADA`, publicación `RESERVADA`, las demás `PENDIENTE` pasan a `RECHAZADA`, se crea la entrega `PENDIENTE` |
| 4 | Se confirma la entrega | Entrega `COMPLETADA` (con fecha), publicación `ENTREGADA` |

Nada se borra: cancelar, rechazar y completar solo cambian el estado (RN17), y no hay `ON DELETE CASCADE` en la base.

## 6. Roles y permisos

| Acción | Sin sesión | Usuario | Administrador |
|---|:-:|:-:|:-:|
| Registrarse e iniciar sesión | ✅ | ✅ | ✅ |
| Ver publicaciones (listado y detalle) | | ✅ | ✅ |
| Crear una publicación (queda como propietario) | | ✅ | ✅ |
| Editar o cancelar su publicación (solo `DISPONIBLE`) | | ✅ | ✅ |
| Editar o cancelar la publicación de otra persona (moderación) | | | ✅ |
| Solicitar una publicación ajena `DISPONIBLE` | | ✅ | ✅ |
| Cancelar su propia solicitud (solo `PENDIENTE`) | | ✅ | ✅ |
| Aceptar o rechazar solicitudes de **sus** publicaciones | | ✅ (solo el propietario) | ✅ (solo si es el propietario) |
| Confirmar una entrega | | ✅ (propietario o receptor) | ✅ (si participa) |
| Ver la lista de usuarios, activar o desactivar cuentas y cambiar roles | | | ✅ |

El backend lo controla con `verificarToken` (responde 401 sin sesión válida y 403 si la cuenta está inactiva) y `soloAdmin` (403 si no es administrador). `verificarToken` **consulta la base de datos en cada petición**: toma el rol y el estado actuales del usuario, así que si un administrador desactiva una cuenta o cambia un rol, el cambio se nota de inmediato aunque el usuario conserve su token. El frontend oculta botones y protege rutas, pero la seguridad real está en el backend (RN18).

## 7. Instalación y ejecución

**Requisitos:** Node.js 22 o superior (probado con la 24) y MySQL 8 encendido.

### 1) Base de datos

Ejecutar el script `database/reuse_campus.sql` en MySQL Workbench (File → Open SQL Script → Ejecutar), o por consola:

```bash
mysql -u root -p < database/reuse_campus.sql
```

### 2) Backend

```bash
cd backend
npm install
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
# editar .env: poner la contraseña de MySQL en DB_PASSWORD y un texto largo en JWT_SECRET
npm run seed                # opcional: carga datos de ejemplo (no borra nada)
npm start                   # API en http://localhost:3000
```

### 3) Frontend

```bash
cd frontend
npm install
npm start                   # app en http://localhost:4200
```

### 4) Pruebas automáticas

```bash
cd backend
npm test                    # crea y borra una base de prueba; no toca la base real
```

### Usuarios de prueba (después de `npm run seed`)

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@reuse.cl | Admin123 |
| Usuario | ana@reuse.cl | Usuario123 |
| Usuario | beto@reuse.cl | Usuario123 |
| Usuario | carla@reuse.cl | Usuario123 |
| Usuario con cuenta **inactiva** (no puede iniciar sesión) | diego@reuse.cl | Usuario123 |

El seed carga 5 usuarios, 6 publicaciones en distintos estados, 6 solicitudes y 2 entregas (una pendiente y otra completada). Si el administrador de ejemplo ya existe, no hace nada. Un administrador propio también se puede crear cambiando el rol en MySQL: `UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE correo = '...';`.

## 8. Configuración de MySQL

La base se crea con el script `database/reuse_campus.sql` (`CREATE DATABASE reuse_campus` más las 4 tablas, con claves primarias, claves foráneas y `ENUM` para los estados). La conexión está en `backend/db.js` y toma los datos del `.env`.

### Consultas SQL de verificación (resultado real con el seed)

```sql
-- Cantidad de registros por tabla
SELECT (SELECT COUNT(*) FROM usuarios) usuarios, (SELECT COUNT(*) FROM publicaciones) publicaciones,
       (SELECT COUNT(*) FROM solicitudes) solicitudes, (SELECT COUNT(*) FROM entregas) entregas;
-- 5 | 6 | 6 | 2

-- Solicitudes con su publicación (muestra el efecto de aceptar: RESERVADA, ACEPTADA y RECHAZADA)
SELECT p.titulo, p.estado AS publicacion, u.nombre AS solicitante, s.estado AS solicitud
FROM solicitudes s JOIN publicaciones p ON p.id = s.publicacion_id JOIN usuarios u ON u.id = s.solicitante_id
ORDER BY p.id, s.id;
-- Calculadora científica Casio   | DISPONIBLE | Beto Rojas | PENDIENTE
-- Calculadora científica Casio   | DISPONIBLE | Carla Soto | PENDIENTE
-- Libro Cálculo de una variable  | RESERVADA  | Beto Rojas | ACEPTADA
-- Libro Cálculo de una variable  | RESERVADA  | Carla Soto | RECHAZADA
-- Arduino UNO con cables         | ENTREGADA  | Ana Torres | ACEPTADA
-- Kit de herramientas básico     | DISPONIBLE | Carla Soto | CANCELADA

-- Entregas con propietario y receptor
SELECT p.titulo, po.nombre AS propietario, re.nombre AS receptor, e.estado, (e.fecha_entrega IS NOT NULL) AS con_fecha
FROM entregas e JOIN publicaciones p ON p.id = e.publicacion_id
JOIN usuarios po ON po.id = e.propietario_id JOIN usuarios re ON re.id = e.receptor_id ORDER BY e.id;
-- Libro Cálculo de una variable | Ana Torres  | Beto Rojas | PENDIENTE  | 0
-- Arduino UNO con cables        | Beto Rojas  | Ana Torres | COMPLETADA | 1

-- Las contraseñas se guardan encriptadas con bcrypt (nunca en texto plano)
SELECT correo, rol, estado, LEFT(password, 7) AS inicio_hash FROM usuarios ORDER BY id;
-- admin@reuse.cl ADMINISTRADOR ACTIVO $2b$10$ · ana@reuse.cl USUARIO ACTIVO $2b$10$ · ... · diego@reuse.cl USUARIO INACTIVO $2b$10$
```

Las 7 claves foráneas del modelo (`publicaciones.usuario_id`, `solicitudes.publicacion_id`, `solicitudes.solicitante_id`, `entregas.publicacion_id`, `entregas.solicitud_id`, `entregas.propietario_id` y `entregas.receptor_id`) se comprobaron con `information_schema`.

## 9. Variables de entorno (`backend/.env.example`)

| Variable | Ejemplo | Para qué sirve |
|---|---|---|
| `DB_HOST` | `localhost` | Servidor de MySQL |
| `DB_USER` | `root` | Usuario de MySQL |
| `DB_PASSWORD` | (vacío en el ejemplo) | Contraseña de MySQL |
| `DB_NAME` | `reuse_campus` | Base de datos del proyecto |
| `JWT_SECRET` | (texto de ejemplo) | Clave para firmar los tokens: hay que cambiarla |
| `PORT` | `3000` | Puerto de la API |

El archivo `.env` real está en `.gitignore` y nunca se sube al repositorio. El `.env` se lee solo al arrancar: si se cambia, hay que reiniciar el servidor.

## 10. Principales endpoints

Todas las rutas, salvo registro, login y la raíz, exigen sesión (`Authorization: Bearer <token>`). Los errores responden `{ "mensaje": "..." }`.

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /api/auth/registro` | Público | Crea una cuenta (siempre con rol `USUARIO`) |
| `POST /api/auth/login` | Público | Devuelve el token JWT (8 horas) y los datos del usuario |
| `GET /api/publicaciones` | Con sesión | Listado con filtros `?estado=&modalidad=&categoria=&propias=1` (oculta las canceladas) |
| `GET /api/publicaciones/mias` | Con sesión | Mis publicaciones (incluye canceladas) |
| `GET /api/publicaciones/:id` | Con sesión | Detalle con el nombre del propietario |
| `POST /api/publicaciones` | Con sesión | Crear publicación (RN01, RN02) |
| `PUT /api/publicaciones/:id` | Propietario o admin | Editar (solo si está `DISPONIBLE`) |
| `PATCH /api/publicaciones/:id/cancelar` | Propietario o admin | Cancelar sin borrar (RN17) |
| `POST /api/solicitudes` | Con sesión | Solicitar una publicación (`publicacion_id`, `mensaje`) |
| `GET /api/solicitudes/mias` | Con sesión | Solicitudes que hice |
| `GET /api/solicitudes/recibidas` | Con sesión | Solicitudes que llegaron a mis publicaciones (`?estado=`, `?publicacion_id=`) |
| `PATCH /api/solicitudes/:id/cancelar` | Solo el solicitante | Cancelar mi solicitud (RN16) |
| `PATCH /api/solicitudes/:id/aceptar` | Solo el propietario | Aceptar: reserva, rechaza las demás y crea la entrega (transacción) |
| `PATCH /api/solicitudes/:id/rechazar` | Solo el propietario | Rechazar una solicitud pendiente |
| `GET /api/entregas/mias` | Con sesión | Mis entregas, con `mi_rol` (`PROPIETARIO` o `RECEPTOR`) |
| `PATCH /api/entregas/:id/confirmar` | Propietario o receptor | Completar la entrega y dejar la publicación `ENTREGADA` (transacción) |
| `GET /api/usuarios` | Admin | Lista de usuarios (`?rol=`, `?estado=`; nunca devuelve contraseñas) |
| `PATCH /api/usuarios/:id/estado` | Admin | Activar o desactivar una cuenta |
| `PATCH /api/usuarios/:id/rol` | Admin | Cambiar el rol de un usuario |

### Reglas de negocio implementadas

| Regla | Qué dice | Dónde está | Respuesta si no se cumple |
|---|---|---|---|
| RN01 | Solo un usuario autenticado crea publicaciones | `router.use(verificarToken)` en `routes/publicaciones.js` | 401 |
| RN02 | Cada publicación pertenece a un único propietario | El `usuario_id` sale del token, nunca del cuerpo; clave foránea | — |
| RN03 | El propietario no puede solicitar su propia publicación | `routes/solicitudes.js` (POST) | 403 |
| RN04 | Solo se solicitan publicaciones `DISPONIBLES` | `routes/solicitudes.js` (POST) | 409 |
| RN05 | Sin dos solicitudes `PENDIENTES` del mismo usuario sobre la misma publicación | POST de solicitudes (transacción con `FOR UPDATE`) | 409 |
| RN06 | Varias solicitudes mientras esté `DISPONIBLE` | POST de solicitudes: no hay límite por publicación | — |
| RN07 | Solo el propietario acepta o rechaza | `aceptar` y `rechazar` comparan el propietario con el token | 403 |
| RN08 | Solo una solicitud `ACEPTADA` por publicación | `aceptar`: exige `DISPONIBLE` y bloquea la fila | 409 |
| RN09 | Al aceptar, la publicación pasa a `RESERVADA` | `aceptar` (misma transacción) | — |
| RN10 | Al aceptar, las demás `PENDIENTES` pasan a `RECHAZADA` | `aceptar` (`UPDATE ... id <> ?`) | — |
| RN11 | Aceptar genera una entrega `PENDIENTE` | `aceptar` (INSERT en `entregas`) | — |
| RN12 | Una `RESERVADA` no recibe solicitudes | POST de solicitudes | 409 |
| RN13 | `DISPONIBLE` no pasa directo a `ENTREGADA` | `confirmar` exige `RESERVADA`; ninguna ruta pone `ENTREGADA` | 409 |
| RN14 | Al confirmar, la publicación pasa a `ENTREGADA` | `confirmar` (misma transacción) | — |
| RN15 | Una `ENTREGADA` no recibe solicitudes | POST de solicitudes | 409 |
| RN16 | Cancelar solo mientras esté `PENDIENTE` | `routes/solicitudes.js` (cancelar) | 409 |
| RN17 | El historial no se elimina | No existe ningún `DELETE`; solo cambian los estados | — |
| RN18 | Las operaciones sensibles se validan en el backend | Todos los 401, 403, 404 y 409 están en las rutas y en `middleware/auth.js` | 401 / 403 / 409 |

## 11. Pantallas del frontend

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/` | Inicio | Todos |
| `/login`, `/registro` | Iniciar sesión y registrarse | Solo sin sesión |
| `/publicaciones` | Listado con filtros | Con sesión |
| `/publicaciones/nueva` y `/publicaciones/:id/editar` | Formulario de publicación | Con sesión (editar: propietario o administrador) |
| `/publicaciones/:id` | Detalle, solicitar, editar y cancelar | Con sesión |
| `/solicitudes/mias` | Mis solicitudes y cancelar | Con sesión |
| `/solicitudes/recibidas` | Solicitudes de mis publicaciones, aceptar y rechazar | Con sesión |
| `/entregas` | Mis entregas y confirmar | Con sesión |
| `/admin/usuarios` | Administración de usuarios: lista con filtros por rol y estado, activar o desactivar cuentas y cambiar roles (con confirmación), usando `/api/usuarios` | Solo administrador (`adminGuard`); en la fila de su propia cuenta no aparecen los botones |

La barra de navegación cambia según la sesión y muestra la etiqueta "Admin" para los administradores. Los errores del backend se muestran con su `{ mensaje }`, y si no hay conexión aparece un aviso para revisar que el backend esté encendido.

## 12. Metodología Kanban y distribución del trabajo

Tablero: [ReUse Campus Kanban](https://github.com/users/javier-suarez-cloud/projects/3), con una tarea (issue) por etapa y las reglas de negocio dentro de cada una.

| Issue | Tarea | Responsable | Pull Request |
|---|---|---|---|
| #1 | Modelo de datos MySQL con 4 entidades relacionadas | Javier | Commit directo a `main` (17-nov) |
| #2 | Backend base: Express, `db.js`, registro y login con hash y JWT | Javier | Commit directo a `main` (17-nov) |
| #3 | Frontend base: Angular, rutas, menú y autenticación | Fabián | #11 |
| #4 | Publicaciones: CRUD (back y front) | Javier (back) y Fabián (front) | #12 y #14 |
| #5 | Solicitudes: crear y cancelar | Javier (back) y Fabián (front) | #15 y #18 |
| #6 | Aceptar y rechazar con transacción | Javier (back) y Fabián (front) | #16 y #19 |
| #7 | Confirmar entrega y cierre de la publicación | Javier (back) y Fabián (front) | #17 y #20 |
| #8 | Roles, errores y validaciones | Javier (back) y Fabián (front) | #21 (back) y #24 (front) |
| #9 | Pruebas de reglas y situaciones inválidas documentadas | Javier (automáticas) y Fabián (manuales) | #22 (automáticas) y #25 (manuales) |
| #10 | README, bitácora y declaración de uso de IA | Ambos | #23 y este documento (falta completar las filas de revisión de cada declaración de IA) |

**Flujo de trabajo:** cada tarea en su propia rama (`feature/...`) creada desde `main` actualizado → commits → Pull Request hacia `main` → merge con *Create a merge commit* (para conservar los commits de cada integrante). Los dos primeros commits (el modelo de datos y el backend base) se subieron directo a `main` para dejar el repositorio inicial; desde ahí se trabajó con ramas y Pull Requests.

### Bitácora

| Día | Avance |
|---|---|
| Mar 17-nov | Modelo de datos en MySQL, backend base, registro y login con hash y JWT. Repositorio público, issues y tablero Kanban |
| Mié 18-nov | API de publicaciones (Javier) y frontend base con autenticación (Fabián); pantallas de publicaciones |
| Jue 19-nov | Solicitudes, aceptar y rechazar con transacción y entregas en el backend (Javier); pantallas de solicitudes, recibidas y entregas (Fabián) |
| Vie 20-nov | Rutas de administrador, sesión validada en la base y errores en JSON; pruebas automáticas (`npm test`) y seed; este README (Javier). Pantalla de administración de usuarios y tabla de pruebas manuales en el navegador (Fabián) |

## 13. Aportes de cada integrante

| Javier Suarez | Fabián Díaz |
|---|---|
| Modelo de datos MySQL y proyecto del backend (`db.js`, `.env`, `server.js`) | Proyecto Angular: rutas, menú, `AuthService`, interceptor, *guards*, login y registro |
| Registro y login con hash y JWT; middleware de sesión y roles | Pantallas de publicaciones: listado, detalle, formulario, editar y cancelar |
| API de publicaciones con sus reglas (RN01, RN02, RN17, RN18) | Pantallas de solicitudes: solicitar, Mis solicitudes, Recibidas, aceptar y rechazar |
| Solicitudes, aceptar y rechazar con transacción y bloqueo de filas (RN03 a RN12, RN16) | Pantalla de entregas y confirmar entrega |
| Entregas y confirmación (RN13 a RN15) | Pantalla de administración de usuarios, con *guard* de rol (`adminGuard`) |
| Administración de usuarios, manejo de errores, seed, pruebas automáticas y README | Tabla de pruebas manuales en el navegador (ejecutadas con Claude controlando el navegador, a pedido suyo) |

## 14. Pruebas realizadas

### Pruebas automáticas

Se ejecutan con `cd backend && npm test`. El ejecutor crea una base de prueba (`reuse_campus_test`) a partir de `database/reuse_campus.sql`, enciende el servidor en el puerto 3077, corre cada archivo sobre una base vacía y al final borra la base de prueba. Las pruebas llaman a la **API real** (no a funciones sueltas) y revisan el resultado en MySQL; se niegan a correr si la base no termina en `_test`, para no tocar nunca los datos reales.

| Archivo | Qué comprueba | Comprobaciones |
|---|---|---|
| `01-publicaciones.js` | Listado y filtros, detalle, crear, editar y cancelar; RN01, RN02, RN17, RN18; 401, 400, 403, 404 y 409 | 42 |
| `02-solicitudes.js` | RN03 a RN06, RN12, RN15, RN16; 6 solicitudes simultáneas del mismo usuario (1 creada y 5 con 409) | 36 |
| `03-aceptar-rechazar.js` | RN07 a RN11; 3 aceptaciones simultáneas (1 con 200 y 2 con 409); un fallo forzado que demuestra el *rollback* | 41 |
| `04-entregas-flujo-completo.js` | El flujo completo del enunciado; RN13 a RN15; historial sin `DELETE` (RN17); 2 confirmaciones simultáneas | 33 |
| `05-usuarios-administrador.js` | Solo el administrador ve y modifica usuarios; desactivar una cuenta y cambiar un rol se notan de inmediato; nadie se modifica a sí mismo | 34 |
| `06-errores-y-sesion.js` | Token inventado, vencido, alterado o de un usuario inexistente; JSON mal escrito; rutas inexistentes; datos incompletos o inválidos; todos los errores traen `{ mensaje }` | 26 |
| `07` y `08-persistencia-parte-a/b.js` | Se crean datos, **se reinicia el servidor** y se comprueba que siguen en MySQL | 4 |
| `09-seed-datos-de-ejemplo.js` | `npm run seed` carga los datos, se pueden usar y no se duplican al repetirlo | 12 |
| **Total** | | **228, todas correctas** |

### Pruebas manuales en el navegador

Pruebas pedidas por el enunciado. Se hicieron el 20-nov con el backend y el frontend encendidos y los datos de `npm run seed`. **Las ejecutó Claude, a pedido de Fabián, controlando el navegador integrado** (Fabián no las hizo con sus propias manos). Cuando una prueba dice "API forzada", se llamó a la API directamente con el token de ese usuario para comprobar que el backend también la rechaza. Las comprobaciones de estado se revisaron además en MySQL.

**Límite de estas pruebas:** el navegador integrado no puede mostrar ni responder los diálogos nativos `confirm()`. Por eso, en las pruebas que piden confirmación (aceptar, rechazar, confirmar entrega, administración de usuarios), la respuesta del diálogo se **simuló** y se comprobó que se invoca con el texto correcto. El único diálogo que se probó **real** es el de cancelar una solicitud (ver su fila), con un Chrome controlado por código; los demás usan el mismo `confirm()` del navegador pero no se repitió la prueba real en cada uno.

| Prueba | Resultado esperado | Resultado |
|---|---|---|
| Login con datos correctos y con contraseña incorrecta | Entra a la aplicación / mensaje "Correo o contraseña incorrectos" | ✅ Con contraseña incorrecta (`admin@reuse.cl`): aparece "Correo o contraseña incorrectos" y no se guarda la sesión. Con la correcta: entra a `/publicaciones` y el menú muestra el nombre y el enlace "Usuarios" |
| Usuario normal intenta entrar a la administración de usuarios | No ve la opción; si fuerza la API, 403 | ✅ Con `ana@reuse.cl` (USUARIO): el menú no muestra "Usuarios"; entrar a `/admin/usuarios` lo redirige a `/publicaciones`; API forzada `GET /api/usuarios`: 403 "No tienes permiso para esta operación". *(Esta pantalla está en el PR #24; la prueba se hizo con esa rama)* |
| Solicitar la publicación propia | No aparece el botón; si fuerza la API, 403 | ✅ `ana@reuse.cl` en su publicación n.º 5: no aparece el formulario "Solicitar" (ve Editar y Cancelar). API forzada `POST /api/solicitudes`: 403 "No puedes solicitar tu propia publicación" |
| Solicitar dos veces la misma publicación | Mensaje de error del backend (409) | ✅ `beto@reuse.cl` ya tenía una solicitud pendiente sobre la publicación n.º 5; al pulsar "Solicitar" de nuevo aparece "Ya tienes una solicitud pendiente sobre esta publicación". Nota: la pantalla igual muestra el formulario (no sabe que ya hay una pendiente); quien la rechaza es el backend |
| Solicitar una publicación `RESERVADA`, `ENTREGADA` o `CANCELADA` | No se puede solicitar | ✅ Vistas por un usuario que no es el propietario, las tres publicaciones (n.º 6 `RESERVADA`, n.º 7 `ENTREGADA`, n.º 9 `CANCELADA`) no muestran el formulario "Solicitar". API forzada: 409 "Solo se pueden solicitar publicaciones DISPONIBLES (esta está RESERVADA / ENTREGADA / CANCELADA)" en cada caso |
| Aceptar una solicitud | La otra pasa a `RECHAZADA`, la publicación a `RESERVADA` y se crea la entrega | ✅ `ana@reuse.cl` aceptó la solicitud de Beto sobre la publicación n.º 5 (Carla también estaba pendiente): Carla quedó `RECHAZADA`, la publicación `RESERVADA` y se creó la entrega `PENDIENTE` (verificado en MySQL). Diálogo de confirmación simulado |
| Confirmar la entrega | Entrega `COMPLETADA` y publicación `ENTREGADA` | ✅ `beto@reuse.cl` (receptor) confirmó la entrega: quedó `COMPLETADA` con fecha de entrega y la publicación `ENTREGADA` (verificado en MySQL). Diálogo de confirmación simulado |
| Cancelar una solicitud `PENDIENTE` (con el diálogo de confirmación) | Pasa a `CANCELADA` | ✅ Probado con el **diálogo nativo real** en un Chrome controlado por código (no a mano). `carla@reuse.cl` tenía una solicitud `PENDIENTE` sobre la publicación n.º 10 y pulsó "Cancelar solicitud": apareció un `confirm` con el texto "¿Seguro que quieres cancelar esta solicitud?". Al pulsar **Cancelar** en el diálogo, la solicitud siguió `PENDIENTE` y no apareció ningún mensaje. Al repetirlo y pulsar **Aceptar**, pasó a `CANCELADA` y apareció "Solicitud cancelada correctamente". *Pendiente solo si el profesor pide verlo con las manos de un integrante en un navegador normal* |
| Formulario con datos incompletos o inválidos | Mensajes de validación | ✅ "Nueva publicación" vacía: 3 mensajes (título, descripción y categoría obligatorios) y no se envía. Registro con correo inválido, contraseña de 3 caracteres y confirmación distinta: 4 mensajes (nombre obligatorio, formato de correo, mínimo 6 caracteres y "Las contraseñas no coinciden") y no se envía |
| Persistencia: reiniciar el backend y recargar la pantalla | Los datos siguen | ✅ Se anotó el listado de 7 publicaciones con sus estados, se apagó y volvió a encender el backend y se recargó la pantalla: el listado quedó idéntico y la sesión siguió válida |
| Error de comunicación: apagar el backend y abrir una pantalla | Aviso de que no se pudo conectar con el servidor | ✅ Con el backend apagado, "Mis solicitudes" y el login muestran "No se pudo conectar con el servidor. Revisa que el backend esté encendido." |

## 15. Problemas encontrados y cómo se resolvieron

| Problema | Solución |
|---|---|
| El servidor respondía `Access denied ... (using password: NO)` | Había arrancado antes de guardar el `.env`, que se lee solo al arrancar. Se reinició el servidor |
| En Express 5, `req.body` es `undefined` si la petición llega sin cuerpo, y login y registro respondían 500 mostrando el detalle interno | Se usa `req.body ?? {}`; ahora responden 400. Además, un manejador de errores global responde 400, 404 y 500 en JSON |
| El rol dentro del token podía quedar desactualizado, y una cuenta desactivada seguía funcionando hasta que vencía el token | `verificarToken` consulta la base en cada petición y toma el rol y el estado actuales |
| Dos solicitudes simultáneas podían duplicar una `PENDIENTE` o dejar dos `ACEPTADAS` | Transacciones con `SELECT ... FOR UPDATE` y bloqueo siempre en el mismo orden. Se comprobó con pruebas de concurrencia |
| El backend de publicaciones se escribió dos veces (dos Pull Requests con el mismo archivo) | Se dejó una sola versión y el Pull Request del frontend se rehízo sin el backend duplicado |
| En los Pull Requests apilados, la base de los dos últimos seguía apuntando a la rama anterior | Se cambió la base de cada uno a `main` antes de fusionar |
| En Windows, al terminar las pruebas Node cortaba el proceso con un error de `libuv` | El ejecutor espera un instante antes de salir |
| Varios commits quedaron con la misma hora (se hicieron seguidos al terminar cada pieza) | No se modificaron las fechas: es el historial real |

## 16. Declaración de uso de Inteligencia Artificial

Se usó IA durante el desarrollo, de forma declarada y permitida por la evaluación. En ambos casos la IA **escribió el código**; cada integrante debe poder explicarlo y modificarlo.

| Elemento | Javier Suarez |
| --- | --- |
| Herramienta | Claude (Anthropic), usado a través de Claude Code |
| Uso | Claude escribió, a pedido de Javier, el script SQL, todo el backend (`backend/`), las pruebas automáticas, el seed, este README y una guía de estudio. También hizo los commits, las ramas, los Pull Requests y los merges, usando la sesión de GitHub de Javier, y explicó el código a medida que lo escribía |
| Parte afectada | `database/reuse_campus.sql`, `backend/server.js`, `db.js`, `seed.js`, `routes/`, `middleware/`, `utils/` y `tests/`, además de la configuración del repositorio, los issues y el tablero |
| Revisión del estudiante | Definió qué se debía construir (el enunciado y los issues), ejecutó el SQL, creó su `.env`, levantó el servidor y probó el registro y el login. **(Javier debe completar o ajustar esta fila con lo que realmente revisó y probó: por ejemplo, el recorrido del flujo con su base real y la lectura del código.)** Las pruebas automáticas fueron ejecutadas por Claude |

| Elemento | Fabián Díaz |
| --- | --- |
| Herramienta | Claude (Anthropic), usado a través de Claude Code, según lo informado por Fabián |
| Uso | Según Fabián, el frontend (proyecto Angular, autenticación, pantallas de publicaciones, solicitudes y entregas) se hizo con apoyo de Claude, que escribió el código y lo probó contra el backend con MySQL (ver sección 14) |
| Parte afectada | `frontend/` completo |
| Revisión del estudiante | **Lo que hizo Fabián:** (1) le pidió a Claude, paso a paso, cada pieza del frontend (proyecto Angular, autenticación, publicaciones, solicitudes, entregas y administración de usuarios); (2) rehízo su Pull Request #13 sin el backend duplicado, solo con el frontend (#14), siguiendo la indicación de Javier; (3) aplicó la indicación de que Editar y Cancelar los vea el propietario o un administrador; (4) pidió quitar la etiqueta `Co-Authored-By` de `main`, con el acuerdo de Javier; (5) facilitó su MySQL local para que se probara contra el backend real; (6) revisó los resultados que Claude le fue mostrando (estados en pantalla y en la base, mensajes de error); (7) estudia el código con la guía de estudio para la interrogación. **Lo que hizo Claude:** escribió todo el código del frontend y ejecutó las pruebas de la sección 14. **Lo que Fabián no hizo:** no leyó el código antes de entregar los Pull Requests y no ejecutó él mismo las pruebas con el mouse |

**Nota sobre el historial.** Los commits de Fabián incluían originalmente la etiqueta `Co-Authored-By` de Claude. Después de fusionar los primeros Pull Requests, Fabián reescribió `main` para quitarla (el contenido del código no cambió). Esa etiqueta sigue visible en las ramas antiguas de los Pull Requests. La declaración de esta sección es el registro del uso de IA, y no depende de esas etiquetas.

Todo el código entregado es responsabilidad de ambos integrantes, incluido el desarrollado con apoyo de IA.
