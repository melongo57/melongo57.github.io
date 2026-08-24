import type { CategoriaVehiculo } from '@/dominio/tipos.ts';

/**
 * Silueta del vehículo para cuando todavía no hay foto.
 *
 * Un hueco gris con un icono queda pobre, y descargar imágenes de archivo
 * significaría depender de la red en una app que presume de funcionar sin
 * ella. Estas siluetas son vectoriales, pesan nada y heredan el color del
 * contenedor, así que encajan con el tema sin duplicar variantes.
 *
 * El dibujo va en dos capas: el `cuerpo` en el color del vehículo y los
 * `detalles` (cristales y llantas) en el color de la superficie. Pintarlo todo
 * del mismo color con distinta opacidad no funciona: al superponerse sobre la
 * carrocería quedan igual de oscuros y la silueta sale maciza.
 */

interface Silueta {
  readonly cuerpo: React.JSX.Element;
  readonly detalles: React.JSX.Element;
}

const SILUETAS: Record<CategoriaVehiculo, Silueta> = {
  turismo: {
    cuerpo: (
      <>
        <circle cx="58" cy="82" r="16" />
        <circle cx="152" cy="82" r="16" />
        <path d="M14 84 L14 65 Q14 55 26 53 L60 48 L80 28 Q85 23 93 23 L129 23 Q137 23 142 28 L162 48 L182 53 Q194 55 194 65 L194 84 Z" />
      </>
    ),
    detalles: (
      <>
        <path d="M94 31 L126 31 L126 47 L82 47 Z" />
        <path d="M133 31 L139 31 L155 47 L133 47 Z" />
        <circle cx="58" cy="82" r="6.5" />
        <circle cx="152" cy="82" r="6.5" />
      </>
    ),
  },

  autocaravana: {
    // Perfil de perfilada: célula alta y cabina integrada delante.
    cuerpo: (
      <>
        <circle cx="52" cy="82" r="16" />
        <circle cx="160" cy="82" r="16" />
        <path d="M10 84 L10 22 Q10 14 20 14 L138 14 L138 44 L156 44 L180 62 Q192 64 192 72 L192 84 Z" />
      </>
    ),
    detalles: (
      <>
        <path d="M26 26 L58 26 L58 46 L26 46 Z" />
        <path d="M72 26 L102 26 L102 46 L72 46 Z" />
        <path d="M143 47 L156 47 L173 62 L143 62 Z" />
        <circle cx="52" cy="82" r="6.5" />
        <circle cx="160" cy="82" r="6.5" />
      </>
    ),
  },

  furgoneta: {
    cuerpo: (
      <>
        <circle cx="52" cy="82" r="16" />
        <circle cx="156" cy="82" r="16" />
        <path d="M12 84 L12 32 Q12 25 20 25 L124 25 L124 44 L146 44 L176 60 Q188 62 188 70 L188 84 Z" />
      </>
    ),
    detalles: (
      <>
        <path d="M28 36 L70 36 L70 56 L28 56 Z" />
        <path d="M129 47 L146 47 L169 60 L129 60 Z" />
        <circle cx="52" cy="82" r="6.5" />
        <circle cx="156" cy="82" r="6.5" />
      </>
    ),
  },

  moto: {
    // Depósito, asiento y colín sobre el triángulo del chasis.
    cuerpo: (
      <>
        <circle cx="50" cy="76" r="20" />
        <circle cx="152" cy="76" r="20" />
        <path d="M62 58 L96 46 Q108 42 120 44 L146 48 L150 60 L120 64 L88 66 Z" />
        <path d="M52 64 L74 52 L82 60 L62 70 Z" />
        <path d="M136 30 L152 30 L157 46 L142 48 Z" />
      </>
    ),
    detalles: (
      <>
        <circle cx="50" cy="76" r="8.5" />
        <circle cx="152" cy="76" r="8.5" />
      </>
    ),
  },

  otro: {
    cuerpo: (
      <>
        <circle cx="58" cy="82" r="16" />
        <circle cx="152" cy="82" r="16" />
        <path d="M14 84 L14 60 Q14 51 26 49 L58 44 L78 24 Q83 19 91 19 L136 19 Q144 19 149 24 L168 46 L182 50 Q194 52 194 62 L194 84 Z" />
      </>
    ),
    detalles: (
      <>
        <path d="M90 27 L130 27 L130 45 L80 45 Z" />
        <circle cx="58" cy="82" r="6.5" />
        <circle cx="152" cy="82" r="6.5" />
      </>
    ),
  },
};

export function IlustracionVehiculo({
  categoria,
}: {
  categoria: CategoriaVehiculo;
}): React.JSX.Element {
  const silueta = SILUETAS[categoria];

  return (
    <svg
      className="ilustracion-vehiculo"
      viewBox="0 0 204 100"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">{silueta.cuerpo}</g>
      <g className="ilustracion-vehiculo__detalles">{silueta.detalles}</g>
    </svg>
  );
}
