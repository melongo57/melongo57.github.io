import { useEffect, useState } from 'react';
import { diasEntre, formatearFecha, hoyISO } from '@/dominio/fechas.ts';
import { formatearBytes } from '@/dominio/formato.ts';
import { estadoAlmacenamiento, type EstadoAlmacenamiento } from '../almacenamiento.ts';
import { useAjustes } from '../ganchos/consultas.ts';
import './EstadoDatos.css';

/** A partir de aquí, la copia se considera vieja. */
export const DIAS_SIN_COPIA = 45;

/**
 * Estado del almacenamiento y de la última copia.
 *
 * Dice lo que de verdad pasa con los datos en vez de dejarlo a la intuición:
 * dónde están, cuánto ocupan y cuándo fue la última copia. En una app cuyos
 * datos también viven en el navegador, esa información es parte del producto
 * y no una nota al pie.
 */
export function EstadoDatos(): React.JSX.Element {
  const ajustes = useAjustes();
  const [estado, setEstado] = useState<EstadoAlmacenamiento | null>(null);

  useEffect(() => {
    void estadoAlmacenamiento().then(setEstado);
  }, []);

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
