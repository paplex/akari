import { z } from 'zod';

export const MATERIAS = ['fiscal', 'financiero', 'juridico', 'laboral'] as const;
export const TIPOS = ['cambia', 'se-aclara', 'a-fondo'] as const;

/** Lo que decide el especialista. No redacta: dictamina. */
export const Dictamen = z.object({
  es_noticia: z.boolean().describe('Si el correo contiene una noticia útil y nueva para el despacho.'),
  motivo: z.string().describe('Por qué es o no es noticia, en una o dos frases.'),
  duplicado_de: z.string().describe('Identificador de la pieza ya publicada que cuenta lo mismo, o cadena vacía.'),
  materia: z.enum(MATERIAS),
  tipo: z.enum(TIPOS),
  fecha: z.string().describe('Fecha de la norma, criterio o análisis en formato AAAA-MM-DD; si no consta, cadena vacía.'),
  hechos: z.array(z.string()).describe('Hechos verificables, uno por elemento, tal como constan en la fuente.'),
  fuente: z.object({
    nombre: z.string().describe('Nombre de la fuente original, por ejemplo el boletín y la norma, o el organismo y la consulta.'),
    enlace: z.string().describe('URL de la fuente original, o cadena vacía si no se ha encontrado.'),
    clase: z.enum(['oficial', 'colegio-o-asociacion', 'colega', 'web', 'redes-sociales', 'otra']),
    identificable: z.boolean().describe('Si la fuente original está identificada sin ambigüedad (organismo, fecha y referencia).'),
  }),
  contraste: z.object({
    contrastado: z.boolean().describe('Si los datos clave coinciden con la fuente oficial consultada.'),
    explicacion: z.string().describe('Qué se ha comprobado y dónde, o por qué no se ha podido.'),
  }),
  interpretacion: z.boolean().describe('Si la pieza necesita interpretar o analizar, más allá de resumir la fuente.'),
  dudas: z.array(z.string()).describe('Dudas concretas que impiden publicar sin revisión. Vacío si no hay.'),
  hilo: z.object({
    accion: z.enum(['existente', 'nuevo', 'ninguno']),
    id: z.string().describe('Identificador del hilo existente, o cadena vacía.'),
    titulo: z.string().describe('Título del hilo nuevo como cuestión concreta, o cadena vacía.'),
  }),
});
export type Dictamen = z.infer<typeof Dictamen>;

/** La pieza escrita. Pasa de mano en mano: periodista, pedagogo, lingüista y diseñador. */
export const Pieza = z.object({
  titulo: z.string(),
  esencial: z.string(),
  afecta: z.string(),
  practica: z.string(),
  desarrollo: z.string().describe('Markdown. Cadena vacía si no hay nada que añadir a la ficha.'),
});
export type Pieza = z.infer<typeof Pieza>;

export const Revision = Pieza.extend({
  cambios: z.array(z.string()).describe('Qué has cambiado y por qué, una línea por cambio. Vacío si nada.'),
});
export type Revision = z.infer<typeof Revision>;

export const RevisionDiseno = Revision.extend({
  titulo_hilo: z.string().describe('Título del hilo nuevo ajustado, o cadena vacía si no hay hilo nuevo.'),
  avisos: z.array(z.string()).describe('Problemas de encaje que no has podido resolver. Vacío si ninguno.'),
});
export type RevisionDiseno = z.infer<typeof RevisionDiseno>;
