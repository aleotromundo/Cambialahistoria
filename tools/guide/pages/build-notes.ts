import type { GuideData } from '../data.ts';
import { guideData, item, path, place, skill } from '../data.ts';
import {
  affixLine,
  afterRouteText,
  bossLevels,
  bossSpeedRank,
  carelessBossShare,
  carelessDeaths,
  deathWords,
  groupNeeds,
  groupWeapons,
  manaWeapons,
  modShare,
  placeLevel,
  speedRank,
  steadyBossShare,
  steadyBossLife,
  steadyDeaths,
  weaponNames,
} from '../facts.ts';
import { esc, percent } from '../html.ts';
import type { BuildNotes } from './build-page.ts';
import { buildName } from './build-page.ts';

function name(data: GuideData, id: string): string {
  return esc(place(data, id).name);
}

function skillName(data: GuideData, id: string): string {
  return esc(skill(data, id).name);
}

function pathName(data: GuideData, id: string): string {
  return esc(path(data, id).name);
}

function tank(data: GuideData): BuildNotes {
  const id: string = 'bulwark';
  const keystone: number = placeLevel(data, id, 'the_unmoved');
  const slow: string = percent(modShare(data, 'the_unmoved', 'moveSpeed'));
  const armour: string = percent(modShare(data, 'the_unmoved', 'armour'));
  const heave: number = placeLevel(data, id, 'heaving_cleave');
  const [first = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: 'Para quienes quieren un arma grande, golpes contundentes y salir caminando de cada pelea.',
    plays: [
      `Te plantas entre la multitud y dejas que arda. Emberwarden recorre ${pathName(data, 'stone')}, la ruta del fuego, la vida y la armadura, con ${groupNeeds(data, 'heavy')} en las manos: cada nodo de la ruta solo funciona mientras tengas una. Al principio invierte poco en daño y se vuelve difícil de matar; después cruza a ${pathName(data, 'echo')} para obtener habilidades que golpean a grupos enteros.`,
      `Tu primer punto es ${skillName(data, 'thunderclap')}: cuando el grupo te rodee, golpea el suelo para lanzarlos hacia atrás, aturdirlos y prenderles fuego. ${skillName(data, 'held_breath')} llega al nivel ${placeLevel(data, id, 'stone_held_breath')}. Úsala cuando te rodeen o un enemigo grande prepare un ataque: todo a tu alrededor se mueve a paso de tortuga, menos tú.`,
      `Al nivel ${placeLevel(data, id, 'shoulder_through')}, ${name(data, 'shoulder_through')} convierte tu rodada en una embestida que termina en una explosión de fuego, así que salir del grupo también es atacar. ${skillName(data, 'banked_fire')} llega al nivel ${placeLevel(data, id, 'stone_banked_fire')}: un fuego a tu alrededor que arde con más intensidad por cada segundo que los enemigos permanezcan en él.`,
      `Al nivel ${heave}, ${name(data, 'heaving_cleave')} te permite mantener presionada ${skillName(data, 'cleave')}: al soltarla, un barrido pesado aleja todo lo que tienes enfrente. ${skillName(data, 'fire_slam')} llega al nivel ${placeLevel(data, id, 'stone_fire_burst')}: baja el arma y una línea de fuego abre el suelo frente a ti, aparta al grupo y quema a quien la atraviese.`,
      `Al nivel ${keystone} eliges ${name(data, 'the_unmoved')}: ${armour} más de armadura, más vida y más daño, pero te mueves ${slow} más lento. Dejas de ser rápido, y también de estar en peligro.`,
    ],
    lean: [
      `Apóyate en ${skillName(data, 'cleave')} manteniéndola presionada. El barrido de ${name(data, 'heaving_cleave')} golpea mucho más fuerte que un ataque rápido y aleja al grupo.`,
      `${skillName(data, 'thunderclap')} no es tu fuente de daño; sirve para que dejen de golpearte mientras preparas el barrido. Enciende ${skillName(data, 'banked_fire')} y quédate dentro: al principio es débil, pero al final arde el doble. ${skillName(data, 'held_breath')} tarda mucho en volver, así que resérvala para cuando la pelea se complique.`,
    ],
    lookFor: [
      `Un arma pesada: ${weaponNames(groupWeapons(data, 'heavy'))}. Golpean mucho más fuerte, ideal para un barrido cargado.`,
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
      affixLine(data, 'plated'),
      affixLine(data, 'sturdy'),
      affixLine(data, 'mending'),
    ],
    avoid: [
      `Cualquier arma que no sea pesada. Con una espada, un bastón o una ballesta en las manos, ${pathName(data, 'stone')} conserva la vida, la armadura y el fuego, pero no el daño que aporta al arma; ${name(data, 'heaving_cleave')} y ${name(data, 'shoulder_through')} dejan de modificar tus habilidades, y el Árbol de habilidades muestra esas líneas tachadas.`,
      'Cambiar vida o armadura por daño en el equipo. El árbol te dará daño más adelante; el equipo te mantiene en pie.',
      'Perseguir enemigos veloces por todo el mapa. Deja que se acerquen.',
    ],
    legendaries: [
      { item: 'groundbreaker', changes: `Cada golpe contra un grupo activa ${skillName(data, 'thunderclap')}, y cuanto más tiempo permanezcas en su efecto, más difícil será hacerte daño.` },
      { item: 'anvilback_hauberk', changes: `Un barrido cargado golpea en ambas direcciones: al frente y alrededor con ${skillName(data, 'thunderclap')}, además de darte armadura por cada enemigo alcanzado.` },
      { item: 'bellwether_helm', changes: 'Recibir golpes se convierte en un arma. Métete entre los enemigos y el yelmo responderá por ti.' },
    ],
    chase: `Es un arma, así que no ocupa un espacio que necesites para armadura, y sus activaciones de ${skillName(data, 'thunderclap')} vienen de ${skillName(data, 'cleave')}, que usas constantemente.`,
    strengths: [
      `Supervivencia. En las mediciones ${deathWords(steadyDeaths(data, id))} jugando con cuidado y ${deathWords(carelessDeaths(data, id))} jugando sin cuidado.`,
      `El jefe, incluso con errores. Jugando sin cuidado ganó ${percent(carelessBossShare(data, id, first))} de sus peleas contra el jefe de nivel ${first}.`,
    ],
    weakSpots: [
      `Peleas rápidas contra jefes. Contra el jefe de nivel ${first}, fue la ${bossSpeedRank(data, id, first)} configuración en ganar: vence, pero se toma su tiempo.`,
      'Enemigos que huyen o atacan desde lejos. Te acercas caminando despacio.',
    ],
    thin: [
      `El juego no tiene una categoría de armas de dos manos como tal. Las armas pesadas son mazas, mazos y espadones: golpean más fuerte.`,
      'El jugador simulado equipa lo que más aumenta su daño y resistencia, no necesariamente un arma pesada; por eso, estas cifras corresponden a la ruta, no al arma.',
    ],
    marks: {
      stone_thunderclap: 'Tu primer punto. Te da espacio para respirar desde la primera pelea.',
      tempered_body: 'Vida y regeneración de vida al principio. Aquí la configuración empieza a sentirse resistente.',
      shoulder_through: 'La rodada se convierte en una embestida que termina en fuego.',
      stone_banked_fire: 'Un fuego a tu alrededor que se intensifica mientras los enemigos permanezcan en él.',
      heaving_cleave: 'Mantén presionado Cleave para ejecutar el gran barrido. La configuración empieza aquí.',
      the_unmoved: `${armour} más de armadura, más vida y más daño; ${slow} más lento.`,
      worn_groove: 'A partir de aquí, la ruta se orienta al daño de área.',
    },
    afterRoute: afterRouteText(data, id, 'Más vida y más daño de área. Nada de lo que sigue te vuelve más vulnerable.'),
  };
}

function whirlwind(data: GuideData): BuildNotes {
  const id: string = 'whirlwind';
  const whirl: number = placeLevel(data, id, 'whirling_cleave');
  const endless: number = placeLevel(data, id, 'endless_turn');
  const wake: number = placeLevel(data, id, 'long_wake');
  const undertow: number = placeLevel(data, id, 'wind_downdraught');
  const riptide: number = placeLevel(data, id, 'riptide');
  const race: number = placeLevel(data, id, 'blade_millrace');
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const wheel: string = skillName(data, 'cleave_millwheel');
  const millwheel: string = esc(item(data, 'the_millwheel').name);
  const [first = 0, second = 0, top = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: wheel,
    forWho: 'Para quienes quieren girar entre los enemigos, arrastrarlos consigo y recuperar vida de la pelea sin detenerse.',
    plays: [
      `El Torbellino recorre ${pathName(data, 'blade')} con ${groupNeeds(data, 'blade')} en las manos: el giro y las habilidades relacionadas son más fuertes mientras tengas una. Al nivel ${whirl}, ${name(data, 'whirling_cleave')} convierte ${skillName(data, 'cleave')} en un giro completo que golpea todo a tu alrededor. Al nivel ${endless}, ${name(data, 'endless_turn')} lo convierte en ${wheel}: mantenla presionada y seguirás girando mientras corres.`,
      `Cada enemigo que golpea ${wheel} acumula impulso: giras más rápido, alcanzas un área mayor y nada puede derribarte. Justo después, ${name(data, 'millstone')} permite acumular más impulso y más que duplica la proporción del daño que recuperas como vida, así que girar entre los enemigos te mantiene en pie.`,
      `Al nivel ${undertow} aprendes ${skillName(data, 'downdraught')}: un remolino que lanzas hacia donde apuntas y junta a los enemigos para golpearlos a todos de un giro.`,
      `Al nivel ${riptide}, tu rodada se convierte en ${skillName(data, 'dodge_roll_riptide')}: rueda más lejos, deja una corriente de retorno al aterrizar y arrastra a los enemigos hacia ti. Al nivel ${race} aprendes ${skillName(data, 'millrace')}: suelta ${wheel} y libera su impulso en una ola que atraviesa al grupo. Cuanto más la hayas mantenido, más fuerte, amplia y lejana será, y más tiempo aturdirá a todo lo que golpee. Lánzala contra el grupo y luego gira entre los enemigos mientras están inmóviles. Desde entonces, por cada cuatro enemigos que golpee ${wheel}, cada frasco recupera una carga.`,
      `Al nivel ${wake}, ${name(data, 'long_wake')} mantiene el impulso por más tiempo después del último golpe, para que pase de un grupo al siguiente. Está después de ${name(data, 'racing_cloud')}, un nodo de ballesta: con una espada solo aporta velocidad de movimiento, pero la ruta lo atraviesa para llegar a lo que sigue.`,
      `Al nivel ${echoes}, la ruta cruza a ${pathName(data, 'echo')} para obtener ${name(data, 'twice_swung')}. El giro sostenido no crea un eco; en cambio, cada vuelta golpea más fuerte.`,
    ],
    lean: [
      `${wheel} es el botón que mantienes presionado. Cada golpe devuelve un poco de maná, mientras que girar en el aire solo lo consume; mantenlo girando entre los enemigos, no entre grupos.`,
      `Como blande tu arma, el daño de esta constituye la mayor parte de tu daño. Cada nodo de la ruta que indique «habilidades de arma», «daño» o «velocidad de ataque» hace que cada giro golpee más fuerte o llegue antes.`,
      `${millwheel}, una espada legendaria, convierte por sí sola ${skillName(data, 'cleave')} en ${wheel}, mucho antes de ${name(data, 'endless_turn')}. Como es una espada, todos los nodos de ${pathName(data, 'blade')} siguen contando al llevarla.`,
    ],
    lookFor: [
      `Una espada que haga más daño sin atacar más despacio: ${weaponNames(groupWeapons(data, 'blade'))}. Primero fíjate en el rango de daño.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'fleet'),
      affixLine(data, 'hale'),
      affixLine(data, 'jagged'),
    ],
    avoid: [
      `Cualquier arma que no sea espada. Con un arma pesada, un bastón o una ballesta, ${skillName(data, 'cleave')} deja de girar, pierdes ${wheel}, y ${pathName(data, 'blade')} conserva ${skillName(data, 'downdraught')}, ${skillName(data, 'millrace')}, su vida y su velocidad, pero no el daño de arma.`,
      'Detenerte. El impulso se desvanece poco después del último golpe, y un giro que empieza en frío es lento.',
    ],
    legendaries: [
      { item: 'the_millwheel', changes: `${skillName(data, 'cleave')} se convierte en un giro que mantienes mientras corres, así que nunca tienes que detenerte para atacar.` },
      { item: 'gyre_stitched_breeches', changes: `El giro arrastra al grupo hacia sí, y cada tercera vuelta lanza un ${skillName(data, 'thunderclap')} desde el centro.` },
      { item: 'grinders_bracers', changes: 'Cuantos más enemigos golpeas, más rápido y fuerte atacas.' },
    ],
    chase: `Las otras dos también funcionan con ${skillName(data, 'cleave_whirl')}, pero Millwheel es el giro para el que fueron diseñadas: no termina mientras lo mantengas presionado.`,
    strengths: [
      'Multitudes. Cada vuelta golpea todo a tu alrededor y, cuantos más enemigos alcanza, más rápido giras.',
      `Subir de nivel. Fue la configuración ${speedRank(data, id, second)} en alcanzar el nivel ${second}.`,
      'Movilidad. Sigues girando mientras corres, así que un grupo y el siguiente se convierten en una sola pelea.',
      `El jefe, cuando la configuración ya está desarrollada. Al nivel ${top} ganó ${percent(steadyBossShare(data, id, top))} de sus peleas jugando con cuidado y terminó con ${percent(steadyBossLife(data, id, top))} de vida en promedio.`,
    ],
    weakSpots: [
      `El jefe en los primeros niveles. Al nivel ${first} ganó ${percent(steadyBossShare(data, id, first))} de sus peleas jugando con cuidado y ${percent(carelessBossShare(data, id, first))} sin cuidado: el jefe es un solo enemigo, y un giro pensado para grupos acumula poco impulso contra uno.`,
      `Los errores. Hay poco que te proteja de los golpes: jugando sin cuidado, ${deathWords(carelessDeaths(data, id))}.`,
    ],
    thin: [],
    marks: {
      heavy_hands: 'El espacio que más aumenta el daño al principio.',
      whirling_cleave: 'La configuración empieza aquí.',
      endless_turn: `Tu giro se convierte en el ${wheel}.`,
      millstone: 'Más impulso y más daño recuperado como vida.',
      blade_millrace: `Suelta ${wheel} y libera su impulso en una ola que aturde al grupo.`,
      racing_cloud: 'Un nodo de ballesta: con una espada solo aporta velocidad de movimiento. Conduce al siguiente.',
      long_wake: 'Impulso que dura de un grupo al siguiente.',
      twice_swung: 'El giro sostenido no produce eco; en cambio, golpea más fuerte.',
    },
    afterRoute: afterRouteText(data, id, 'Más daño y más formas de moverte.'),
  };
}

function caster(data: GuideData): BuildNotes {
  const id: string = 'stormcaller';
  const lance: number = placeLevel(data, id, 'storm_lance');
  const twice: number = placeLevel(data, id, 'twice_told_bolt');
  const keystone: number = placeLevel(data, id, 'eye_of_the_storm');
  const lifeCut: string = percent(modShare(data, 'eye_of_the_storm', 'maxLife'));
  const bolt: string = skillName(data, 'storm_bolt');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: 'Para quienes quieren luchar a distancia y dejar que los relámpagos hagan el trabajo.',
    plays: [
      `El Invocador de tormentas recorre ${pathName(data, 'storm')} con ${groupNeeds(data, 'staff')} en las manos. Casi todos los nodos de la ruta solo funcionan mientras tengas uno; con cualquier otra arma, los nodos de relámpago conservan la vida y el maná, pero pierden el daño. Tu primer punto es ${bolt}, y desde entonces será el botón que presiones.`,
      `${name(data, 'forked_bolt')} pronto hace que cada lanzamiento dispare más rayos, y ${skillName(data, 'squall')} también llega temprano: métete entre los enemigos y se forma a tu alrededor, golpeando todo lo que cubre cada medio segundo mientras sigues lanzando hechizos.`,
      `Al nivel ${lance}, ${name(data, 'storm_lance')} transforma ${bolt} en una línea recta de relámpagos que golpea a la vez todo lo que atraviesa. Al nivel ${twice}, ${name(data, 'twice_told_bolt')} le da una segunda forma: un rayo cuyo eco vuela por el mismo trayecto un instante después. ${bolt} usa una forma a la vez: elige cuál en la ficha del nodo en el Árbol de habilidades o haz clic derecho en la habilidad de tu barra (mantenla presionada en el teléfono).`,
      `Al nivel ${keystone} eliges ${name(data, 'eye_of_the_storm')}. Cuesta ${lifeCut} de tu vida y potencia mucho tus relámpagos. ${skillName(data, 'standing_storm')} llega al nivel ${placeLevel(data, id, 'standing_thunder')}: una tormenta a tu alrededor que te cura por cada enemigo que golpea, para esos momentos en que el grupo sí logra alcanzarte. Después viene ${name(data, 'static_step')}, que reduce el tiempo de espera de tu rodada y te lleva más lejos.`,
    ],
    lean: [
      `Cada lanzamiento de ${bolt} cuesta un poco de maná. Tu límite es el maná, no el tiempo de espera. Para eso están los nodos de la ruta que añaden maná y el frasco de maná en la tecla 2.`,
      `Tus habilidades siguen sumando el daño del arma, así que ayuda tener un bastón con más daño. Al principio ayuda aún más un bastón que aporte maná.`,
      `Elige ${name(data, 'storm_lance')} contra grupos que se acerquen en línea y ${name(data, 'twice_told_bolt')} contra un solo enemigo grande. Puedes cambiar entre ellas cuando quieras, sin costo.`,
    ],
    lookFor: [
      `Un bastón: ${weaponNames(groupWeapons(data, 'staff'))}. Los que añaden maná son los más útiles: ${weaponNames(manaWeapons(data))}.`,
      affixLine(data, 'brimming'),
      affixLine(data, 'clear'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
      affixLine(data, 'grounded'),
    ],
    avoid: [
      `Cualquier arma que no sea bastón. ${bolt} se sigue lanzando y ${name(data, 'storm_lance')} aún la transforma, pero ${pathName(data, 'storm')} deja de aumentar su daño, ${name(data, 'twice_told_bolt')} deja de modificarla y el Árbol de habilidades muestra esas líneas tachadas.`,
      'Velocidad de ataque en el equipo. No hace que lances hechizos más rápido.',
      `Quedarte entre la multitud. ${name(data, 'storm_lance')} dispara en línea recta: aléjate para que los enemigos se acerquen alineados con ella.`,
    ],
    legendaries: [
      { item: 'crown_of_the_struck_hour', changes: `Cada ${skillName(data, 'storm_bolt')} se convierte en dos: el rayo y una ${skillName(data, 'forkline')} que parte del primer enemigo que golpea.` },
      { item: 'lantern_of_second_sounds', changes: 'Los relámpagos llegan más lejos dentro del grupo y descargan su golpe más fuerte en el último enemigo, no en el primero.' },
      { item: 'rainmaker', changes: `Cada ${skillName(data, 'squall')} que invocas también estalla sobre ti, así que la tormenta te acompaña y cada área que dejas atrás dura más.` },
    ],
    chase: `${skillName(data, 'storm_bolt')} es el botón que más presionas, y la Corona convierte cada lanzamiento también en una ${skillName(data, 'forkline')}.`,
    strengths: [
      `Grupos que se acercan desde un lado. ${name(data, 'storm_lance')} golpea toda la línea.`,
      `El jefe cuando la configuración ya está completa. Al nivel ${second} fue la configuración ${bossSpeedRank(data, id, second)} en vencerlo.`,
    ],
    weakSpots: [
      'Quedarte sin maná en una pelea larga. Usa el frasco antes de vaciarte, no después.',
      `Que te atrapen. Al elegir ${name(data, 'eye_of_the_storm')} tienes poca vida. Jugando sin cuidado ganó ${percent(carelessBossShare(data, id, first))} de sus peleas contra el jefe de nivel ${first}.`,
      'Enemigos rodeándote. Sal de ahí para que vuelvan a estar todos de un lado.',
    ],
    thin: [],
    marks: {
      storm_storm_bolt: 'Tu primer punto y, desde ahora, tu habilidad principal.',
      storm_lance: 'La configuración empieza aquí.',
      eye_of_the_storm: `Aquí sacrificas ${lifeCut} de tu vida a cambio de mucho más daño de relámpago.`,
      rolling_thunder: `Este nodo modifica ${skillName(data, 'thunderclap')}, una habilidad que esta configuración no tiene. La ruta lo atraviesa para llegar al nodo clave.`,
      twice_told_bolt: `Una segunda forma para ${bolt}. Elige cuál usa en la ficha de este nodo.`,
      standing_thunder: 'Una tormenta a tu alrededor que te cura mientras golpea.',
    },
    afterRoute: afterRouteText(data, id, 'Más relámpagos y más maná, todo sigue dependiendo del bastón.'),
  };
}

function echoer(data: GuideData): BuildNotes {
  const id: string = 'echo-weaver';
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const forked: number = placeLevel(data, id, 'forked');
  const keystone: number = placeLevel(data, id, 'twice_remembered');
  const brand: number = placeLevel(data, id, 'blade_static_brand');
  const fork: string = skillName(data, 'forkline');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: 'tu ataque principal',
    forWho: 'Para quienes quieren que cada golpe impacte dos veces, sin importar qué arma lleven.',
    plays: [
      `${pathName(data, 'echo')} no requiere un arma ni tiene elemento: se adapta a lo que lleves. Tu primer punto es ${fork}, relámpagos que saltan de un enemigo a otro; justo después, ${name(data, 'first_echo')} hace que todas las habilidades de área duren más y golpeen con más fuerza.`,
      `Al nivel ${echoes}, ${name(data, 'twice_swung')} hace que tu ataque principal ocurra dos veces: un instante después de acertar, su eco vuelve a golpear de la misma forma con la mitad del daño. Tu ataque principal depende de tu arma: ${skillName(data, 'cleave')} y sus giros con una espada o un arma pesada, ${skillName(data, 'quarrel')} con una ballesta, ${skillName(data, 'storm_bolt')} con un bastón. Un giro mantenido no produce eco; en cambio, golpea más fuerte.`,
      `Al nivel ${forked}, ${name(data, 'forked')} permite que cada impacto de tu ataque principal lance una ${fork} desde el enemigo golpeado. Al nivel ${keystone}, ${name(data, 'twice_remembered')} sacrifica un poco de daño en todo a cambio de habilidades de área más grandes y duraderas, y un menor tiempo de espera para ${skillName(data, 'held_breath')}.`,
      `${skillName(data, 'static_brand')} llega al nivel ${brand}: marca al primer enemigo que toca, y tu siguiente impacto sobre él hace estallar la marca contra todo lo que lo rodea. Como tu ataque principal golpea dos veces, la marca no tarda en estallar.`,
    ],
    lean: [
      'Tu ataque principal es el botón que mantienes presionado. Cada eco vuelve a golpear gratis y cada impacto puede lanzar una Línea ramificada, así que la configuración es más fuerte contra grupos.',
      `Marca al enemigo más grande del grupo con ${skillName(data, 'static_brand')} y luego golpéalo: la explosión alcanzará a los demás.`,
      `Los últimos nodos de esta ruta vienen de ${pathName(data, 'storm')} y potencian los relámpagos de ${fork}. Funcionan con cualquier arma, pero sus bonificaciones al daño del arma solo aplican con ${groupNeeds(data, 'staff')}.`,
    ],
    lookFor: [
      'Un arma mejor del tipo que ya tienes en las manos. El eco copia su daño.',
      affixLine(data, 'honed'),
      affixLine(data, 'keen'),
      affixLine(data, 'brimming'),
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
    ],
    avoid: [
      'Cambiar de arma para cada pelea. Todas las habilidades funcionan con cualquier arma, pero las habilidades de cada rama son más fuertes con su arma correspondiente, y sus bonificaciones al daño del arma solo funcionan con ella.',
      `Lanzar ${fork} contra un solo enemigo. Espera un momento a que llegue el grupo.`,
    ],
    legendaries: [
      { item: 'wirethread_gloves', changes: `Cuando tu eco mata a un enemigo, este lanza una ${skillName(data, 'forkline')}, así que un grupo que empieza a caer sigue cayendo.` },
      { item: 'lantern_of_second_sounds', changes: `Cada ${skillName(data, 'forkline')} que lanzas salta más lejos y golpea con mayor fuerza al final de la cadena.` },
      { item: 'crown_of_the_struck_hour', changes: `Con un bastón en las manos, cada ${skillName(data, 'storm_bolt')} también se divide en una ${skillName(data, 'forkline')}.` },
    ],
    chase: 'Son la única pieza que potencia el eco en sí, sin importar qué arma lleves.',
    strengths: [
      `Limpiar grupos. Fue la configuración ${speedRank(data, id, second)} en alcanzar el nivel ${second}.`,
      `El jefe. Al nivel ${second} fue la configuración ${bossSpeedRank(data, id, second)} en vencerlo y, jugando con cuidado, ganó ${percent(steadyBossShare(data, id, first))} de sus peleas al nivel ${first}.`,
      'Cualquier arma. Si el próximo buen botín es una ballesta en vez de un bastón, el eco seguirá funcionando.',
    ],
    weakSpots: [
      `Maná. Cada lanzamiento de ${fork} consume maná; usa el frasco antes de quedarte sin él.`,
      `Errores al principio. Jugando sin cuidado ganó ${percent(carelessBossShare(data, id, first))} de sus peleas contra el jefe de nivel ${first}.`,
    ],
    thin: [
      'El jugador simulado que generó las cifras de esta página usa el arma que más las aumenta, no un tipo de arma en particular. Por eso, las cifras corresponden a la ruta, no a un arma específica.',
    ],
    marks: {
      echo_forkline: `Tu primer punto: ${fork}.`,
      twice_swung: 'A partir de aquí, tu ataque principal ocurre dos veces.',
      forked: `Cada impacto de tu ataque principal puede lanzar una ${fork}.`,
      twice_remembered: 'Habilidades de área más grandes y duraderas, a cambio de hacer un poco menos de daño con todo.',
      blade_static_brand: 'Una marca que estalla cuando vuelves a golpearla.',
      thunder_in_the_bones: `A partir de aquí, la ruta gira hacia ${pathName(data, 'storm')}, que potencia ${fork}. Estos nodos requieren un bastón.`,
    },
    afterRoute: afterRouteText(data, id, 'Más relámpagos y más maná, con un bastón en las manos.'),
  };
}

function windrunner(data: GuideData): BuildNotes {
  const id: string = 'windrunner';
  const keystone: number = placeLevel(data, id, 'never_still');
  const armourCut: string = percent(modShare(data, 'never_still', 'armour'));
  const quarrel: string = skillName(data, 'quarrel');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: skill(data, 'quarrel').name,
    forWho: 'Para quienes prefieren luchar a distancia, atravesar al grupo y disparar desde las sombras.',
    plays: [
      `El Tiro nocturno recorre ${pathName(data, 'wind')} con ${groupNeeds(data, 'crossbow')} en las manos, lo que convierte ${skillName(data, 'cleave')} en ${quarrel}. Casi todos los nodos de la ruta solo funcionan mientras tengas una. Tu primer punto es ${skillName(data, 'ghost_wave')}: una ola pálida que recorre toda la línea.`,
      `${name(data, 'shadow_veil')} llega al nivel ${placeLevel(data, id, 'shadow_veil')}: después de cada rodada, tus disparos golpean más fuerte y atraviesan a un enemigo adicional durante dos segundos. Al nivel ${placeLevel(data, id, 'slip_through')}, ${name(data, 'slip_through')} convierte tu rodada en un paso por las sombras hasta donde apuntas, y te oculta como una rodada.`,
      `${skillName(data, 'umbra')} llega al nivel ${placeLevel(data, id, 'wind_umbra')}: una sombra a tu alrededor dentro de la cual los enemigos hacen menos daño. Al nivel ${keystone} eliges ${name(data, 'never_still')}: ataques más rápidos, más velocidad de movimiento y menos espera para tus movimientos, a cambio de ${armourCut} menos de armadura.`,
      `Al nivel ${placeLevel(data, id, 'fanned_shot')}, ${name(data, 'fanned_shot')} convierte ${quarrel} en un abanico de virotes que cubre el camino frente a ti, y al nivel ${placeLevel(data, id, 'heavy_shot')}, ${name(data, 'heavy_shot')} le da una segunda forma: mantenla presionada y suelta un virote pesado. ${quarrel} usa una forma a la vez: elige cuál en la ficha del nodo en el Árbol de habilidades o haz clic derecho en la habilidad de tu barra (mantenla presionada en el teléfono).`,
    ],
    lean: [
      `Rueda y luego dispara. ${skillName(data, 'quarrel')} es más potente durante los dos segundos posteriores a una rodada o un paso, así que muévete seguido y dispara justo después.`,
      `Empieza lanzando ${skillName(data, 'ghost_wave')} a lo largo del grupo y usa ${skillName(data, 'umbra')} cuando te alcancen.`,
    ],
    lookFor: [
      `Una ballesta: ${weaponNames(groupWeapons(data, 'crossbow'))}.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
    ],
    avoid: [
      `Cualquier arma que no sea ballesta. Sin una, ${quarrel} vuelve a ser ${skillName(data, 'cleave')}, y ${pathName(data, 'wind')} conserva su vida, velocidad, ${skillName(data, 'ghost_wave')} y ${skillName(data, 'umbra')}, pero no el daño que aporta a tus disparos.`,
      'Quedarte quieto. El Velo solo funciona después de moverte.',
      'Buscar armadura para compensar el nodo clave. La vida te beneficia más.',
    ],
    legendaries: [
      { item: 'quietshot', changes: 'Rodar antes de disparar vale más que cualquier atributo de tu equipo, y un perno atraviesa una fila entera de enemigos.' },
      { item: 'nightjar_gloves', changes: `Cada rodada convierte los siguientes disparos en una ráfaga de tres pernos, así que rodar hacia un grupo también es atacar.` },
      { item: 'longsight_coat', changes: 'Disparas desde mucho más lejos y vuelves a apartar a quien consiga alcanzarte.' },
      { item: 'mist_treader_boots', changes: `Puedes rodar más seguido, y cada rodada deja atrás un ${skillName(data, 'downdraught')}. Cualquier configuración puede usarlas, pero esta es la que más rueda.` },
    ],
    chase: 'Es un arma, y las otras piezas potencian la rodada que recompensa. Puedes llevar tres objetos legendarios a la vez, así que, si usas las tres piezas de Tiro silencioso, deja las botas fuera.',
    strengths: [
      `Arranque. Fue la configuración ${speedRank(data, id, first)} en alcanzar el nivel ${first}.`,
      'Escapar del peligro. Ninguna configuración se mueve tanto ni con tanta frecuencia.',
      `El jefe, cuando la configuración ya está desarrollada. Jugando con cuidado ganó ${percent(steadyBossShare(data, id, second))} de sus peleas al nivel ${second}.`,
    ],
    weakSpots: [
      `El jefe al nivel ${first}. Jugando con cuidado, ganó ${percent(steadyBossShare(data, id, first))} de sus peleas. Sube algunos niveles más antes de enfrentarlo.`,
      'Peleas de las que no puedes apartarte. Si te inmovilizan, se nota tu poca armadura.',
    ],
    thin: [],
    marks: {
      wind_ghost_wave: 'Tu primer punto: una ola que recorre la línea del grupo.',
      shadow_veil: 'Ahora cada rodada potencia tus siguientes disparos.',
      slip_through: 'Ahora tu rodada te lleva adonde apuntas.',
      never_still: `Más velocidad en todo, pero ${armourCut} menos de armadura.`,
      fanned_shot: `${quarrel} dispara un abanico de virotes.`,
      heavy_shot: `Una segunda forma para ${quarrel}. Elige cuál usa en la ficha de este nodo.`,
    },
    afterRoute: afterRouteText(data, id, 'Más vida gracias a la ruta de piedra: la respuesta adecuada para una configuración que sacrificó su armadura.'),
  };
}

export function buildNotes(data: GuideData): readonly BuildNotes[] {
  return [caster(data), tank(data), whirlwind(data), windrunner(data), echoer(data)];
}

export const BUILD_NOTES: readonly BuildNotes[] = buildNotes(guideData());
