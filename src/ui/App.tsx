import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/datos/db.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { CATEGORIAS_VEHICULO, COMBUSTIBLES } from '@/dominio/catalogos.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import type { Id, Vehiculo } from '@/dominio/tipos.ts';
import { FotoVehiculo } from './componentes/FotoVehiculo.tsx';
import { SelectorTema } from './componentes/SelectorTema.tsx';
import './App.css';

/** Resumen de lo que hay guardado para un vehículo. */
interface ResumenVehiculo {
  vehiculo: Vehiculo;
  ultimoKm: number | null;
  ultimaFecha: string | null;
  lecturas: number;
  mantenimientos: number;
  reglas: number;
  repostajes: number;
  gastos: number;
  documentos: number;
  gastoTotalCentimos: number;
}

async function cargarResumen(): Promise<ResumenVehiculo[]> {
  const vehiculos = await db.vehiculos.orderBy('orden').toArray();

  return Promise.all(
    vehiculos.map(async (vehiculo): Promise<ResumenVehiculo> => {
      const id: Id = vehiculo.id;
      const [puntos, lecturas, mantenimientos, reglas, repostajes, gastos, documentos] =
        await Promise.all([
          repo.puntosOdometro(id),
          db.lecturas.where('vehiculoId').equals(id).count(),
          db.mantenimientos.where('vehiculoId').equals(id).toArray(),
          db.reglas.where('vehiculoId').equals(id).count(),
          db.repostajes.where('vehiculoId').equals(id).toArray(),
          db.gastos.where('vehiculoId').equals(id).toArray(),
          db.documentos.where('vehiculoId').equals(id).count(),
        ]);

      const ultimo = puntos.at(-1) ?? null;
      const gastoTotalCentimos =
        mantenimientos.reduce((t, m) => t + m.costeCentimos, 0) +
        repostajes.reduce((t, r) => t + r.importeCentimos, 0) +
        gastos.reduce((t, g) => t + g.importeCentimos, 0);

      return {
        vehiculo,
        ultimoKm: ultimo?.km ?? null,
        ultimaFecha: ultimo?.fecha ?? null,
        lecturas,
        mantenimientos: mantenimientos.length,
        reglas,
        repostajes: repostajes.length,
        gastos: gastos.length,
        documentos,
        gastoTotalCentimos,
      };
    }),
  );
}

function Contador({ etiqueta, valor }: { etiqueta: string; valor: number }): React.JSX.Element {
  return (
    <div className="contador">
      <span className="contador__valor numero">{valor}</span>
      <span className="contador__etiqueta">{etiqueta}</span>
    </div>
  );
}

function TarjetaVehiculo({ resumen }: { resumen: ResumenVehiculo }): React.JSX.Element {
  const { vehiculo: v } = resumen;
  const combustible = COMBUSTIBLES[v.combustible];
  const categoria = CATEGORIAS_VEHICULO[v.categoria];
  const vendido = v.estado === 'vendido';

  return (
    <article className={`tarjeta tarjeta--vehiculo${vendido ? ' es-vendido' : ''}`}>
      <FotoVehiculo vehiculo={v} />

      <header className="tarjeta__cabecera">
        <div>
          <h3 className="tarjeta__titulo">{v.alias}</h3>
          <p className="tarjeta__subtitulo">
            {v.marca} {v.modelo}
            {v.version ? ` · ${v.version}` : ''}
          </p>
        </div>
        <span className={`chip${vendido ? ' chip--tenue' : ''}`}>
          {vendido ? 'Vendido' : 'Activo'}
        </span>
      </header>

      <dl className="datos-clave">
        <div>
          <dt>Matrícula</dt>
          <dd className="numero">{v.matricula}</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>
            <span aria-hidden="true">{categoria.icono} </span>
            {categoria.nombre}
          </dd>
        </div>
        <div>
          <dt>Combustible</dt>
          <dd>
            <span aria-hidden="true">{combustible.icono} </span>
            {combustible.nombre}
          </dd>
        </div>
        <div className="datos-clave__ancho">
          <dt>Última lectura</dt>
          <dd className="numero">
            {resumen.ultimoKm === null ? '—' : formatearKm(resumen.ultimoKm)}
            {resumen.ultimaFecha ? (
              <span className="datos-clave__apunte"> · {formatearFecha(resumen.ultimaFecha)}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="contadores">
        <Contador etiqueta="lecturas" valor={resumen.lecturas} />
        <Contador etiqueta="repostajes" valor={resumen.repostajes} />
        <Contador etiqueta="mantenim." valor={resumen.mantenimientos} />
        <Contador etiqueta="reglas" valor={resumen.reglas} />
        <Contador etiqueta="gastos" valor={resumen.gastos} />
        <Contador etiqueta="docs" valor={resumen.documentos} />
      </div>

      <footer className="tarjeta__pie">
        <span>Registrado en total</span>
        <strong className="numero">{formatearEuros(resumen.gastoTotalCentimos)}</strong>
      </footer>
    </article>
  );
}

export function App(): React.JSX.Element {
  const resumenes = useLiveQuery(cargarResumen, [], undefined);

  return (
    <div className="app">
      <header className="barra-superior">
        <div className="contenedor barra-superior__interior">
          <div className="marca">
            <img src="/favicon.svg" alt="" width={32} height={32} className="marca__icono" />
            <span className="marca__nombre">Mi Garaje</span>
          </div>
          <div className="barra-superior__acciones">
            <span className="chip chip--acento">Fase 1</span>
            <SelectorTema />
          </div>
        </div>
      </header>

      <main className="contenedor principal">
        <section className="intro">
          <h1>Modelo de datos y datos de ejemplo</h1>
          <p>
            El esquema está creado en IndexedDB y sembrado con cuatro vehículos que ejercitan
            caminos distintos del código: un diésel con historial denso, un eléctrico que
            reposta en kWh, una autocaravana cuyos mantenimientos vencen por tiempo y no por
            uso, y uno vendido con el histórico congelado. La interfaz real llega en la fase 2.
          </p>
        </section>

        {resumenes === undefined ? (
          <p className="cargando">Cargando…</p>
        ) : (
          <div className="rejilla">
            {resumenes.map((resumen) => (
              <TarjetaVehiculo key={resumen.vehiculo.id} resumen={resumen} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
