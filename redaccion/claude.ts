import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

export const MODELO = 'claude-opus-5-5';

// Si el modelo rechaza una petición por sus salvaguardas, la API la repite en el modelo de respaldo
// que le corresponda, dentro de la misma llamada.
const RESPALDO = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

// Precios de Claude Opus 5.5 por millón de tokens y de la búsqueda web por consulta, en dólares.
// Solo sirven para dar una estimación en el informe; la factura real está en la consola de Anthropic.
const PRECIO = { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5, busqueda: 0.01 };

let cliente: Anthropic | null = null;
const claude = () => (cliente ??= new Anthropic());

export class Rechazo extends Error {}

export interface Consumo {
  entrada: number;
  salida: number;
  busquedas: number;
  dolares: number;
}

export const consumoVacio = (): Consumo => ({ entrada: 0, salida: 0, busquedas: 0, dolares: 0 });

function sumar(total: Consumo, uso: Anthropic.Beta.BetaUsage) {
  const entrada = uso.input_tokens ?? 0;
  const lectura = uso.cache_read_input_tokens ?? 0;
  const escritura = uso.cache_creation_input_tokens ?? 0;
  const salida = uso.output_tokens ?? 0;
  const busquedas = uso.server_tool_use?.web_search_requests ?? 0;
  total.entrada += entrada + lectura + escritura;
  total.salida += salida;
  total.busquedas += busquedas;
  total.dolares +=
    (entrada * PRECIO.entrada + lectura * PRECIO.cacheLectura + escritura * PRECIO.cacheEscritura + salida * PRECIO.salida) /
      1_000_000 +
    busquedas * PRECIO.busqueda;
}

function comprobarParada(m: Anthropic.Beta.BetaMessage, quien: string) {
  if (m.stop_reason === 'refusal') {
    const d = m.stop_details;
    throw new Rechazo(`${quien}: el modelo rechazó la petición${d?.category ? ` (${d.category})` : ''}.`);
  }
  if (m.stop_reason === 'max_tokens') throw new Error(`${quien}: la respuesta se cortó por longitud.`);
}

/**
 * Llamada con búsqueda y lectura web para contrastar datos. Devuelve el texto final.
 * Si la búsqueda se alarga, la API pausa el turno y aquí se reanuda.
 */
export async function investigar(
  quien: string,
  system: string,
  contenido: Anthropic.Beta.BetaContentBlockParam[],
  consumo: Consumo,
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: contenido }];
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const m = await claude()
      .beta.messages.stream({
        ...RESPALDO,
        model: MODELO,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system,
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
        ],
        messages,
      })
      .finalMessage();
    sumar(consumo, m.usage);
    if (m.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: m.content });
      continue;
    }
    comprobarParada(m, quien);
    return m.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }
  throw new Error(`${quien}: la investigación no terminó tras varias pausas.`);
}

/** Llamada con salida estructurada: la respuesta llega validada contra el esquema. */
export async function estructurar<T extends z.ZodType>(
  quien: string,
  esquema: T,
  system: string,
  contenido: Anthropic.Beta.BetaContentBlockParam[],
  consumo: Consumo,
  esfuerzo: 'low' | 'medium' | 'high' = 'medium',
): Promise<z.infer<T>> {
  const m = await claude().beta.messages.parse({
    ...RESPALDO,
    model: MODELO,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: esfuerzo, format: betaZodOutputFormat(esquema) },
    system,
    messages: [{ role: 'user', content: contenido }],
  });
  sumar(consumo, m.usage);
  comprobarParada(m, quien);
  if (m.parsed_output == null) throw new Error(`${quien}: la respuesta no cumple el formato esperado.`);
  return m.parsed_output;
}
