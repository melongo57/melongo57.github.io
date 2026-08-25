import { useEffect, useState } from 'react';
import { sincronizacionConfigurada } from '@/datos/supabaseClient.ts';
import { sincronizarTodo, ultimaSincronizacionLocal } from '@/datos/sincronizacion.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import {
  cerrarSesion,
  iniciarSesion,
  registrarse,
  useSesion,
} from '../autenticacion.ts';
import { Boton } from './Boton.tsx';
import { CampoTexto } from './Campo.tsx';
import './Sincronizacion.css';

/**
 * Cuenta y sincronización.
 *
 * La sincronización es OPCIONAL: sin cuenta iniciada, la app funciona
 * exactamente igual que antes, con todo en IndexedDB. Iniciar sesión no cambia
 * cómo se usa la app, solo añade que lo que escribas aparezca también en tus
 * otros dispositivos.
 */

function Formulario({ alEntrar }: { alEntrar: () => void }): React.JSX.Element {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(): Promise<void> {
    setTrabajando(true);
    setFallo(null);
    setAviso(null);

    const resultado =
      modo === 'crear'
        ? await registrarse(email.trim(), contrasena)
        : await iniciarSesion(email.trim(), contrasena);

    if (!resultado.ok) {
      setFallo(resultado.error ?? 'No se ha podido completar.');
      setTrabajando(false);
      return;
    }

    if (modo === 'crear') {
      /*
       * Según cómo esté configurado el proyecto, Supabase puede exigir
       * confirmar el correo antes de dejar entrar. Si la sesión no arranca
       * sola, hay que decirlo: si no, el usuario se queda mirando un
       * formulario que aparentemente no ha hecho nada.
       */
      setAviso(
        'Cuenta creada. Si Supabase te pide confirmar el correo, abre el enlace que te ha ' +
          'enviado y vuelve a entrar.',
      );
    }

    setTrabajando(false);
    alEntrar();
  }

  return (
    <form
      className="sync-form"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="sync__texto">
        Con una cuenta, tus datos se guardan también en el servidor y aparecen en cualquier
        dispositivo donde entres. Sigue funcionando todo sin conexión: lo que anotes sin
        cobertura se sube en cuanto la recuperes.
      </p>

      <CampoTexto
        etiqueta="Correo"
        tipo="email"
        valor={email}
        alCambiar={setEmail}
        marcador="tu@correo.com"
        obligatorio
      />

      <div className="campo">
        <label className="campo__etiqueta" htmlFor="sync-contrasena">
          Contraseña <span aria-hidden="true">*</span>
        </label>
        <input
          id="sync-contrasena"
          className="control"
          type="password"
          value={contrasena}
          autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
          onChange={(e) => setContrasena(e.target.value)}
        />
        {modo === 'crear' ? (
          <p className="campo__ayuda">Mínimo 6 caracteres.</p>
        ) : null}
      </div>

      {fallo ? <p className="sync__fallo">{fallo}</p> : null}
      {aviso ? <p className="sync__aviso">{aviso}</p> : null}

      <div className="fila-botones">
        <Boton
          variante="sutil"
          alPulsar={() => {
            setModo(modo === 'entrar' ? 'crear' : 'entrar');
            setFallo(null);
          }}
        >
          {modo === 'entrar' ? 'Crear cuenta' : 'Ya tengo cuenta'}
        </Boton>
        <Boton tipo="submit" variante="principal" cargando={trabajando}>
          {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </Boton>
      </div>
    </form>
  );
}

export function Sincronizacion(): React.JSX.Element {
  const sesion = useSesion();
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(() => ultimaSincronizacionLocal());

  // Al entrar por primera vez, una sincronización inmediata: es lo que sube lo
  // que ya tenías en este dispositivo y baja lo que hubiera en el servidor.
  useEffect(() => {
    if (!sesion) return;
    void sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.user.id]);

  async function sincronizar(): Promise<void> {
    setSincronizando(true);
    setFallo(null);
    setMensaje(null);

    const resultado = await sincronizarTodo();

    if (!resultado.ok) {
      setFallo(resultado.error ?? 'No se ha podido sincronizar.');
    } else {
      const detalle = resultado.detalle ?? {};
      const subidos = Object.values(detalle).reduce((t, d) => t + d.empujados, 0);
      const bajados = Object.values(detalle).reduce((t, d) => t + d.aplicados, 0);
      setMensaje(
        subidos === 0 && bajados === 0
          ? 'Todo estaba ya al día.'
          : `${subidos} registros subidos y ${bajados} recibidos.`,
      );
      setUltima(ultimaSincronizacionLocal());
    }

    setSincronizando(false);
  }

  if (!sincronizacionConfigurada()) {
    return (
      <p className="sync__texto">
        Este despliegue no tiene la sincronización configurada. Los datos viven solo en este
        navegador; usa la copia de seguridad para no perderlos.
      </p>
    );
  }

  if (sesion === undefined) return <p className="cargando">Comprobando sesión…</p>;

  if (sesion === null) {
    return <Formulario alEntrar={() => setMensaje(null)} />;
  }

  return (
    <div className="sync">
      <div className="sync__cuenta">
        <div>
          <span className="sync__etiqueta">Conectado como</span>
          <span className="sync__correo">{sesion.user.email}</span>
        </div>
        <span className="sync__punto" aria-hidden="true" />
      </div>

      <p className="sync__texto">
        Tus datos se guardan en este dispositivo <strong>y</strong> en el servidor. Si borras
        el navegador o cambias de móvil, vuelven al entrar con esta cuenta.
      </p>

      <div className="sync__fila">
        <span className="sync__etiqueta">Última sincronización</span>
        <span className="sync__valor numero">
          {ultima ? `${formatearFecha(ultima.slice(0, 10))} · ${ultima.slice(11, 16)}` : 'Nunca'}
        </span>
      </div>

      {mensaje ? <p className="sync__ok">{mensaje}</p> : null}
      {fallo ? <p className="sync__fallo">{fallo}</p> : null}

      <div className="fila-botones">
        <Boton
          variante="sutil"
          alPulsar={() => {
            void cerrarSesion();
          }}
        >
          Cerrar sesión
        </Boton>
        <Boton variante="principal" icono="⟳" cargando={sincronizando} alPulsar={() => void sincronizar()}>
          Sincronizar ahora
        </Boton>
      </div>

      <p className="sync__texto sync__texto--tenue">
        Cerrar sesión no borra nada de este dispositivo: los datos siguen aquí y en el
        servidor.
      </p>
    </div>
  );
}
