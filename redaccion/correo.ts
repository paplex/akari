import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { simpleParser, type AddressObject } from 'mailparser';
import { convert } from 'html-to-text';

export interface Adjunto {
  nombre: string;
  tipo: 'pdf' | 'imagen';
  mediaType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  base64: string;
}

export interface Correo {
  /** Identificador estable: el Message-ID o, si falta, una huella del archivo. */
  id: string;
  archivo: string;
  remitente: string;
  asunto: string;
  fecha: Date;
  texto: string;
  enlaces: string[];
  adjuntos: Adjunto[];
  ignorados: string[];
}

const IMAGENES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_ADJUNTO = 20 * 1024 * 1024;
const MAX_TEXTO = 60_000;

const direccion = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a.map((x) => x.text).join(', ') : a?.text) ?? '';

export async function leerCorreo(ruta: string): Promise<Correo> {
  return interpretarCorreo(await readFile(ruta), ruta);
}

/** Convierte un mensaje en bruto (RFC 822), venga de un .eml o de Gmail, en un Correo. */
export async function interpretarCorreo(bruto: Buffer, origen: string): Promise<Correo> {
  const m = await simpleParser(bruto);

  const html = typeof m.html === 'string' ? m.html : '';
  const texto = (m.text?.trim() || convert(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] })).trim();

  // Enlaces del cuerpo: los del HTML (que suelen esconder la URL real) y los del texto plano.
  const enlaces = new Set<string>();
  for (const [, url] of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) if (/^https?:/i.test(url)) enlaces.add(url);
  for (const [url] of texto.matchAll(/https?:\/\/[^\s<>()[\]"']+/gi)) enlaces.add(url.replace(/[.,;:]+$/, ''));

  const adjuntos: Adjunto[] = [];
  const ignorados: string[] = [];
  for (const a of m.attachments) {
    const nombre = a.filename ?? 'adjunto';
    const tipo = a.contentType.toLowerCase();
    if (a.size > MAX_ADJUNTO) {
      ignorados.push(`${nombre} (demasiado grande)`);
    } else if (tipo === 'application/pdf') {
      adjuntos.push({ nombre, tipo: 'pdf', mediaType: 'application/pdf', base64: a.content.toString('base64') });
    } else if (IMAGENES.has(tipo) && a.contentDisposition !== 'inline') {
      adjuntos.push({ nombre, tipo: 'imagen', mediaType: tipo as Adjunto['mediaType'], base64: a.content.toString('base64') });
    } else if (a.contentDisposition !== 'inline') {
      ignorados.push(`${nombre} (${tipo})`);
    }
  }

  const id = m.messageId ?? `sha1:${createHash('sha1').update(bruto).digest('hex')}`;

  return {
    id,
    archivo: origen,
    remitente: direccion(m.from),
    asunto: m.subject ?? '(sin asunto)',
    fecha: m.date ?? new Date(),
    texto: texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}\n\n[Texto recortado: el correo supera ${MAX_TEXTO} caracteres.]` : texto,
    enlaces: [...enlaces].slice(0, 80),
    adjuntos,
    ignorados,
  };
}
