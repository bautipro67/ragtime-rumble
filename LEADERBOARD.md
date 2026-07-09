# 🌐 Leaderboard mundial de RAGTIME RUMBLE

Backend: **jsonbin.io** (funciona desde el navegador: lectura pública + escritura con clave, CORS y preflight OK — verificado en vivo).

## Estado actual

- **Bin del leaderboard (ya creado):** `6a4f2dd6da38895dfe440a51`
  - En `game.js`: `LB_BIN = "6a4f2dd6da38895dfe440a51"`
  - Leer la tabla es **público** (no necesita clave) → todos los jugadores YA ven el TOP mundial.
- **Escritura:** necesita una clave en `LB_KEY`. Mientras esté vacía, el juego **lee** el mundial pero **no publica** tiempos nuevos, y si no hay conexión muestra tu **Salón de la Fama local**.

## Falta 1 paso: pegar una ACCESS KEY (no la Master Key)

⚠️ La Master Key da acceso total a tu cuenta y quedaría pública en el `game.js`. Usa una **Access Key limitada**:

1. En **jsonbin.io** → menú de perfil → **API Keys** → pestaña **Access Keys** → **Create Access Key**.
2. Marca **solo** estos permisos: **Bin → Read** y **Bin → Update**. Deja el resto sin marcar (nada de Delete ni de cuenta).
3. Copia esa Access Key y pégala en `game.js`:
   ```js
   const LB_KEY = "TU_ACCESS_KEY_AQUÍ";
   ```
4. Regenera el zip y sube a GitHub/itch. ¡Listo, leaderboard mundial escribiendo!

Si alguien ve esa Access Key en el código, como mucho puede leer/actualizar ESE bin (nunca borrar tu cuenta ni otros bins). El peor caso es que ensucien la tabla; se limpia con un PUT `{"rush":[],"boss":[]}`.

## 🔴 IMPORTANTE — regenera tu Master Key

La Master Key que compartiste en el chat quedó expuesta ahí. Por seguridad:
**jsonbin.io → API Keys → regenerar / borrar** la Master Key vieja. El leaderboard NO la usa (usa la Access Key), así que regenerarla no rompe nada.

## Estructura del bin

```json
{ "rush": [ {"name":"PIP","time":214.3,"diff":"expert","at":1700000000000}, ... ],
  "boss": [ {"name":"PIP","time":41.2,"id":"spore","diff":"expert","at":...}, ... ] }
```
El cliente lee, añade tu récord, ordena por tiempo y recorta (rush: 100, boss: 200). La pantalla de Récords muestra el TOP 5 de `rush` (tu fila se resalta con "◄ TÚ").

## Mantenimiento

- **Ver la tabla:** `https://api.jsonbin.io/v3/b/6a4f2dd6da38895dfe440a51/latest` (header `X-Bin-Meta: false`) o desde tu panel de jsonbin.
- **Limpiar:** PUT ese bin con `{"rush":[],"boss":[]}` (con tu Access Key en `X-Access-Key`).
- **Si el bin se pierde:** crea otro (`POST https://api.jsonbin.io/v3/b` con `X-Master-Key`, body `{"rush":[],"boss":[]}`, header `X-Bin-Private: false`) y pon el nuevo id en `LB_BIN`.
