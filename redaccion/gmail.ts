import { ImapFlow } from 'imapflow';
import type { Resultado } from './archivo';

/**
 * Conexión con el Gmail dedicado por IMAP, con una contraseña de aplicación.
 * Lee la bandeja de entrada y, una vez procesado cada correo, le pone una etiqueta
 * de Akari y lo archiva. Los correos con error se quedan en la bandeja para reintentar.
 */

export const ETIQUETA: Record<Exclude<Resultado, 'error'>, string> = {
  auto: 'Akari/publicada',
  pendiente: 'Akari/pendiente',
  descartado: 'Akari/descartada',
  duplicado: 'Akari/descartada',
};

export interface MensajeBandeja {
  uid: number;
  bruto: Buffer;
}

export const gmailConfigurado = () => Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APP);

function conexion() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USUARIO!,
      // Google muestra la contraseña de aplicación en grupos de cuatro con espacios; aquí sobran.
      pass: process.env.GMAIL_CLAVE_APP!.replace(/\s+/g, ''),
    },
    logger: false,
  });
}

async function conGmail<T>(trabajo: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = conexion();
  try {
    await c.connect();
  } catch (e) {
    const err = e as Error & { responseText?: string; authenticationFailed?: boolean };
    const detalle = err.responseText ?? err.message ?? String(e);
    const pista = err.authenticationFailed
      ? 'Gmail rechaza la contraseña. GMAIL_CLAVE_APP debe ser una contraseña de aplicación (16 letras, creada en myaccount.google.com/apppasswords), no la contraseña normal de la cuenta.'
      : 'Revisa GMAIL_USUARIO y GMAIL_CLAVE_APP en .env y la conexión a internet.';
    throw new Error(`No se pudo entrar en Gmail como ${process.env.GMAIL_USUARIO} (${detalle}). ${pista}`);
  }
  try {
    return await trabajo(c);
  } finally {
    await c.logout().catch(() => {});
  }
}

/** Correos de la bandeja de entrada, del más antiguo al más reciente, hasta `max`. */
export async function leerBandeja(max: number): Promise<MensajeBandeja[]> {
  return conGmail(async (c) => {
    const lock = await c.getMailboxLock('INBOX');
    try {
      const uids = (await c.search({ all: true }, { uid: true })) || [];
      const elegidos = uids.sort((a, b) => a - b).slice(0, max);
      if (!elegidos.length) return [];
      const mensajes = await c.fetchAll(elegidos, { source: true }, { uid: true });
      return mensajes.filter((m) => m.source).map((m) => ({ uid: m.uid, bruto: m.source! }));
    } finally {
      lock.release();
    }
  });
}

/** Etiqueta y archiva los correos ya procesados. */
export async function etiquetarYArchivar(hechos: { uid: number; resultado: Exclude<Resultado, 'error'> }[]) {
  if (!hechos.length) return;
  await conGmail(async (c) => {
    const existentes = new Set((await c.list()).map((m) => m.path));
    for (const etiqueta of new Set(Object.values(ETIQUETA))) {
      if (!existentes.has(etiqueta)) await c.mailboxCreate(etiqueta);
    }
    const lock = await c.getMailboxLock('INBOX');
    try {
      for (const { uid, resultado } of hechos) {
        await c.messageFlagsAdd(String(uid), [ETIQUETA[resultado]], { uid: true, useLabels: true });
        // En Gmail, quitar la etiqueta \Inbox equivale a archivar.
        await c.messageFlagsRemove(String(uid), ['\\Inbox'], { uid: true, useLabels: true });
      }
    } finally {
      lock.release();
    }
  });
}
