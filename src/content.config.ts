import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const MATERIAS = ['fiscal', 'financiero', 'juridico', 'laboral'] as const;
export const TIPOS = ['cambia', 'se-aclara', 'a-fondo'] as const;
export const ESTADOS = ['auto', 'revisada', 'pendiente'] as const;

const noticias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/noticias' }),
  schema: z.object({
    titulo: z.string(),
    tipo: z.enum(TIPOS),
    materia: z.enum(MATERIAS),
    esencial: z.string(),
    afecta: z.string(),
    practica: z.string(),
    fuente: z.object({
      nombre: z.string(),
      enlace: z.url(),
    }),
    fecha: z.coerce.date(),
    hilo: reference('hilos').optional(),
    estado: z.enum(ESTADOS),
  }),
});

const hilos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hilos' }),
  schema: z.object({
    titulo: z.string(),
    materia: z.enum(MATERIAS),
  }),
});

export const collections = { noticias, hilos };
