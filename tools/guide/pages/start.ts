import type { ZoneExit } from '../../../sim/content/types.ts';
import type { FlaskDef } from '../../../sim/content/flasks.ts';
import type { ActionDef, SlotDefault } from '../../../src/settings/bindings.ts';
import { actionTable } from '../../../src/settings/bindings.ts';
import type { GuideData } from '../data.ts';
import { item, skill, zone } from '../data.ts';
import { bullets, esc, kbd, link, list, note, para, percent, section, seconds, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';

const KEY_NAMES: Readonly<Record<string, string>> = {
  mouse_left: 'Clic izquierdo',
  mouse_right: 'Clic derecho',
  Space: 'Espacio',
  Tab: 'Tab',
  Escape: 'Esc',
  AltLeft: 'Alt',
  AltRight: 'Alt',
};

export function keyName(code: string): string {
  const named: string | undefined = KEY_NAMES[code];
  if (named !== undefined) return named;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function keys(codes: readonly string[]): string {
  const names: string[] = [...new Set(codes.map(keyName))];
  return names.map(kbd).join(' o ');
}

function slotDefaults(data: GuideData): SlotDefault[] {
  return data.content.player.skillBar.map((slot): SlotDefault => ({ name: slot.skill === null ? `Espacio de habilidad ${slot.label}` : skill(data, slot.skill).name, bindings: slot.bindings }));
}

export function controlRows(data: GuideData): string[][] {
  const actions: readonly ActionDef[] = actionTable(slotDefaults(data), { flasks: data.content.flasks.length, ladder: true });
  return actions.filter((action: ActionDef): boolean => action.defaults.length > 0).map((action: ActionDef): string[] => [esc(action.label), keys(action.defaults)]);
}

function flask(data: GuideData, resource: FlaskDef['resource']): FlaskDef {
  const found: FlaskDef | undefined = data.content.flasks.find((entry: FlaskDef): boolean => entry.resource === resource);
  if (found === undefined) throw new Error(`no ${resource} flask`);
  return found;
}

function flaskLine(entry: FlaskDef, key: number): string {
  const uses: number = Math.floor(entry.maxCharges / entry.chargesPerUse);
  return `<b>${esc(entry.name)}</b> con ${kbd(String(key))}: recupera ${percent(entry.share)} de tu máximo de ${entry.resource} durante ${seconds(entry.duration)}, y nunca menos de ${entry.amount}. Tiene ${entry.maxCharges} cargas y cada uso consume ${entry.chargesPerUse}, así que llena equivale a ${uses} usos. Cada baja devuelve ${entry.chargesPerKill} cargas.`;
}

export function gateLevel(data: GuideData): number {
  const exit: ZoneExit | undefined = zone(data, 'hall_of_time').exits.find((entry: ZoneExit): boolean => entry.to === 'keepers_gate');
  const level: number | undefined = (exit?.requires ?? []).flatMap((condition): number[] => (condition.type === 'level' ? [condition.atLeast] : []))[0];
  if (level === undefined) throw new Error('the Last Gate has no level');
  return level;
}

function questNames(data: GuideData): string[] {
  return [...data.content.quests.values()].map((quest): string => `<b>${esc(quest.name)}</b>`);
}

function hideoutPeople(data: GuideData): string[] {
  return [...data.content.npcs.values()].map((npc): string => esc(npc.name));
}

export function startPage(data: GuideData): PageBody {
  const life: FlaskDef = flask(data, 'life');
  const mana: FlaskDef = flask(data, 'mana');
  const trade = data.content.trade;
  const penalty: string = percent(data.content.player.deathPenalty.xpPercent);
  const gate: number = gateLevel(data);
  return {
    kicker: 'Guía',
    title: 'Primeros pasos',
    lede: 'Las teclas, tus primeros diez minutos y unas cuantas cosas que nadie te cuenta.',
    description: 'Cómo empezar en The Lost Storm: controles en computadora y teléfono, los primeros diez minutos, frascos, El Refugio, el comerciante, la casa de subastas, el punto de ruta y el mapa.',
    body: [
      section(
        'controls',
        'Controles',
        [
          para('Haz clic en el suelo para caminar hasta ahí. Haz clic en un enemigo para atacarlo, en un objeto para recogerlo, en una persona para hablar y en una salida para atravesarla. Mantén presionado el botón para seguir caminando o atacando. Mantén presionada la tecla Shift mientras haces clic para atacar desde donde estás, sin caminar. La rueda del mouse sirve para acercar y alejar la vista.'),
          table({ head: ['Acción', 'Tecla'], rows: controlRows(data), caption: 'Las teclas con las que empieza un personaje nuevo' }),
          para(`Puedes cambiar todas las teclas, excepto el botón izquierdo del mouse, Shift y Enter, en ${kbd('Esc')} → Ajustes → Controles. La mayoría de los espacios de habilidad empiezan vacíos: la habilidad que elijas en el ${link('/guide/tree/', 'árbol de habilidades')} ocupa el primero libre. La clasificación solo se abre cuando el juego está conectado a su servidor.`),
          subsection(
            'En un teléfono',
            bullets([
              'Gira el teléfono de lado.',
              'Arrastra en cualquier parte del lado izquierdo de la pantalla para caminar o toca el suelo.',
              'Toca a un enemigo para atacarlo. Pellizca la pantalla para acercar o alejar la vista.',
              'Los botones de habilidades apuntan al enemigo más cercano que esté frente a ti, así que casi nunca necesitas apuntar por tu cuenta.',
              'Los botones de los frascos muestran cuántas dosis le quedan a cada uno.',
              'Los botones de la parte superior abren el inventario, la hoja del personaje, el árbol de habilidades, el mapa y el menú. El botón de etiquetas muestra los nombres de todo lo que hay en el suelo, como cuando mantienes presionada la tecla Alt.',
            ]),
          ),
        ].join('\n'),
      ),
      section(
        'first',
        'Los primeros diez minutos',
        [
          para(
            `Despiertas en ${esc(zone(data, 'between').name)} con las manos vacías. Lee ${esc(item(data, 'worn_journal').name)} y aparecerá un arma: el hombre encuentra ${esc(item(data, 'rusted_blade').name)} y la mujer, ${esc(item(data, 'worn_crossbow').name)}. La salida se abre cuando tengas ambas cosas.`,
            `${esc(zone(data, 'hall_of_time').name)} es donde se combate. Ahí aprenderás a rodar con ${kbd('Espacio')}: ${esc(skill(data, 'dodge_roll').description)} Úsala. Una rodada en el momento justo salva más vida que cualquier frasco.`,
            'Los enemigos aparecen en grupos y su nivel se ajusta al tuyo, así que El Salón del Tiempo sigue siendo un desafío justo a medida que avanzas. En algún lugar encontrarás tu primer momento: una burbuja en el aire. Entra y se cerrará a tu alrededor; lo que haya dentro se volverá contra ti. Elimínalo para salir. Si sales antes, la burbuja se desvanece y vuelve unos segundos después.',
            `Tu primer momento y la primera lección del Guardián te dan cada uno un punto para el ${link('/guide/tree/', 'árbol de habilidades')}, además de los puntos que recibes por nivel. Gástalos; no hay razón para guardarlos.`,
            `Al este del Salón está ${esc(zone(data, 'hideout').name)}. El camino a ${esc(zone(data, 'keepers_gate').name)}, donde espera el jefe, no se abrirá hasta el nivel ${gate}.`,
          ),
          para(`Estas son tus misiones en orden: ${list(questNames(data))}. Un ${kbd('!')} dorado marca a la persona o el lugar que indica tu paso actual. Si no escuchaste lo que dijo un Guardián, vuelve a hablar con él y te lo repetirá.`),
        ].join('\n'),
      ),
      section(
        'flasks',
        'Frascos',
        [
          para('Todos llevan los mismos dos frascos. Nunca se caen, no ocupan espacio en tu bolsa y no hace falta reemplazarlos.'),
          bullets([flaskLine(life, 1), flaskLine(mana, 2)]),
          para(`Un frasco no hace nada si ya tienes toda la vida o el maná, así que nunca desperdicias una dosis. Debes esperar ${seconds(life.cooldown)} entre usos. Ambos se llenan por completo cada vez que llegas al Refugio o pisas un punto de ruta.`),
          note('Úsalo antes de que lo necesites. La vida se recupera a lo largo de un par de segundos, no de golpe.'),
        ].join('\n'),
      ),
      section(
        'hideout',
        'El Refugio',
        [
          para(`${esc(zone(data, 'hideout').name)} es el único lugar seguro; ningún enemigo llega hasta ahí. Encontrarás a ${list(hideoutPeople(data))}, un baúl con espacio para ${trade.stashSize} objetos y el punto de ruta. Si el juego está conectado a su servidor, también verás a otros jugadores y podrás hablar con ellos: presiona ${kbd('Enter')} para chatear.`),
          para(`Al morir pierdes el ${penalty} de la experiencia que necesitas para subir de nivel (nunca pierdes el nivel) y reapareces al poco tiempo, protegido de todo daño durante ${seconds(data.content.player.respawnInvulnerability)}. Puedes volver al último punto de control que hayas pasado o junto a la fogata del Refugio.`),
        ].join('\n'),
      ),
      section(
        'trader',
        'El comerciante',
        [
          para(`El comerciante Guardián siempre tiene ${trade.stockSize} objetos a la venta, más o menos de tu nivel: en su mayoría comunes, algunos mágicos y, de vez en cuando, uno raro. Su inventario cambia cada vez que vuelves de otra zona, así que revísalo después de cada viaje.`),
          para(`Al venderle al comerciante recibes el ${percent(trade.price.sellRatio)} de lo que costaría comprar el objeto. ¿Vendiste algo por error? Puedes recomprar los últimos ${trade.buybackSize} objetos que vendiste por el mismo precio que recibiste. Los objetos de misión no se pueden vender.`),
        ].join('\n'),
      ),
      section(
        'auction',
        'La casa de subastas',
        [
          para('El Guardián Subastador administra la casa de subastas, donde los jugadores comercian entre sí. Para usarla, el juego debe estar conectado a su servidor y tu personaje debe estar guardado allí.'),
          terms([
            ['Explorar', 'Todo lo que está a la venta, filtrado por espacio, rareza, nivel y precio.'],
            ['Vender', 'Poner a la venta un objeto de tu inventario.'],
            ['Mis objetos', 'Lo que tienes a la venta y lo que ya se vendió.'],
            ['Historial', 'Todas las ventas realizadas.'],
          ]),
          para('Solo puedes vender a otros jugadores los objetos que encontraste en el mundo. No puedes vender los que compraste al comerciante ni los objetos de misión. El Guardián Subastador te dirá por qué no se puede vender un objeto antes de que lo intentes.'),
        ].join('\n'),
      ),
      section(
        'map',
        'Punto de ruta y mapa',
        [
          para(`Pisa un punto de ruta para activarlo: llenará tus frascos y será un lugar al que podrás volver. Por ahora, el único punto de ruta está en ${esc(zone(data, 'hideout').name)}.`),
          para(`${kbd('M')} abre el mapa de todos los lugares que encontraste. ${kbd('Tab')} cambia el minimapa de la esquina por uno grande que ocupa toda la pantalla; al hacer clic en el minimapa, caminarás hasta ese lugar.`),
          para(`Mantén presionada ${kbd('Alt')} para mostrar el nombre de cada objeto en el suelo. No recogerás nada hasta que hagas clic.`),
        ].join('\n'),
      ),
      section('next', 'A dónde ir después', para(`Lee ${link('/guide/combat/', 'cómo funciona el combate')} y luego elige una ${link('/guide/builds/', 'configuración')} y sigue su ruta. La puerta se abre en el nivel ${gate}, pero el jefe es más fácil uno o dos niveles después.`)),
    ].join('\n'),
  };
}
