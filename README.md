# Mi Garaje

Gestión personal de vehículos: mantenimientos, repostajes, gastos y vencimientos, en una
aplicación web instalable que funciona sin conexión y guarda los datos en tu propio
dispositivo.

> **Estado: fase 5 de 7 completada.** Funcionan el panel con semáforo y consumo real, los
> vehículos, kilómetros, mantenimientos con recurrencias, repostajes, gastos, documentos con
> adjuntos, la agenda de vencimientos y la exportación al calendario. Faltan las gráficas y
> la exportación completa de datos.

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
en Safari, y las push reales necesitan un servidor que las empuje. Por eso hay **dos vías**,
y la app dice con todas las letras lo que hace cada una:

1. **Notificaciones al abrir la app.** Útiles —te enteras de la ITV caducada nada más
   entrar— pero nada más. Como mucho tres a la vez y una vez al día por aviso: cinco
   notificaciones de golpe se descartan enteras sin leerlas, y repetir el mismo aviso cada
   vez que abres la app es la forma más rápida de que acaben bloqueadas.
2. **Exportación a `.ics`**, que es la que de verdad avisa. El archivo lleva un `VALARM` por
   cita con su antelación, y un UID estable para que reimportarlo actualice en lugar de
   duplicar.

El generador de `.ics` cumple el RFC 5545 en los detalles que rompen los clientes: CRLF
obligatorio (con LF a secas, Outlook no abre el archivo), plegado de líneas **a 75 octetos y
no a 75 caracteres** —cada vocal acentuada ocupa dos bytes en UTF-8— sin partir nunca un
carácter multibyte, y `DTEND` exclusivo en los eventos de día completo.

Al calendario solo van los vencimientos **con fecha**. Un mantenimiento que vence a los
140.000 km no se puede poner en una agenda: nadie sabe qué día llegarás. Y tampoco va lo que
no se ha registrado nunca, que llenaría el calendario de citas inventadas.

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
│   ├── vencimientos.ts Motor de vencimientos y semáforo
│   ├── consumo.ts     Consumo real de lleno a lleno
│   ├── costes.ts      Coste por kilómetro y de propiedad
│   ├── calendario.ts  Agenda futura y exportación a .ics
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
│   ├── paginas/       Panel, ficha, mantenimientos, repostajes, gastos, reglas
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

### Motor de vencimientos

`src/dominio/vencimientos.ts` responde a una sola pregunta: qué le toca a este vehículo,
cuándo, y cuánta prisa corre.

**La idea central es la conversión de unidades.** Para poder ordenar «faltan 800 km» junto a
«faltan 20 días» hay que traducir los kilómetros a días usando el ritmo de uso del vehículo.
A 40 km/día, 800 km son 20 días y los dos avisos empatan; a 5 km/día son 160 días y el plazo
manda con diferencia. Sin esa conversión, ordenar por urgencia sería comparar peras con
manzanas — y es exactamente la diferencia entre un coche de diario y una autocaravana.

De ahí salen tres consecuencias:

- **«Lo que ocurra antes» es literalmente el mínimo de los dos.** Y basta con que *cualquiera*
  de las dos dimensiones se haya pasado para marcar el vencimiento en rojo.
- **Un vehículo parado no se acerca al límite por kilómetros.** Si el ritmo es cero, el
  intervalo de km nunca urge por sí solo, por muchos años que pasen.
- **Un vehículo vendido no genera ningún vencimiento.** Está congelado; recordarte su ITV
  sería recordarte algo que ya no es asunto tuyo.

**Lo que no se ha registrado nunca no se marca como vencido.** Si compraste el coche en 2019
y no has anotado ningún cambio de aceite, las cuentas desde la compra dirían «cinco años de
retraso», pero eso no es creíble: lo normal es que sí lo cambiaras y no lo anotaras. Lo que
la app sabe de verdad es que le falta el dato, y eso es lo que dice: «Sin registrar», en
ámbar. Media docena de falsos rojos a la vez ahogan el aviso que sí es real —la ITV
caducada— y enseñan a ignorar el color.

Por el mismo motivo, el orden va por **rangos** antes que por urgencia numérica: primero lo
vencido, luego lo próximo con fecha, después lo que falta por registrar, y al final lo que
está al día. Un seguro que vence en veinte días es una tarea con fecha; un filtro sin anotar
es solo un hueco en el histórico.

### Consumo real: de lleno a lleno

Un repostaje no dice cuánto has gastado: dice cuánto has metido. Solo cuando el depósito
vuelve a estar lleno se sabe que lo repostado equivale exactamente a lo consumido desde el
lleno anterior. Por eso un tramo de consumo va de un depósito lleno al siguiente, y **los
repostajes parciales de en medio no se descartan: se suman al tramo**, porque ese
combustible también se ha quemado.

Dividir litros entre kilómetros repostaje a repostaje —que es lo que hace media internet—
da cifras que bailan un 30 % según lo lleno que estuviera el depósito cada vez.

La media es **ponderada por kilómetros**, no una media de medias: un tramo de 900 km dice
más sobre el consumo real que uno de 200, y promediar los dos porcentajes por igual les
daría el mismo peso.

Cuando marcas un repostaje como «me salté alguno sin anotarlo», el tramo que termina ahí se
descarta en lugar de dar una cifra imposible. Y donde no hay datos suficientes se devuelve
`null`, no cero: cero significaría «no gasta nada», que es una mentira distinta de «todavía
no lo sé».

### El coste por kilómetro: el problema es el denominador

Sumar gastos es trivial; decidir entre cuántos kilómetros se reparten no lo es. Dividir todo
lo gastado entre los kilómetros de toda la vida del vehículo **subestima** el coste cuando
llevas dos años registrando un coche que compraste hace siete: los gastos son de dos años y
los kilómetros de siete.

Por eso el kilometraje se mide sobre el mismo periodo que los gastos que se suman,
interpolando el odómetro en las dos fechas. Y cuando eso no se puede evitar —el coste total
de propiedad sí tiene que repartirse entre todos los kilómetros que has hecho con el
coche— la app avisa de que la cifra es un mínimo, en lugar de enseñar un número creíble y
falso.

### Registrar un repostaje en menos de quince segundos

Es un requisito explícito, y el formulario está construido a su alrededor:

- **El importe va primero y grande.** Es lo único que siempre tienes delante, en el surtidor
  y en el ticket.
- **De los tres campos —litros, precio e importe— basta con dos.** El tercero se calcula
  solo, y se recalcula si corriges uno de los otros.
- **Los kilómetros vienen prerrellenados** con la estimación de hoy: normalmente solo hay
  que corregir las decenas.
- **La fecha es hoy y el depósito está lleno**, que es lo que pasa nueve de cada diez veces.
- **Las estaciones que ya has usado salen como botones.** Escribir «Carrefour Majadahonda»
  con una mano y el surtidor en la otra son cinco segundos perdidos.

Todo lo raro —el repostaje parcial, la serie rota— existe, pero está plegado bajo «algo no
cuadra» para que no estorbe en el caso normal.

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

280 tests, centrados en lo que puede fallar en silencio: aritmética de céntimos, fechas
cruzando cambios de hora y años bisiestos, lectura de números en formato español, estimación
de kilometraje (ventana de uso, odómetros que retroceden, lecturas con fecha futura,
vehículos vendidos), el motor de vencimientos (recurrencia doble en las dos direcciones,
reglas de una sola dimensión, vehículos parados, antelaciones propias frente a las de
ajustes, recurrencias personalizadas que no deben mezclarse), validación de entradas,
el cálculo de consumo (repostajes parciales, series rotas, datos incompletos, medias
ponderadas, híbridos enchufables), el coste por kilómetro y el de propiedad, integridad del
repositorio y coherencia de los catálogos y los datos de ejemplo.

Hay además tests que comprueban que **los datos de ejemplo son físicamente posibles**: que
el consumo que sale del motor se parece al que se sembró. Cazaron un fallo real —tras un
repostaje parcial, el siguiente no recuperaba lo que había faltado— que hacía que la app
enseñara un consumo por debajo del real.

```bash
npm test
```

## Plan de trabajo

- [x] **Fase 1** — Estructura, stack, modelo de datos y datos de ejemplo
- [x] **Fase 2** — CRUD de vehículos, registro de kilómetros y panel principal
- [x] **Fase 3** — Mantenimientos y motor de cálculo de vencimientos
- [x] **Fase 4** — Repostajes y gastos, con consumo y coste por kilómetro
- [x] **Fase 5** — Documentos, adjuntos y avisos (notificaciones + `.ics`)
- [ ] **Fase 6** — Analíticas y gráficas
- [ ] **Fase 7** — PWA completa: offline, instalable, exportación e importación

## Fuera de alcance

No se implementan, aunque el código queda preparado: multiusuario, integración con APIs de
tráfico o talleres, OCR de facturas, seguimiento por GPS y app nativa.
