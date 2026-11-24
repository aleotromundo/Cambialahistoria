# Audio local de reemplazo

Este directorio contiene un paquete de audio de reemplazo para builds locales y standalone.

- `music/cambialahistoria_exploration.mp3` es una pista instrumental original generada para este proyecto: fantasía oscura, exploración y tormenta, sin voces. Se usa como loop musical continuo en el lobby.
- Los WAV de `generated/` son efectos y ambientes procedurales de reemplazo. No son las grabaciones privadas de producción del juego original.
- El manifiesto asigna los identificadores de `data/audio.json` a los archivos incluidos.
- Para usar un servidor autorizado de assets de producción, definir `VITE_ASSET_BASE` antes de iniciar el servidor de desarrollo.

La pista musical no incorpora material de terceros ni depende de la distribución de los audios privados del juego original.
