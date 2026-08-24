# Mi Garaje

Gestión personal de vehículos: mantenimientos, repostajes, gastos y vencimientos, en una
aplicación web instalable que funciona sin conexión y guarda los datos en tu propio
dispositivo.

> **Estado: fase 2 de 7 completada.** Funcionan el panel principal, el alta y edición de
> vehículos con foto, y el registro de kilómetros con validación. Los mantenimientos y sus
> vencimientos llegan en la fase 3.

## Arranque

```bash
npm install && npm run dev
```

No hay servicios externos, ni claves de API, ni contenedores, ni base de datos que levantar.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm test` | Tests (Vitest) |
| `npm run test:watch` | Tests en modo continuo |
| `npm run typecheck` | Comprobación de tipos |
| `npm run build` | Comprueba tipos y compila a `dist/` |
| `npm run preview` | Sirve `dist/` para probar la PWA compilada |
| `npm run iconos` | Regenera los PNG del manifest |

Para probarla en el móvil desde la misma red WiFi: `npm run dev -- --host` y abre la IP que
imprime. Ten en cuenta que sin HTTPS el navegador no permite instalar la PWA ni usar
notificaciones; para eso, `npm run build && npm run preview` y un túnel, o desplegarla.

---

## Stack y por qué

| Pieza | Elección | Motivo |
| --- | --- | --- |
| Build | **Vite 8** | Arranque instantáneo, HMR, y `vite-plugin-pwa` genera el service worker con Workbox sin escribirlo a mano. |
| UI | **React 19 + TypeScript estricto** | Es lo que mejor conozco para una app con muchos formularios y estado derivado. Nada del modelo de datos depende de React: vive en `src/dominio`, que es TypeScript puro. |
| Datos | **IndexedDB con Dexie 4** | Ver más abajo. |
| Reactividad de datos | **`dexie-react-hooks`** | `useLiveQuery` vuelve a ejecutar la consulta cuando cambia la tabla implicada. Elimina la necesidad de una capa de estado global (Redux, Zustand): la base de datos *es* el estado. |
| Fechas | **date-fns** | Solo se usa para lo que de verdad es difícil (sumar meses recortando al último día válido, contar días naturales cruzando el cambio de hora). El resto son cadenas `'YYYY-MM-DD'`. |
| Gráficas | **Recharts** | Declarativo, se integra con React sin envoltorios, y acepta colores por variable CSS para respetar el tema. |
| Tests | **Vitest + fake-indexeddb** | Comparte configuración con Vite. `fake-indexeddb` permite probar el repositorio de verdad, no un doble. |
| Estilos | **CSS plano con variables** | Sin Tailwind ni CSS-in-JS. La app tiene que tener carácter propio y dos temas; un sistema de *tokens* en `:root` lo consigue con menos capas y sin coste en el bundle. |

### Por qué no hay servidor ni SQLite

El planteamiento inicial pedía funcionamiento sin conexión con almacenamiento local **y**
una base de datos embebida tipo SQLite. Las dos cosas a la vez significan dos copias de la
verdad y, por tanto, un motor de sincronización con resolución de conflictos: la parte más
cara y más frágil de todo el proyecto, existiendo para un solo usuario en un solo
dispositivo.

Así que **IndexedDB es la única fuente de verdad**. Consecuencias, con lo bueno y lo malo:

- ✅ Sin conexión no es una función añadida: es el modo normal de funcionamiento.
- ✅ Un solo comando para arrancar. Nada que administrar.
- ✅ Los datos no salen del dispositivo.
- ⚠️ **No hay sincronización entre móvil y ordenador.** Se pasan exportando e importando
  JSON (fase 7).
- ⚠️ **Hay que hacer copias de seguridad.** Si borras los datos del navegador, se van. La
  fase 7 incluirá un recordatorio periódico de exportación.

Si algún día hace falta un backend, la capa de datos ya está preparada: toda la aplicación
habla con la interfaz `Repositorio` (`src/datos/repositorio.ts`), nunca con Dexie
directamente, y `EntidadBase` ya reserva `propietarioId` y `borradoEn`. Añadir usuarios
sería escribir una segunda implementación de esa interfaz, no rediseñar el esquema.

### Sobre las notificaciones

No existe hoy una API de navegador fiable para «avísame dentro de 30 días» con la
aplicación cerrada: la *Notification Triggers API* está descartada en Chrome y nunca existió
en Safari, y las push reales necesitan un servidor que las empuje. Por eso la fase 5
implementará **dos vías**:

1. Notificaciones locales al abrir la app o poco después de cerrarla (*best-effort*).
2. **Exportación de los vencimientos a `.ics`**, para que Google Calendar o Apple Calendario
   se encarguen del recordatorio. Esta es la que de verdad va a avisarte.

### Sobre el tipado

`strict: true` más `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters` y
`verbatimModuleSyntax`.

`exactOptionalPropertyTypes` queda deliberadamente **desactivado**: obliga a distinguir
entre «propiedad ausente» y «propiedad con valor `undefined`», algo que los formularios
producen continuamente y que aquí solo generaría ruido sin cazar ningún error real.

---

## Arquitectura

```
src/
├── dominio/     TypeScript puro, sin React ni Dexie. El corazón de la app.
│   ├── tipos.ts       Modelo de datos completo
│   ├── dinero.ts      Aritmética en céntimos enteros
│   ├── fechas.ts      Fechas civiles 'YYYY-MM-DD' sin zonas horarias
│   ├── formato.ts     Formato y lectura de números en español
│   ├── catalogos.ts   Etiquetas y valores por defecto de cada enumerado
│   └── ids.ts         UUID v4
│   ├── odometro.ts    Estimación de kilometraje e interpolación
│   └── validacion.ts  Reglas de entrada: errores frente a avisos
├── datos/       Persistencia.
│   ├── db.ts               Esquema, índices y migraciones de IndexedDB
│   ├── repositorio.ts      Interfaz: el único contrato que ve la interfaz
│   ├── repositorioDexie.ts Implementación sobre Dexie
│   ├── acciones.ts         Escrituras que abarcan varias tablas
│   ├── imagenes.ts         Recompresión de fotos antes de guardarlas
│   └── semilla.ts          Datos de ejemplo
├── ui/          React.
│   ├── layout/        Armazón y navegación
│   ├── paginas/       Panel, lista, ficha, formulario, ajustes
│   ├── componentes/   Campos, botones, hoja modal
│   └── ganchos/       Consultas reactivas sobre Dexie
└── estilos/     Tokens de diseño, reinicio y piezas compartidas.
```

La regla es que las dependencias apuntan hacia dentro: `ui` → `datos` → `dominio`. El
dominio no sabe que existe una base de datos, y por eso se puede probar sin montar nada.

### Tres decisiones que explican casi todo el código

**1. El dinero se guarda en céntimos enteros.** Nunca en euros con decimales. La app suma
cientos de importes para calcular el coste por kilómetro y `0.1 + 0.2 !== 0.3`; con coma
flotante el error se acumula hasta hacerse visible. Ver `src/dominio/dinero.ts`, donde
además se corrige el caso `1.005 * 100 = 100.49999999999999`.

**2. Las fechas sin hora son cadenas `'YYYY-MM-DD'`.** Un repostaje ocurre «el 14 de marzo»,
no «el 14 de marzo a las 00:00 UTC». Además, `new Date('2026-03-14')` se interpreta como
medianoche UTC y devuelve el día anterior al oeste de Greenwich; en `src/dominio/fechas.ts`
todas las conversiones van por componentes locales.

**3. El kilometraje actual no es un campo.** Se deriva del histórico de lecturas del
odómetro. Un campo `kmActual` mutable se desincroniza en cuanto registras un repostaje con
fecha atrasada. `Repositorio.puntosOdometro()` unifica las lecturas manuales con los
kilómetros anotados en repostajes, mantenimientos y gastos, y devuelve una serie ordenada.

### Estimación de kilometraje

`estimarKm()` parte de la última lectura real y extrapola con el ritmo de uso del **último
año**, no del histórico completo: quien hacía 30.000 km al año yendo a la oficina hace 6.000
desde que teletrabaja, y la media de siempre seguiría prometiendo kilómetros que ya no
recorre.

La cifra viaja siempre acompañada de su procedencia. Si se ha extrapolado, la interfaz la
marca con «≈» y dice de cuándo es la última lectura; si coincide con una lectura real, no.
Un número inventado sin decir que es inventado acabaría copiado en el formulario del taller.

Un vehículo vendido se congela en los kilómetros de la entrega: no tiene sentido estimar
cuánto ha rodado desde que dejó de ser tuyo.

### Errores frente a avisos

`src/dominio/validacion.ts` distingue dos gravedades, y la diferencia es de producto, no
técnica:

- **Error**: no se puede guardar. Kilómetros negativos, fecha imposible, un vehículo vendido
  sin fecha de venta.
- **Aviso**: se puede guardar, pero hay que confirmarlo. El caso central es el odómetro que
  retrocede. Casi siempre es un dedazo, pero a veces es real —cuadro sustituido, avería del
  cuentakilómetros— y la app no puede impedirte registrar lo que de verdad marca tu coche.
  Lo que no puede hacer es tragárselo en silencio.

Los mensajes dan las cifras concretas («el registro del 21/08 ya marcaba 125.423 km, estás
anotando 1000 km menos») en vez de un «revisa el valor» que obliga a ir a buscarlo.

Dos decisiones de formulario que se derivan de esto: los campos no enseñan incidencias hasta
que se tocan o se intenta guardar —un formulario recién abierto no está lleno de errores en
rojo—, y **el botón de guardar nunca se deshabilita**. Un botón apagado no explica qué falta;
es mejor dejar pulsar y contestar señalando los campos.

### Modelo de datos

| Entidad | Notas |
| --- | --- |
| `Vehiculo` | Incluye `categoria` (turismo, autocaravana, furgoneta, moto) y `estado: 'activo' \| 'vendido'` con fecha, kilómetros y precio de venta. Un vehículo vendido se congela: no genera avisos ni cuenta en el gasto corriente, pero conserva su histórico. |
| `LecturaOdometro` | Solo lecturas manuales, de alta y de venta. Los kilómetros de otros registros se unen al leer, no se copian. |
| `Mantenimiento` | Tipo, fecha, km, taller, coste, piezas, notas y adjuntos. |
| `ReglaMantenimiento` | Recurrencia doble `cadaKm` / `cadaMeses`, por vehículo. Las plantillas de partida salen de la categoría, no del combustible: ver más abajo. |
| `Repostaje` | `cantidad` + `unidad` (`'l'` o `'kWh'`), lo que resuelve los eléctricos sin duplicar entidades. Guarda `depositoLleno` y `rupturaSerie` porque sin eso el consumo no se puede calcular bien. |
| `Gasto` | Categoría, importe, fecha, recurrencia y periodicidad. |
| `Documento` | Unión discriminada por `tipo`: el seguro tiene compañía y cobertura, la ITV tiene estación y resultado. |
| `Adjunto` | `Blob` en su propia tabla, para que consultar gastos no arrastre megabytes de imagen. |
| `Ajustes` | Registro único con tema, antelaciones de aviso y preferencias. |

**Precio por unidad derivado.** Un repostaje guarda `cantidad` e `importeCentimos`; el
precio por litro se calcula. Así los tres números no pueden contradecirse entre sí. En el
formulario, rellenar dos calcula el tercero.

**Céntimos y decimales por campo.** El precio del carburante lleva **tres** decimales
(1,589 €/l) y el importe dos. Por eso `parsearDecimal` recibe cuántos decimales admite el
campo: sin ese dato, «1,589» se leería como mil quinientos ochenta y nueve euros.

**La categoría del vehículo manda sobre las recurrencias.** Una autocaravana hace 5.000 km
al año: una regla de «aceite cada 15.000 km» tardaría tres años en dispararse mientras el
aceite se degrada igual en el garaje. Por eso sus plantillas se apoyan en el tiempo, sus
neumáticos caducan a los seis años aunque tengan dibujo, y tiene dos mantenimientos que no
existen en un turismo: el **sellado del techo** (anual; una filtración sin detectar pudre la
célula) y la **instalación de gas** (revisión obligatoria cada cinco años). Una moto, en el
sentido contrario, cambia aceite cada 6.000 km. Ser eléctrico anula el aceite y la
distribución sea cual sea la categoría.

## Datos de ejemplo

La primera vez que se abre la app se cargan cuatro vehículos. No son decorativos: cada uno
ejercita un camino distinto del código, y las fechas se calculan a partir de *hoy*.

- **El Golf** (Volkswagen, diésel) — 34 repostajes, mantenimientos, seguro e ITV. Incluye
  repostajes parciales, una ruptura de serie y una subida sostenida de consumo al final.
  Tiene la ITV **caducada**, el seguro venciendo en tres semanas y el impuesto lejos: el
  panel principal tendrá rojo, ámbar y verde desde el primer momento.
- **La Zoe** (Renault, eléctrico) — carga en kWh, con precios que van de 0,09 €/kWh en casa
  a 0,59 €/kWh en un cargador rápido. Sin reglas de aceite ni de distribución.
- **La Autocaravana** (Benimar sobre Fiat Ducato) — 5.000 km al año en nueve repostajes,
  el patrón que hace inútiles las reglas por kilómetros. Tiene el **sellado del techo
  caducado**, que es el aviso que más caro sale ignorar.
- **El Ibiza** (SEAT, gasolina) — **vendido**: histórico congelado y sin avisos.

Los kilómetros de mantenimientos y lecturas se interpolan sobre la serie de repostajes, no
se escriben a mano; si no, al moverse el calendario el odómetro acabaría yendo hacia atrás.

## Tests

142 tests, centrados en lo que puede fallar en silencio: aritmética de céntimos, fechas
cruzando cambios de hora y años bisiestos, lectura de números en formato español, estimación
de kilometraje (ventana de uso, odómetros que retroceden, lecturas con fecha futura,
vehículos vendidos), validación de entradas, integridad del repositorio (cascadas, adjuntos
huérfanos, orden del odómetro), coherencia de los catálogos y de los datos de ejemplo.

```bash
npm test
```

## Plan de trabajo

- [x] **Fase 1** — Estructura, stack, modelo de datos y datos de ejemplo
- [x] **Fase 2** — CRUD de vehículos, registro de kilómetros y panel principal
- [ ] **Fase 3** — Mantenimientos y motor de cálculo de vencimientos
- [ ] **Fase 4** — Repostajes y gastos, con consumo y coste por kilómetro
- [ ] **Fase 5** — Documentos, adjuntos y avisos (notificaciones + `.ics`)
- [ ] **Fase 6** — Analíticas y gráficas
- [ ] **Fase 7** — PWA completa: offline, instalable, exportación e importación

## Fuera de alcance

No se implementan, aunque el código queda preparado: multiusuario, integración con APIs de
tráfico o talleres, OCR de facturas, seguimiento por GPS y app nativa.
