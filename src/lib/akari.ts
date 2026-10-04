import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { MATERIAS, TIPOS } from '../content.config';

export type Noticia = CollectionEntry<'noticias'>;
export type Hilo = CollectionEntry<'hilos'>;
export type Tipo = (typeof TIPOS)[number];
export type Materia = (typeof MATERIAS)[number];

export const PALABRA: Record<Tipo, string> = {
  cambia: 'Cambia',
  'se-aclara': 'Se aclara',
  'a-fondo': 'A fondo',
};

export const MATERIA: Record<Materia, string> = {
  fiscal: 'Fiscal',
  financiero: 'Financiero',
  juridico: 'Jurídico',
  laboral: 'Laboral',
};

export { MATERIAS, TIPOS };

const porFechaDesc = (a: Noticia, b: Noticia) => b.data.fecha.getTime() - a.data.fecha.getTime();

/** Noticias visibles: todo menos lo pendiente de revisión, de la más reciente a la más antigua. */
export async function getPublicadas(): Promise<Noticia[]> {
  const todas = await getCollection('noticias', ({ data }) => data.estado !== 'pendiente');
  return todas.sort(porFechaDesc);
}

export async function getPendientes(): Promise<Noticia[]> {
  const pendientes = await getCollection('noticias', ({ data }) => data.estado === 'pendiente');
  return pendientes.sort(porFechaDesc);
}

export async function contarPendientes(): Promise<number> {
  return (await getPendientes()).length;
}

export interface Paso {
  tipo: Tipo;
  indice: number;
  palabra: string;
  piezas: Noticia[];
}

export interface HiloConPasos {
  hilo: Hilo;
  pasos: Paso[];
  ultima: Date | null;
}

/** Un hilo con sus piezas publicadas repartidas en los tres pasos, en orden cronológico dentro de cada paso. */
export async function getHilo(id: string, publicadas?: Noticia[]): Promise<HiloConPasos | null> {
  const hilo = await getEntry('hilos', id);
  if (!hilo) return null;
  const lista = publicadas ?? (await getPublicadas());
  const piezas = lista
    .filter((n) => n.data.hilo?.id === id)
    .sort((a, b) => a.data.fecha.getTime() - b.data.fecha.getTime());
  const pasos = TIPOS.map((tipo, indice) => ({
    tipo,
    indice,
    palabra: PALABRA[tipo],
    piezas: piezas.filter((n) => n.data.tipo === tipo),
  }));
  const ultima = piezas.length ? piezas[piezas.length - 1].data.fecha : null;
  return { hilo, pasos, ultima };
}

/** Hilos con alguna pieza publicada, el de actividad más reciente primero. */
export async function getHilos(publicadas?: Noticia[]): Promise<HiloConPasos[]> {
  const lista = publicadas ?? (await getPublicadas());
  const hilos = await getCollection('hilos');
  const conPasos = await Promise.all(hilos.map((h) => getHilo(h.id, lista)));
  return conPasos
    .filter((h): h is HiloConPasos => h !== null && h.ultima !== null)
    .sort((a, b) => (b.ultima?.getTime() ?? 0) - (a.ultima?.getTime() ?? 0));
}

const formato = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
export const fecha = (d: Date) => formato.format(d);
export const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

/** Nombres de transición: uno por noticia, para que su palabra viaje entre páginas. */
export const vtPalabra = (n: Noticia) => `palabra-${n.id}`;
export const vtTitular = (n: Noticia) => `titular-${n.id}`;
