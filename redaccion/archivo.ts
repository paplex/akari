import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

export const RAIZ = process.cwd();
export const DIR_NOTICIAS = path.join(RAIZ, 'src/content/noticias');
export const DIR_HILOS = path.join(RAIZ, 'src/content/hilos');
export const DIR_ENTRADA = path.join(RAIZ, 'entrada');
export const DIR_INFORMES = path.join(RAIZ, 'redaccion/informes');
const REGISTRO = path.join(DIR_ENTRADA, 'procesados.json');

export interface HiloExistente {
  id: string;
  titulo: string;
  materia: string;
  piezas: string[];
}

export interface PiezaExistente {
  id: string;
  titulo: string;
  tipo: string;
  fecha: string;
  estado: string;
  hilo?: string;
}

const existe = (p: string) => access(p).then(() => true, () => false);

async function leerCarpeta(dir: string) {
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  return Promise.all(
    archivos.map(async (f) => ({ id: f.replace(/\.md$/, ''), ...matter(await readFile(path.join(dir, f), 'utf8')) })),
  );
}

/** Lo que ya hay publicado o pendiente, para que el especialista enlace hilos y evite duplicados. */
export async function leerContexto() {
  const noticias = await leerCarpeta(DIR_NOTICIAS);
  const piezas: PiezaExistente[] = noticias
    .map((n) => ({
      id: n.id,
      titulo: String(n.data.titulo),
      tipo: String(n.data.tipo),
      fecha: new Date(n.data.fecha).toISOString().slice(0, 10),
      estado: String(n.data.estado),
      hilo: n.data.hilo ? String(n.data.hilo) : undefined,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const hilos: HiloExistente[] = (await leerCarpeta(DIR_HILOS)).map((h) => ({
    id: h.id,
    titulo: String(h.data.titulo),
    materia: String(h.data.materia),
    piezas: piezas.filter((p) => p.hilo === h.id).map((p) => `${p.tipo}: ${p.titulo}`),
  }));
  return { hilos, piezas };
}

export function slug(texto: string, max = 70) {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > max ? base.slice(0, max).replace(/-[^-]*$/, '') : base;
}

/** Un nombre de archivo que no pise ninguno existente. */
export async function nombreLibre(dir: string, base: string) {
  let nombre = base || 'pieza';
  for (let i = 2; await existe(path.join(dir, `${nombre}.md`)); i++) nombre = `${base}-${i}`;
  return nombre;
}

/** Quita los campos sin valor a cualquier profundidad: el YAML no sabe escribir `undefined`. */
function sinVacios(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sinVacios);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, sinVacios(x)]),
    );
  }
  return v;
}

export async function escribirMarkdown(dir: string, nombre: string, datos: Record<string, unknown>, cuerpo = '') {
  const limpio = sinVacios(datos) as Record<string, unknown>;
  const texto = matter.stringify(cuerpo ? `\n${cuerpo.trim()}\n` : '', limpio);
  const ruta = path.join(dir, `${nombre}.md`);
  await writeFile(ruta, texto, 'utf8');
  return ruta;
}

export type Resultado = 'auto' | 'pendiente' | 'descartado' | 'duplicado' | 'error';

export interface Registro {
  [idCorreo: string]: { archivo: string; resultado: Resultado; pieza?: string; fecha: string; detalle?: string };
}

export async function leerRegistro(): Promise<Registro> {
  if (!(await existe(REGISTRO))) return {};
  return JSON.parse(await readFile(REGISTRO, 'utf8'));
}

export async function guardarRegistro(r: Registro) {
  await writeFile(REGISTRO, `${JSON.stringify(r, null, 2)}\n`, 'utf8');
}

export async function guardarInforme(nombre: string, texto: string) {
  await mkdir(DIR_INFORMES, { recursive: true });
  const ruta = path.join(DIR_INFORMES, `${nombre}.md`);
  await writeFile(ruta, texto, 'utf8');
  return ruta;
}
