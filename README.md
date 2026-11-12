# Two Dice Tales para Foundry VTT

Sistema de juego de TDT para Foundry VTT 13 (versión 0.5.0): el módulo básico, sus reglas opcionales y los cinco módulos del manual.

Incluye identidad visual propia para Foundry: arte panorámico del sistema, logotipo, monograma y una familia de iconos para actores, objetos y compendios. Los originales editables están en `assets/branding/` y `assets/icons/`.

## Instalación

En Foundry, *Sistemas de juego → Instalar sistema*, pega esta URL de manifiesto y pulsa *Instalar*:

```
https://github.com/erjavierexba/two-dice-tales-foundry/raw/main/system.json
```

## Módulo básico

- Actores de tipo Personaje, PNJ, Vehículo y Arma estacionaria (y Mecha con el módulo de mechas).
- Características, habilidades, Percepción, defensas, vida, aguante, experiencia y punto de héroe.
- Tiradas activas y reactivas con cambio de dado, reparto automático del bonificador, penalización, dificultad, críticos y pifias.
- Ataques desde armas, aguante por Potencia y armaduras, aplicación de daño y ataque múltiple.
- Reglas contextuales de las dotes en el diálogo de tirada (bonifica, penaliza, cambios de dado, dificultad, recordatorios).
- Villanos con fuente de villano, escape magistral y turno extra (se reinicia al empezar cada combate).
- Experiencia: durante la creación los dados se eligen libremente; al pulsar *Terminar creación* quedan bloqueados y solo suben con *Mejorar* (por característica, dado defensivo o habilidad, o desde el menú general), que muestra el coste y no deja mejorar sin XP suficiente. El buscador de dotes tiene la casilla *Gastar experiencia*. Cada compra queda en el historial de la biografía y la última se puede deshacer.
- Pestaña *Acciones* en la ficha y ventana de acciones (botón de dados en los controles de token o macro *Acciones*): ataques con botones de ataque múltiple (×2, ×3…), defensas, habilidades entrenadas, hacks, poderes, magia y vehículos. Mayús+clic tira con las opciones por defecto, sin diálogo.
- Vehículos y armas estacionarias con ficha propia: tripulación (arrastra personajes o PNJ; el primero conduce u opera), maniobra y embestida con el Conducir del conductor, armas montadas que dispara cualquier tripulante con su Puntería, carga y destrucción a 0 PV. Si al vehículo le atacan en marcha, el conductor esquiva con Conducir; aparcado, usa su Esquiva fija. El DJ puede crear la ficha desde un vehículo del inventario.
- Pantalla del DJ (botón en los controles de token o macro *Pantalla del DJ*): dificultades, tiradas, combate, distancias y villanos; las reglas opcionales y los módulos activos de la partida; el grupo con su vida y XP (dar XP, descanso y descanso pequeño para todos); y contadores para planes maestros, alarmas o cuentas atrás.
- Dice So Nice (recomendado, no obligatorio): si está activo, el dado de característica sale azul y el de habilidad rojo. Se desactiva en los ajustes.

## Configuración

En *Configurar ajustes → Two Dice Tales* hay dos grupos de opciones.

**Módulos** (desactivados por defecto; cambiarlos recarga el mundo): fantástico, mechas, superpoderes, zombis y cyberpunk. Si un módulo está desactivado, se ocultan sus compendios, sus pestañas de la ficha y sus tipos de documento.

**Reglas opcionales**:

- Básico: personaje avanzado, reasignar dados defensivos, armas específicas, mejorar armas, estado de las armas y ataque múltiple de enemigos (−2 o −1).
- Fantástico: modo de magia (sencilla, círculos o ambos) y razas.
- Mechas: dotes Mechanime, límite de mejora de módulos y tabla de daños.
- Superpoderes: punto débil.
- Zombis: terror.
- Cyberpunk: reputación.

## Qué añade cada módulo

- **Fantástico**:
  - Arcano y Naturaleza.
  - Razas con efectos.
  - Magia sencilla (Incremental con reserva, Sacrificio).
  - Círculos mágicos con editor de marcas, cálculo de inscripción, dificultad y maná, y maná sustraído.
- **Mechas**:
  - Actor Mecha con piloto y copiloto.
  - Categoría, módulos de control (se suben desde la ficha), puntos de inventario y robustez.
  - Vincula voluntad (tercer dado), Golpe múltiple, carga, sobrecarga y recarga.
  - Tabla de daños opcional.
- **Superpoderes**:
  - Energía y habilidad Superpoder.
  - Poderes por ramas con Sobrecarga y Maldito.
  - Punto débil.
- **Zombis**:
  - Mordiscos y zombificación, Zombix y Antizombix.
  - Víveres y hambruna al final del día, y búsqueda de suministros.
  - Construcción y reparación, tablas de recompensas.
  - Grupos de zombis (los ataques y el límite de daño escalan con las unidades que quedan).
  - Terror.
- **Cyberpunk**:
  - Compatibilidad cibernética y tirada de exceso (absorto, se le va la pinza, desalineado).
  - Implantes con mejoras, instalación y retirada con cirujano.
  - Implantes supremos con coste permanente.
  - Hacking con el AVS (ranuras, usos por escena y Sobrecarga neural), hacks cargados y chips de habilidad.
  - Mejoras de armas, fuego de supresión y construcción con tres materiales.
  - Dinero y reputación.

## Compendios

El sistema trae 29 compendios, agrupados en carpetas por módulo, con las dotes, las armas, el equipo, los enemigos y los PNJ de cada módulo. También incluye los mechas y pilotos de ejemplo, los personajes de ejemplo del cyberpunk, las tablas de zombis y las macros *Acciones* y *Pantalla del DJ*.

Para copiar al mundo el contenido de los módulos activos, usa el botón del mensaje de bienvenida o ejecuta `game.tdt.importContent()`.

## Desarrollo

En este equipo, este repositorio se enlaza como `/home/javi/FoundryVTT/Data/systems/tdt`.

Los compendios se generan a partir del manual (`PorPartes/` del repositorio TDT). Por defecto se busca en una carpeta hermana llamada `TDT`; para usar otra ruta, define `TDT_MANUAL=/ruta/a/TDT`. `build-packs.mjs` usa el `classic-level` de la instalación de Foundry; si está en otro sitio, define `CLASSIC_LEVEL=/ruta/a/classic-level`.

Ojo: `data/modules-content.json` tiene retoques posteriores a la generación (por ejemplo, los implantes instalados de los personajes de ejemplo). Regenerarlo los pierde; revisa el diff antes de commitear. Para que los compendios no estén en uso al reescribirlos, Foundry tiene que estar cerrado:

```bash
node tools/build-basic-content.mjs    # data/basic-content.json
node tools/build-module-content.mjs   # data/modules-content.json
node tools/build-packs.mjs            # packs/ y system.json
```

Pruebas:

```bash
npm test          # unitarias (dados, módulos, experiencia, datos)
npm run test:e2e  # e2e en un Foundry real
```

Las pruebas e2e (`tests/e2e/`) arrancan un Foundry 13 aislado en un directorio temporal, con un mundo desechable y una copia del sistema (los packs del repo no se tocan), y lo manejan con Chrome sin ventana. Los dados se trucan para que cada tirada sea predecible. Necesitan:

- Foundry 13 instalado (`FOUNDRY_APP`, por defecto `~/ExecApps/FoundryVTT/FoundryVTT/resources/app`) y su licencia (`FOUNDRY_LICENSE`, por defecto la de `~/.local/share/FoundryVTT/Config`).
- Node 20 para el servidor (`FOUNDRY_NODE`; si no, se busca en nvm). Con Node 24 el cliente de Foundry no carga.
- Google Chrome (`CHROME_PATH`, por defecto `/usr/bin/google-chrome`).

Opciones: `TDT_E2E_ONLY=texto` (solo los casos que lo contengan), `TDT_E2E_VERBOSE=1` (registro del servidor), `TDT_E2E_HEADFUL=1` (Chrome con ventana), `TDT_E2E_PORT` (por defecto 30555).

La ficha incluye búsqueda instantánea en habilidades e inventario, se adapta al ancho real de la ventana y permite arrastrar/reordenar objetos con el comportamiento nativo de Foundry.

## Licencia

El código es MIT y el contenido de juego (`data/` y `packs/`) está bajo la ORC, como el manual. Detalles en [LICENSE](LICENSE).
