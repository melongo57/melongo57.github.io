import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORIAS_GASTO } from '@/dominio/catalogos.ts';
import type { GastoMensual, GastoPorCategoria } from '@/dominio/costes.ts';
import type { TramoConsumo } from '@/dominio/consumo.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearMes } from '@/dominio/fechas.ts';
import type { UnidadEnergia } from '@/dominio/tipos.ts';
import './Graficas.css';

/**
 * Gráficas.
 *
 * Todos los colores salen de las variables CSS del tema, leídas en tiempo de
 * render: Recharts necesita valores concretos y no entiende `var(--x)` dentro
 * de un SVG generado. Así las gráficas cambian con el modo oscuro sin
 * duplicar paletas.
 *
 * Las series usan la paleta `--c-serie-*`, elegida para distinguirse también
 * con deuteranopia, y nunca el rojo/ámbar/verde del semáforo: en esta app esos
 * tres colores significan «vencido», «pronto» y «al día», y usarlos para otra
 * cosa rompería el idioma.
 */

/** Lee una variable CSS del tema actual. */
function color(nombre: string, alternativa = '#888'): string {
  if (typeof getComputedStyle === 'undefined') return alternativa;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || alternativa;
}

function ejes() {
  return {
    rejilla: color('--c-borde'),
    texto: color('--c-texto-tenue'),
    fondo: color('--c-superficie'),
    borde: color('--c-borde-fuerte'),
  };
}

const ALTO = 240;

/**
 * Los tipos de tooltip de Recharts son genéricos y muy amplios (`name` puede
 * ser número, `value` puede ser un array). Se declara aquí la forma concreta
 * que producen estas gráficas y se hace un único cast en el punto de entrada,
 * en vez de arrastrar los genéricos por todo el archivo.
 */
interface PropsTooltip {
  active?: boolean;
  payload?: readonly { name?: string; value?: number; color?: string }[];
  label?: string | number;
}

type ContenidoTooltip = (props: PropsTooltip) => React.JSX.Element | null;

/** Adapta un renderizador propio a lo que espera `<Tooltip content>`. */
function comoContenido(render: ContenidoTooltip): (props: unknown) => React.JSX.Element | null {
  return (props) => render(props as PropsTooltip);
}

function CajaTooltip({
  titulo,
  filas,
}: {
  titulo: string;
  filas: readonly { nombre: string; valor: string; color?: string }[];
}): React.JSX.Element {
  return (
    <div className="grafica-tooltip">
      <p className="grafica-tooltip__titulo">{titulo}</p>
      {filas.map((f) => (
        <p key={f.nombre} className="grafica-tooltip__fila">
          {f.color ? (
            <span className="grafica-tooltip__punto" style={{ background: f.color }} />
          ) : null}
          <span>{f.nombre}</span>
          <strong className="numero">{f.valor}</strong>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gasto mensual
// ---------------------------------------------------------------------------

export function GraficaGastoMensual({
  datos,
}: {
  datos: readonly GastoMensual[];
}): React.JSX.Element {
  const c = ejes();
  const serie = datos.map((d) => ({
    mes: d.mes,
    Combustible: d.energiaCentimos / 100,
    Mantenimiento: d.mantenimientoCentimos / 100,
    Otros: d.otrosCentimos / 100,
  }));

  const colores = {
    Combustible: color('--c-serie-1'),
    Mantenimiento: color('--c-serie-2'),
    Otros: color('--c-serie-3'),
  };

  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <BarChart data={serie} margin={{ top: 8, right: 4, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={c.rejilla} vertical={false} />
        <XAxis
          dataKey="mes"
          tickFormatter={(mes: string) => formatearMes(mes).slice(0, 3)}
          tick={{ fill: c.texto, fontSize: 11 }}
          axisLine={{ stroke: c.rejilla }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: c.texto, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(v: number) => `${Math.round(v)} €`}
        />
        <Tooltip
          cursor={{ fill: c.rejilla, opacity: 0.35 }}
          content={comoContenido(({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const total = payload.reduce((t, p) => t + (p.value ?? 0), 0);
            return (
              <CajaTooltip
                titulo={formatearMes(String(label))}
                filas={[
                  ...payload
                    .filter((p) => (p.value ?? 0) > 0)
                    .map((p) => ({
                      nombre: p.name ?? '',
                      valor: formatearEuros(Math.round((p.value ?? 0) * 100)),
                      color: p.color ?? '',
                    })),
                  { nombre: 'Total', valor: formatearEuros(Math.round(total * 100)) },
                ]}
              />
            );
          })}
        />
        {/* Apiladas: lo que importa es el total del mes y de qué se compone. */}
        <Bar dataKey="Combustible" stackId="g" fill={colores.Combustible} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Mantenimiento" stackId="g" fill={colores.Mantenimiento} />
        <Bar dataKey="Otros" stackId="g" fill={colores.Otros} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Consumo a lo largo del tiempo
// ---------------------------------------------------------------------------

export function GraficaConsumo({
  tramos,
  unidad,
  media,
}: {
  tramos: readonly TramoConsumo[];
  unidad: UnidadEnergia;
  media: number | null;
}): React.JSX.Element {
  const c = ejes();
  const acento = color('--c-serie-1');

  const serie = tramos.map((t) => ({
    fecha: t.fecha,
    consumo: Number(t.consumo.toFixed(2)),
    km: t.km,
  }));

  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={serie} margin={{ top: 8, right: 4, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="degradadoConsumo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={acento} stopOpacity={0.28} />
            <stop offset="100%" stopColor={acento} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={c.rejilla} vertical={false} />
        <XAxis
          dataKey="fecha"
          tickFormatter={(f: string) => f.slice(5, 7) + '/' + f.slice(2, 4)}
          tick={{ fill: c.texto, fontSize: 11 }}
          axisLine={{ stroke: c.rejilla }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: c.texto, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={54}
          domain={['dataMin - 1', 'dataMax + 1']}
          tickFormatter={(v: number) => v.toFixed(1).replace('.', ',')}
        />
        <Tooltip
          cursor={{ stroke: c.borde }}
          content={comoContenido(({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const punto = serie.find((s) => s.fecha === label);
            const [a, m, d] = String(label).split('-');
            return (
              <CajaTooltip
                titulo={`${d}/${m}/${a}`}
                filas={[
                  {
                    nombre: 'Consumo',
                    valor: `${(punto?.consumo ?? 0).toFixed(1).replace('.', ',')} ${unidad}/100 km`,
                    color: acento,
                  },
                  { nombre: 'Tramo', valor: `${punto?.km ?? 0} km` },
                ]}
              />
            );
          })}
        />

        {/* La media da la referencia: sin ella, la línea sube y baja sin que
            se sepa si eso es mucho o poco. */}
        {media !== null ? (
          <ReferenceLine
            y={Number(media.toFixed(2))}
            stroke={c.borde}
            strokeDasharray="4 4"
            label={{
              value: `media ${media.toFixed(1).replace('.', ',')}`,
              position: 'insideTopLeft',
              fill: c.texto,
              fontSize: 11,
            }}
          />
        ) : null}

        <Area
          type="monotone"
          dataKey="consumo"
          stroke="none"
          fill="url(#degradadoConsumo)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="consumo"
          stroke={acento}
          strokeWidth={2.2}
          dot={{ r: 2.5, fill: acento, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Reparto por categoría
// ---------------------------------------------------------------------------

const NOMBRE_CATEGORIA: Record<string, string> = {
  combustible: 'Combustible',
  mantenimiento: 'Mantenimiento',
};

function nombreDe(categoria: GastoPorCategoria['categoria']): string {
  return (
    NOMBRE_CATEGORIA[categoria] ??
    CATEGORIAS_GASTO[categoria as keyof typeof CATEGORIAS_GASTO]?.nombre ??
    categoria
  );
}

/**
 * Reparto del gasto, en barras horizontales y no en un donut.
 *
 * Con nueve categorías, un donut obliga a leer una leyenda y a comparar
 * ángulos, que es lo que peor se le da al ojo. En barras ordenadas se ve de
 * un vistazo qué manda y por cuánto.
 */
export function GraficaCategorias({
  datos,
}: {
  datos: readonly GastoPorCategoria[];
}): React.JSX.Element {
  const colores = [1, 2, 3, 4, 5, 6].map((n) => color(`--c-serie-${n}`));

  return (
    <ul className="barras-categoria">
      {datos.map((d, i) => (
        <li key={d.categoria} className="barra-categoria">
          <span className="barra-categoria__nombre">{nombreDe(d.categoria)}</span>
          <span className="barra-categoria__pista">
            <span
              className="barra-categoria__relleno"
              style={{
                width: `${Math.max(2, d.proporcion * 100)}%`,
                background: colores[i % colores.length],
              }}
            />
          </span>
          <span className="barra-categoria__importe numero">{formatearEuros(d.centimos)}</span>
          <span className="barra-categoria__pct numero">{Math.round(d.proporcion * 100)} %</span>
        </li>
      ))}
    </ul>
  );
}
