# Akari

明かり, la luz que alumbra. Web interna de noticias fiscales, financieras, jurídicas y laborales del despacho.

Fase 1: la web y su diseño, con contenido de prueba. Todavía no lee correo ni está publicada.

## Arrancar en local

Hace falta Node 22 o superior.

```bash
npm install
npm run dev
```

Se abre en http://localhost:4321.

Otras órdenes:

- `npm run build`: genera la web estática en `dist/`.
- `npm run check`: comprueba tipos y que todas las noticias cumplen el modelo.

## Añadir una noticia a mano

1. Crea un archivo `.md` en `src/content/noticias/`. El nombre del archivo es la dirección de la noticia: `mi-noticia.md` se verá en `/noticias/mi-noticia/`.
2. Copia esta cabecera y rellénala:

```markdown
---
titulo: "Titular claro, sin jerga"
tipo: cambia            # cambia | se-aclara | a-fondo
materia: fiscal         # fiscal | financiero | juridico | laboral
esencial: "Dos o tres líneas con lo esencial."
afecta: "A quién afecta."
practica: "Qué cambia en la práctica, en una frase."
fuente:
  nombre: "Nombre de la fuente"
  enlace: "https://enlace-al-original"
fecha: 2026-10-04
hilo: rehabilitacion-oficinas   # opcional: nombre del archivo del hilo, sin .md
estado: pendiente       # auto | revisada | pendiente
---

Desarrollo largo, opcional. Se muestra en el desplegable bajo la ficha.
```

3. Guarda. Con `npm run dev` en marcha la página aparece al momento. Si falta un campo o un valor no es válido, Astro lo dice en la terminal.

Las noticias en estado `pendiente` no salen en ninguna página; solo suman en el aviso "N piezas pendientes de tu revisión". Para publicarla, cambia el estado a `revisada`.

La portada muestra siempre la noticia publicada más reciente.

## Redacción automática (fase 2)

Convierte correos en piezas con cinco agentes de Claude y una regla de publicación fija.

1. Crea un archivo `.env` en la raíz con tu clave de la API de Claude: `ANTHROPIC_API_KEY=...` (no se sube a GitHub).
2. Guarda los correos como `.eml` en `entrada/` (en Gmail: tres puntos, "Descargar mensaje").
3. Ejecuta `npm run redaccion`.

Cada correo pasa por:

| Agente | Qué hace |
| --- | --- |
| Especialista | Decide si hay noticia, localiza la fuente original, contrasta los datos en internet, clasifica materia y tipo y asigna hilo. |
| Periodista | Escribe titular, lo esencial, a quién afecta, qué cambia en la práctica y el desarrollo. |
| Pedagogo | Comprueba que se entienda a la primera y que la práctica diga qué hacer. |
| Lingüista | Corrige la lengua y el estilo. |
| Diseñador | Ajusta longitudes para que la pieza encaje en el diseño. |

El papel de cada agente está en `redaccion/agentes/*.md`: se puede editar sin tocar código.

**Regla de publicación** (`redaccion/publicacion.ts`). Sale publicada sola (`auto`) solo si se cumplen todas:

- la fuente original es oficial y hay enlace a ella;
- no es un análisis ni necesita interpretación;
- el especialista ha contrastado los datos y no tiene dudas;
- el texto respeta los límites de forma.

Si falla cualquiera, queda `pendiente` con sus motivos, visibles en `/revision/`. Allí se publica cambiando el estado a `revisada`.

Cada correo deja un informe con lo que hizo cada agente y el coste estimado en `redaccion/informes/` (no se sube a GitHub). Lo procesado se apunta en `entrada/procesados.json` y no se repite; `npm run redaccion -- --repetir` fuerza a repetir.

## Añadir un hilo

Crea un archivo `.md` en `src/content/hilos/` con:

```markdown
---
titulo: "La cuestión que une sus piezas"
materia: fiscal
---
```

Las noticias se unen a él con `hilo: nombre-del-archivo`.

## Estructura

- `src/content/noticias/`, `src/content/hilos/`: el contenido, un archivo por pieza.
- `src/content.config.ts`: el modelo de datos.
- `src/lib/akari.ts`: consultas (publicadas, pendientes, hilos con sus tres pasos).
- `src/components/`: cabecera, pieza, ficha, desarrollo, banda del hilo y fila de hilo.
- `src/pages/`: portada, noticia, hilo, materia y listado de hilos.
- `src/styles/global.css`: colores, tipografías y transiciones entre páginas.

## Diseño

- Tipografías: Instrument Serif cursiva para las palabras gigantes y Bricolage Grotesque para lo demás. Se sirven desde el propio proyecto (paquetes `@fontsource`), sin llamadas a Google.
- Color: blanco, tinta `#0d0d12` y un único acento `#2b3cff`.
- Movimiento: la palabra del tipo viaja hasta la cabecera de la pieza, el punto del hilo se desplaza entre pasos y el desarrollo se despliega sin saltos. Todo se desactiva si el sistema pide movimiento reducido.
