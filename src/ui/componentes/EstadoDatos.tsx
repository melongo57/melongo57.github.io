import { useEffect, useState } from 'react';
import { diasEntre, formatearFecha, hoyISO } from '@/dominio/fechas.ts';
import { formatearBytes } from '@/dominio/formato.ts';
import {
  estadoAlmacenamiento,
  pedirPersistencia,
  type EstadoAlmacenamiento,
} from '../almacenamiento.ts';
import { useAjustes } from '../ganchos/consultas.ts';
import { Boton } from './Boton.tsx';
import './EstadoDatos.css';

/** A partir de aquí, la copia se considera vieja. */
export const DIAS_SIN_COPIA = 45;

/**
 * Estado del almacenamiento y de la última copia.
 *
 * Dice lo que de verdad pasa con los datos en vez de dejarlo a la intuición:
 * dónde están, cuánto ocupan, qué los borra y cuándo fue la última copia.
 * En una app cuyos datos solo viven en el navegador, esa información es parte
 * del producto y no una nota al pie.
 */
export function EstadoDatos(): React.JSX.Element {
  const ajustes = useAjustes();
  const [estado, setEstado] = useState<EstadoAlmacenamiento | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  /** `false` solo tras un intento denegado, para poder explicar por qué. */
  const [denegado, setDenegado] = useState(false);

  async function refrescar(): Promise<void> {
    setEstado(await estadoAlmacenamiento());
  }

  useEffect(() => {
    void refrescar();
  }, []);

  async function activarPersistencia(): Promise<void> {
    setPidiendo(true);
    const concedido = await pedirPersistencia();
    setDenegado(!concedido);
    await refrescar();
    setPidiendo(false);
  }

  const ultimaCopia = ajustes?.ultimaCopiaEn;
  const diasDesdeCopia = ultimaCopia ? -diasEntre(hoyISO(), ultimaCopia.slice(0, 10)) : null;
  const copiaVieja = diasDesdeCopia === null || diasDesdeCopia > DIAS_SIN_COPIA;

  return (
    <div className="estado-datos">
      {/* --- Dónde están --- */}
      <div className="estado-datos__fila">
        <span className="estado-datos__etiqueta">Dónde</span>
        <span className="estado-datos__valor">
          En este navegador
          {estado?.usado != null ? (
            <span className="estado-datos__apunte numero">
              {' '}
              · {formatearBytes(estado.usado)}
              {estado.cuota != null ? ` de ${formatearBytes(estado.cuota)}` : ''}
            </span>
          ) : null}
        </span>
      </div>

      {/* --- Protección frente al desalojo automático --- */}
      <div className="estado-datos__fila">
        <span className="estado-datos__etiqueta">Protección</span>
        <span className="estado-datos__valor">
          {estado === null ? (
            '…'
          ) : estado.persistente ? (
            <span className="estado-datos__ok">
              A salvo del borrado automático
            </span>
          ) : !estado.soportado ? (
            <span className="estado-datos__flojo">
              Este navegador no permite protegerlo
            </span>
          ) : (
            <span className="estado-datos__flojo">Sin proteger</span>
          )}
        </span>
      </div>

      {estado && estado.soportado && !estado.persistente ? (
        <div className="estado-datos__accion">
          <p>
            Sin protección, el navegador puede borrar los datos por su cuenta si al
            dispositivo le falta espacio, y lo hace sin avisar.
          </p>
          <Boton alPulsar={() => void activarPersistencia()} cargando={pidiendo}>
            Proteger mis datos
          </Boton>

          {/*
            Chrome no concede la persistencia por pedirla: la da cuando el
            sitio le parece importante para ti. Un botón que no hace nada y no
            explica por qué es peor que no tener botón, así que se dice qué
            falta para conseguirlo.
          */}
          {denegado ? (
            <p className="estado-datos__denegado">
              El navegador lo ha denegado de momento. No lo concede por pedirlo: lo da cuando
              considera que la app te importa. Lo consigues <strong>instalándola</strong> en
              la pantalla de inicio, activando las notificaciones o simplemente usándola unos
              días. Mientras tanto, la copia de seguridad es tu red.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- Última copia --- */}
      <div className="estado-datos__fila">
        <span className="estado-datos__etiqueta">Última copia</span>
        <span className="estado-datos__valor">
          {ultimaCopia ? (
            <span className={copiaVieja ? 'estado-datos__flojo' : 'estado-datos__ok'}>
              <span className="numero">{formatearFecha(ultimaCopia.slice(0, 10))}</span>
              {diasDesdeCopia !== null && diasDesdeCopia > 0
                ? ` · hace ${diasDesdeCopia} días`
                : ' · hoy'}
            </span>
          ) : (
            <span className="estado-datos__flojo">Nunca</span>
          )}
        </span>
      </div>

      {copiaVieja ? (
        <p className="estado-datos__aviso">
          <strong>Descarga una copia.</strong> Es lo único que te protege de borrar los datos
          del navegador sin querer, de cambiar de móvil o de que se pierda el dispositivo.
        </p>
      ) : null}
    </div>
  );
}
