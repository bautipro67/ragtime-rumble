# 🌐 Leaderboard online de RAGTIME RUMBLE

**Estado: ✅ ACTIVO desde v1.5.** El juego ya viene con un leaderboard mundial funcionando —
no hay que configurar nada.

## Cómo funciona

- Almacén: un *bin* JSON público con CORS abierto en **extendsclass.com** (gratuito, sin cuenta):
  - `LB_URL = "https://extendsclass.com/api/json-storage/bin/eeceefb"` (en `game.js`)
- Cuando bates tu récord personal contra un jefe o completas el Boss Rush con récord,
  el juego **lee** la lista global, **mezcla** tu entrada y la **reescribe** recortada
  (top 50 de rush + top 150 de jefes).
- La pantalla **Récords** del Mausoleo muestra el TOP 5 mundial del Boss Rush.
- En Node (los tests) y sin conexión queda desactivado automáticamente
  (guarda `typeof process === "undefined"` en `lbOn()`).

## Limitaciones (honestas)

- **Sin protección contra trampas:** cualquiera con la URL puede escribir en el bin.
  Para un juego pequeño es aceptable; si se llena de basura, se limpia con un PUT `[]`.
- **Persistencia:** extendsclass puede purgar bins con meses de inactividad.
  El uso normal del juego lo mantiene vivo.
- El nombre publicado es `OPT.name` (por defecto `PIP`). Se puede editar en
  localStorage (`ragtime_opts`) o añadiendo una opción de nombre en el futuro.

## Si el bin muere: crear uno nuevo (1 minuto)

```powershell
Invoke-WebRequest -Method Post -Uri "https://extendsclass.com/api/json-storage/bin" `
  -Body "[]" -ContentType "application/json" -UseBasicParsing
```

La respuesta trae `"uri": "https://extendsclass.com/api/json-storage/bin/XXXXXXX"`.
Pega esa URI en `LB_URL` (game.js), regenera el zip y resube a itch.io.

## Mantenimiento

- **Ver la tabla:** abre la URL del bin en el navegador.
- **Limpiar la tabla:**
  ```powershell
  Invoke-WebRequest -Method Put -Uri "https://extendsclass.com/api/json-storage/bin/eeceefb" `
    -Body "[]" -ContentType "application/json" -UseBasicParsing
  ```

## Opción avanzada (futuro): servidor propio anti-trampas

Si algún día quieres validación, un **Cloudflare Worker** gratuito con KV puede sustituir
al bin: acepta `GET` (lista) y `POST` (entrada), valida tiempos plausibles (p. ej. rush
entre 60 s y 2 h), sanea nombres y limita por IP. Habría que cambiar `lbPost` a un POST
simple de la entrada (el worker hace la mezcla en el servidor). La versión anterior de
este documento traía ese worker completo; está en el historial de git/copias si hace falta.
