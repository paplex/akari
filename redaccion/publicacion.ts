import type { Dictamen, RevisionDiseno } from './esquemas';

/**
 * Regla de publicación. Es código, no criterio del modelo: los agentes aportan los datos
 * y aquí se decide. Una pieza sale sola solo si resume una fuente oficial identificable,
 * sin interpretación propia y con los datos contrastados. Todo lo demás va a revisión.
 */
export function decidir(d: Dictamen, p: RevisionDiseno): { estado: 'auto' | 'pendiente'; motivos: string[] } {
  const motivos: string[] = [];

  if (d.fuente.clase !== 'oficial') motivos.push(`La fuente no es oficial (${etiqueta[d.fuente.clase]}).`);
  else if (!d.fuente.identificable || !esUrl(d.fuente.enlace))
    motivos.push('La fuente oficial no está identificada con un enlace al original.');

  if (d.tipo === 'a-fondo') motivos.push('Es un análisis: siempre pasa por revisión.');
  else if (d.interpretacion) motivos.push('La pieza necesita interpretación, no solo resumir la fuente.');

  if (!d.contraste.contrastado) motivos.push(`Datos sin contrastar: ${d.contraste.explicacion}`);

  for (const duda of d.dudas) motivos.push(`Duda del especialista: ${duda}`);
  for (const aviso of p.avisos) motivos.push(`Aviso del diseñador: ${aviso}`);

  // Comprobaciones de forma que no dependen de ningún agente.
  const textos = [p.titulo, p.esencial, p.afecta, p.practica, p.desarrollo];
  if (textos.some((t) => /[—–]/.test(t))) motivos.push('El texto contiene rayas (—), que el estilo de Akari no usa.');
  if (p.titulo.length > 100) motivos.push(`Titular demasiado largo (${p.titulo.length} caracteres).`);
  if (p.esencial.length > 340) motivos.push(`"Lo esencial" demasiado largo (${p.esencial.length} caracteres).`);
  if (p.practica.length > 180) motivos.push(`"Qué cambia en la práctica" demasiado largo (${p.practica.length} caracteres).`);

  return { estado: motivos.length ? 'pendiente' : 'auto', motivos };
}

export const esUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const etiqueta: Record<Dictamen['fuente']['clase'], string> = {
  oficial: 'oficial',
  'colegio-o-asociacion': 'colegio o asociación',
  colega: 'colega',
  web: 'web',
  'redes-sociales': 'redes sociales',
  otra: 'otra',
};
