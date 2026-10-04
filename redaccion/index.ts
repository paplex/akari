/**
 * Redacción de Akari: convierte los correos del Gmail dedicado en piezas.
 *
 *   npm run redaccion                       procesa la bandeja de entrada de Gmail
 *   npm run redaccion -- --listar           solo enseña qué hay en la bandeja (no gasta API)
 *   npm run redaccion -- --max 5            procesa como mucho 5 correos (por defecto, 20)
 *   npm run redaccion -- --carpeta          usa los .eml de entrada/ en lugar de Gmail
 *   npm run redaccion -- entrada/x.eml      procesa solo ese archivo
 *   npm run redaccion -- --repetir          vuelve a procesar también los ya hechos
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { aclarar, contrastar, corregir, dictaminar, indexar, maquetar, redactar } from './agentes';
import {
  DIR_ENTRADA,
  DIR_HILOS,
  DIR_NOTICIAS,
  escribirMarkdown,
  guardarInforme,
  guardarRegistro,
  leerContexto,
  leerRegistro,
  nombreLibre,
  slug,
  type Resultado,
} from './archivo';
import { consumoVacio, type Consumo } from './claude';
import { interpretarCorreo, leerCorreo, type Correo } from './correo';
import { etiquetarYArchivar, gmailConfigurado, leerBandeja, ETIQUETA } from './gmail';
import type { Dictamen, EntradaIndice, Indice, Pieza, Revision, RevisionDiseno } from './esquemas';
import { decidir, esUrl } from './publicacion';

try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const args = process.argv.slice(2);
const repetir = args.includes('--repetir');
const listar = args.includes('--listar');
const iMax = args.indexOf('--max');
const max = iMax >= 0 ? Math.max(1, Number(args[iMax + 1]) || 20) : 20;
const elegidos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--max');
const usarCarpeta = args.includes('--carpeta') || elegidos.length > 0;

const coste = (c: Consumo) => `${c.dolares.toFixed(2)} USD aprox.`;
const lista = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (nada)');

// Tope de noticias por correo: un boletín enorme no debe disparar el gasto sin que nadie lo vea.
const MAX_PIEZAS = 8;

interface Traza {
  entrada: EntradaIndice;
  resultado?: string;
  pieza?: string;
  hilo?: string;
  motivos?: string[];
  nota?: string;
  dictamen?: Dictamen;
  periodista?: Pieza;
  pedagogo?: Revision;
  linguista?: Revision;
  disenador?: RevisionDiseno;
}

const bloque = (titulo: string, o: unknown) =>
  o ? `\n#### ${titulo}\n\n\`\`\`json\n${JSON.stringify(o, null, 2)}\n\`\`\`\n` : '';

function informe(c: Correo, resultado: string, consumo: Consumo, indice: Indice | null, trazas: Traza[], error?: string) {
  const partes = [
    `# ${c.asunto}`,
    '',
    `- Origen: ${c.archivo}`,
    `- De: ${c.remitente}`,
    `- Fecha del correo: ${c.fecha.toISOString().slice(0, 10)}`,
    `- Resultado del correo: **${resultado}**`,
    `- Consumo: ${consumo.entrada} tokens de entrada, ${consumo.salida} de salida, ${consumo.busquedas} búsquedas web, ${coste(consumo)}`,
  ];
  if (error) partes.push(`- Error: ${error}`);
  if (indice) {
    partes.push('', '## Índice del especialista', '');
    for (const e of indice.piezas) partes.push(`- ${e.es_noticia ? '**Sí**' : 'No'}: ${e.titulo}. _${e.motivo}_`);
  }
  for (const t of trazas) {
    partes.push('', `## ${t.entrada.titulo}`, '', `- Resultado: **${t.resultado ?? 'sin terminar'}**`);
    if (t.pieza) partes.push(`- Pieza: src/content/noticias/${t.pieza}.md`);
    if (t.hilo) partes.push(`- Hilo: ${t.hilo}`);
    if (t.motivos?.length) partes.push('', 'Motivos de revisión:', '', lista(t.motivos));
    if (t.nota) partes.push('', '#### Especialista: nota de contraste', '', t.nota);
    partes.push(
      bloque('Especialista: dictamen', t.dictamen),
      bloque('Periodista', t.periodista),
      bloque('Pedagogo', t.pedagogo),
      bloque('Lingüista', t.linguista),
      bloque('Diseñador', t.disenador),
    );
  }
  return partes.join('\n');
}

/** Una noticia del correo, de principio a fin: contraste, dictamen, redacción, regla y archivo. */
async function procesarNoticia(c: Correo, t: Traza, consumo: Consumo): Promise<Resultado> {
  // Se relee en cada noticia para ver también las piezas escritas en esta misma pasada.
  const { hilos, piezas } = await leerContexto();
  const e = t.entrada;

  t.nota = await contrastar(c, e, consumo);
  const d = (t.dictamen = await dictaminar(c, e, t.nota, hilos, piezas, consumo));
  if (!d.es_noticia) {
    t.resultado = 'descartado';
    return 'descartado';
  }
  if (d.duplicado_de) {
    t.motivos = [`Ya publicada: ${d.duplicado_de}`];
    t.resultado = 'duplicado';
    return 'duplicado';
  }

  t.periodista = await redactar(c, e, d, consumo);
  t.pedagogo = await aclarar(d, t.periodista, consumo);
  t.linguista = await corregir(t.pedagogo, consumo);
  const p = (t.disenador = await maquetar(d, t.linguista, consumo));

  const { motivos } = decidir(d, p);

  // Hilo: el existente si de verdad existe; uno nuevo si el especialista lo propone.
  if (d.hilo.accion === 'existente') {
    if (hilos.some((h) => h.id === d.hilo.id)) t.hilo = d.hilo.id;
    else motivos.push(`El especialista asignó un hilo que no existe (${d.hilo.id}); la pieza queda sin hilo.`);
  } else if (d.hilo.accion === 'nuevo') {
    const titulo = p.titulo_hilo || d.hilo.titulo;
    t.hilo = await nombreLibre(DIR_HILOS, slug(titulo, 60));
    await escribirMarkdown(DIR_HILOS, t.hilo, { titulo, materia: d.materia });
  }
  const estado = motivos.length ? 'pendiente' : 'auto';

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : c.fecha.toISOString().slice(0, 10);
  t.pieza = await nombreLibre(DIR_NOTICIAS, slug(p.titulo));
  await escribirMarkdown(
    DIR_NOTICIAS,
    t.pieza,
    {
      titulo: p.titulo,
      tipo: d.tipo,
      materia: d.materia,
      esencial: p.esencial,
      afecta: p.afecta,
      practica: p.practica,
      fuente: { nombre: d.fuente.nombre, enlace: esUrl(d.fuente.enlace) ? d.fuente.enlace : undefined },
      fecha,
      hilo: t.hilo,
      estado,
      motivos: motivos.length ? motivos : undefined,
      origen: c.id,
    },
    p.desarrollo,
  );
  t.motivos = motivos;
  t.resultado = estado;
  return estado;
}

/**
 * Un correo entero. El especialista lo separa en noticias y cada una sigue su camino.
 * El resultado del correo resume el de sus noticias: "pendiente" si alguna necesita
 * revisión o falló, "auto" si todas salieron solas, "descartado" si no había nada.
 */
async function procesar(c: Correo): Promise<{ resultado: Resultado; piezas: string[]; detalle: string; consumo: Consumo }> {
  const consumo = consumoVacio();
  const nombreInforme = `${c.fecha.toISOString().slice(0, 10)}-${slug(c.asunto, 50) || 'correo'}`;
  const trazas: Traza[] = [];

  let indice: Indice;
  try {
    const { piezas } = await leerContexto();
    indice = await indexar(c, piezas, consumo);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await guardarInforme(nombreInforme, informe(c, 'error', consumo, null, trazas, motivo));
    return { resultado: 'error', piezas: [], detalle: motivo, consumo };
  }

  const elegidas = indice.piezas.filter((e) => e.es_noticia);
  const sobrantes = elegidas.slice(MAX_PIEZAS);
  const fallos: string[] = [];

  for (const entrada of elegidas.slice(0, MAX_PIEZAS)) {
    const t: Traza = { entrada };
    trazas.push(t);
    console.log(`    · ${entrada.titulo}`);
    try {
      const r = await procesarNoticia(c, t, consumo);
      console.log(`      ${r}${t.pieza ? ` → ${t.pieza}` : ''}`);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      t.resultado = `error: ${motivo}`;
      fallos.push(`${entrada.titulo}: ${motivo}`);
      console.log(`      error: ${motivo}`);
    }
  }

  const estados = trazas.map((t) => t.resultado);
  const resultado: Resultado =
    fallos.length || sobrantes.length || estados.includes('pendiente')
      ? 'pendiente'
      : estados.includes('auto')
        ? 'auto'
        : 'descartado';

  const notas = [`${elegidas.length} noticia(s) de ${indice.piezas.length} en el índice.`];
  if (fallos.length) notas.push(`Fallaron: ${fallos.join('; ')}.`);
  if (sobrantes.length) notas.push(`Sin procesar por el tope de ${MAX_PIEZAS}: ${sobrantes.map((e) => e.titulo).join('; ')}.`);

  await guardarInforme(nombreInforme, informe(c, resultado, consumo, indice, trazas, fallos.join(' ') || undefined));
  return { resultado, piezas: trazas.flatMap((t) => (t.pieza ? [t.pieza] : [])), detalle: notas.join(' '), consumo };
}

interface Fuente {
  /** Nombre para mostrar en pantalla. */
  etiqueta: string;
  correo: Correo;
  /** UID en Gmail, si viene de allí. */
  uid?: number;
}

async function fuentes(): Promise<Fuente[]> {
  if (usarCarpeta) {
    const archivos = elegidos.length
      ? elegidos.map((a) => path.resolve(a))
      : (await readdir(DIR_ENTRADA)).filter((f) => f.toLowerCase().endsWith('.eml')).map((f) => path.join(DIR_ENTRADA, f));
    return Promise.all(archivos.slice(0, max).map(async (a) => ({ etiqueta: path.basename(a), correo: await leerCorreo(a) })));
  }
  const bandeja = await leerBandeja(max);
  return Promise.all(
    bandeja.map(async (m) => ({ etiqueta: `Gmail #${m.uid}`, correo: await interpretarCorreo(m.bruto, `gmail:${m.uid}`), uid: m.uid })),
  );
}

async function main() {
  if (!usarCarpeta && !gmailConfigurado()) {
    console.error(
      [
        'Falta la conexión con Gmail. Añade a .env estas dos líneas:',
        'GMAIL_USUARIO=direccion@gmail.com',
        'GMAIL_CLAVE_APP=la contraseña de aplicación',
        'O usa los .eml de entrada/ con: npm run redaccion -- --carpeta',
      ].join('\n'),
    );
    process.exit(1);
  }

  const registro = await leerRegistro();
  const lote = await fuentes();
  if (!lote.length) {
    console.log(usarCarpeta ? 'No hay correos .eml en entrada/.' : 'La bandeja de entrada de Gmail está vacía.');
    return;
  }

  if (listar) {
    for (const { etiqueta, correo } of lote) {
      const previo = registro[correo.id];
      console.log(
        `${etiqueta}  ${correo.fecha.toISOString().slice(0, 10)}  ${correo.remitente}\n    ${correo.asunto}` +
          `${correo.adjuntos.length ? `  [${correo.adjuntos.length} adjunto(s)]` : ''}${previo ? `  (ya procesado: ${previo.resultado})` : ''}`,
      );
    }
    console.log(`\n${lote.length} correo(s). No se ha procesado nada.`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error('Falta la clave de la API de Claude. Añade a .env la línea:\nANTHROPIC_API_KEY=tu-clave');
    process.exit(1);
  }

  const total = consumoVacio();
  const cuenta: Record<string, number> = {};
  const paraEtiquetar: { uid: number; resultado: keyof typeof ETIQUETA }[] = [];

  try {
    for (const { etiqueta, correo, uid } of lote) {
      const previo = registro[correo.id];
      if (previo && !repetir) {
        // Ya procesado en una pasada anterior que no llegó a etiquetarlo: solo se etiqueta.
        if (uid !== undefined && previo.resultado !== 'error') paraEtiquetar.push({ uid, resultado: previo.resultado });
        console.log(`· ${etiqueta}: ya procesado (${previo.resultado}), se omite.`);
        continue;
      }
      console.log(`→ ${etiqueta}: ${correo.asunto}`);
      const r = await procesar(correo);
      for (const k of ['entrada', 'salida', 'busquedas', 'dolares'] as const) total[k] += r.consumo[k];
      cuenta[r.resultado] = (cuenta[r.resultado] ?? 0) + 1;
      console.log(`  ${r.resultado}${r.piezas.length ? ` → ${r.piezas.join(', ')}` : ''}. ${r.detalle} (${coste(r.consumo)})`);

      // Los errores no se registran ni se etiquetan, para que se reintenten en la próxima pasada.
      if (r.resultado !== 'error') {
        registro[correo.id] = {
          archivo: etiqueta,
          resultado: r.resultado,
          pieza: r.piezas.join(', ') || undefined,
          fecha: new Date().toISOString(),
          detalle: r.detalle,
        };
        await guardarRegistro(registro);
        if (uid !== undefined) paraEtiquetar.push({ uid, resultado: r.resultado });
      }
    }
  } finally {
    if (paraEtiquetar.length) {
      await etiquetarYArchivar(paraEtiquetar);
      console.log(`\n${paraEtiquetar.length} correo(s) etiquetados y archivados en Gmail.`);
    }
  }

  const resumen = Object.entries(cuenta).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`\nHecho:${resumen || 'nada nuevo'}. Coste total: ${coste(total)}. Informes en redaccion/informes/.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
