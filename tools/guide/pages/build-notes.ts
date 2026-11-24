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
      `${skillName(data, 'thunderclap')} is not your damage; it is how you stop being hit while the sweep is gathering. Light ${skillName(data, 'banked_fire')} and stay in it: it is weak when lit and twice as hot by the end. ${skillName(data, 'held_breath')} has a long wait, so keep it for the moment a fight turns.`,
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
      `Cualquier arma que no sea pesada. With a blade, a staff or a crossbow in hand, ${pathName(data, 'stone')} keeps its life, its armour and its fire but none of the damage it gives your weapon, ${name(data, 'heaving_cleave')} and ${name(data, 'shoulder_through')} stop changing your skills, and the Skill Tree shows those lines struck through.`,
      'Cambiar vida o armadura por daño en el equipo. El árbol te dará daño más adelante; el equipo te mantiene en pie.',
      'Perseguir enemigos veloces por todo el mapa. Deja que se acerquen.',
    ],
    legendaries: [
      { item: 'groundbreaker', changes: `Every swing into a pack sets off ${skillName(data, 'thunderclap')}s, and the longer you stand in it the harder you are to hurt.` },
      { item: 'anvilback_hauberk', changes: `A held heave hits both ways: the sweep in front and a ${skillName(data, 'thunderclap')} all around, with armour for every enemy it catches.` },
      { item: 'bellwether_helm', changes: 'Recibir golpes se convierte en un arma. Métete entre los enemigos y el yelmo responderá por ti.' },
    ],
    chase: `It is a weapon, so it takes no slot you need for armour, and its ${skillName(data, 'thunderclap')}s come from the ${skillName(data, 'cleave')} you press all the time.`,
    strengths: [
      `Surviving. In the measurements it ${deathWords(steadyDeaths(data, id))} played steadily and ${deathWords(carelessDeaths(data, id))} played carelessly.`,
      `The boss, even with mistakes. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
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
      heaving_cleave: 'Hold Cleave for the big sweep. La configuración empieza aquí.',
      the_unmoved: `${armour} más de armadura, más vida y más daño; ${slow} más lento.`,
      worn_groove: 'From here the route turns toward area damage.',
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
      `El Torbellino recorre ${pathName(data, 'blade')} con ${groupNeeds(data, 'blade')} en las manos: el giro y las habilidades relacionadas son más fuertes mientras tengas una. At level ${whirl} ${name(data, 'whirling_cleave')} turns ${skillName(data, 'cleave')} into a full turn that strikes everything around you. At level ${endless} ${name(data, 'endless_turn')} turns that into the ${wheel}: hold it and you keep turning while you run.`,
      `Cada enemigo que golpea ${wheel} acumula impulso: giras más rápido, alcanzas un área mayor y nada puede derribarte. Justo después, ${name(data, 'millstone')} permite acumular más impulso y más que duplica la proporción del daño que recuperas como vida, así que girar entre los enemigos te mantiene en pie.`,
      `Al nivel ${undertow} aprendes ${skillName(data, 'downdraught')}: un remolino que lanzas hacia donde apuntas y junta a los enemigos para golpearlos a todos de un giro.`,
      `Al nivel ${riptide}, tu rodada se convierte en ${skillName(data, 'dodge_roll_riptide')}: rueda más lejos, deja una corriente de retorno al aterrizar y arrastra a los enemigos hacia ti. At level ${race} you learn ${skillName(data, 'millrace')}: let go of the ${wheel} and throw its momentum out as one wave that crashes through the pack, harder, wider and farther the more you held, and stuns everything it strikes for longer the more you held. Throw it into the pack, then spin through it while it stands still. From then on every four enemies the ${wheel} strikes put a charge back in each flask.`,
      `Al nivel ${wake}, ${name(data, 'long_wake')} mantiene el impulso por más tiempo después del último golpe, para que pase de un grupo al siguiente. It sits past ${name(data, 'racing_cloud')}, a crossbow place: with a blade that one gives only its movement speed, and the route takes it for what lies beyond.`,
      `Al nivel ${echoes}, la ruta cruza a ${pathName(data, 'echo')} para obtener ${name(data, 'twice_swung')}. El giro sostenido no crea un eco; en cambio, cada vuelta golpea más fuerte.`,
    ],
    lean: [
      `${wheel} es el botón que mantienes presionado. Cada golpe devuelve un poco de maná, mientras que girar en el aire solo lo consume; mantenlo girando entre los enemigos, no entre grupos.`,
      `Because it swings your weapon, your weapon's damage is most of your damage. Every place on the route that says "weapon skills", "Damage" or "Attack Speed" makes each turn hit harder or come sooner.`,
      `${millwheel}, una espada legendaria, convierte por sí sola ${skillName(data, 'cleave')} en ${wheel}, mucho antes de ${name(data, 'endless_turn')}. Como es una espada, todos los nodos de ${pathName(data, 'blade')} siguen contando al llevarla.`,
    ],
    lookFor: [
      `A blade with more damage that does not swing slower: ${weaponNames(groupWeapons(data, 'blade'))}. Read the damage range first.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'fleet'),
      affixLine(data, 'hale'),
      affixLine(data, 'jagged'),
    ],
    avoid: [
      `Cualquier arma que no sea espada. With a heavy weapon, a staff or a crossbow, ${skillName(data, 'cleave')} stops turning, the ${wheel} is gone, and ${pathName(data, 'blade')} keeps ${skillName(data, 'downdraught')}, ${skillName(data, 'millrace')}, its life and its speed but none of its weapon damage.`,
      'Detenerte. El impulso se desvanece poco después del último golpe, y un giro que empieza en frío es lento.',
    ],
    legendaries: [
      { item: 'the_millwheel', changes: `${skillName(data, 'cleave')} becomes a spin you hold while you run, so you never stop to swing.` },
      { item: 'gyre_stitched_breeches', changes: `The spin drags the pack into it, and every third turn throws a ${skillName(data, 'thunderclap')} from the middle.` },
      { item: 'grinders_bracers', changes: 'Cuantos más enemigos golpeas, más rápido y fuerte atacas.' },
    ],
    chase: `Las otras dos también funcionan con ${skillName(data, 'cleave_whirl')}, pero Millwheel es el giro para el que fueron diseñadas: no termina mientras lo mantengas presionado.`,
    strengths: [
      'Multitudes. Cada vuelta golpea todo a tu alrededor, y cuantos más enemigos alcanza, más rápido gira.',
      `Levelling. Fue la configuración ${speedRank(data, id, second)} en alcanzar el nivel ${second}.`,
      'Movilidad. You keep turning while you run, so the pack and the next one are one fight.',
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
      blade_millrace: `Let go of the ${wheel} and spend its momentum in one wave that stuns the pack.`,
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
      `El Invocador de tormentas recorre ${pathName(data, 'storm')} with ${groupNeeds(data, 'staff')} in your hands. Nearly every place on the path answers only while you hold one; with any other weapon its lightning places keep their life and mana and lose their damage. Tu primer punto es ${bolt}, and from then on it is the button you press.`,
      `${name(data, 'forked_bolt')} pronto hace que cada lanzamiento dispare más rayos, y ${skillName(data, 'squall')} también llega temprano: métete entre los enemigos y se forma a tu alrededor, golpeando todo lo que cubre cada medio segundo mientras sigues lanzando hechizos.`,
      `At level ${lance} ${name(data, 'storm_lance')} changes ${bolt}: one straight line of lightning that hits everything along it at once. At level ${twice} ${name(data, 'twice_told_bolt')} gives it a second form, a bolt whose echo flies the same way a moment later. ${bolt} uses one of them at a time: choose which on that place's card on the Skill Tree, or right-click the skill on your bar (hold it on a phone).`,
      `At level ${keystone} you take ${name(data, 'eye_of_the_storm')}. It costs ${lifeCut} of your life and makes your lightning far stronger. ${skillName(data, 'standing_storm')} comes at level ${placeLevel(data, id, 'standing_thunder')}: a storm around you that heals you for every enemy it strikes, for the moments the pack does reach you. ${name(data, 'static_step')} follows, so your roll comes back sooner and carries you further.`,
    ],
    lean: [
      `${bolt} costs a little mana every cast. Mana is your limit, not waiting. The places on the route that add mana are there for this, and so is the mana flask on 2.`,
      `Tus habilidades siguen sumando el daño del arma, así que ayuda tener un bastón con más daño. Al principio ayuda aún más un bastón que aporte maná.`,
      `Take ${name(data, 'storm_lance')} for packs that come at you in a line, and ${name(data, 'twice_told_bolt')} for a single big enemy. Puedes cambiar entre ellas cuando quieras, sin costo.`,
    ],
    lookFor: [
      `Un bastón: ${weaponNames(groupWeapons(data, 'staff'))}. The ones that add mana help most: ${weaponNames(manaWeapons(data))}.`,
      affixLine(data, 'brimming'),
      affixLine(data, 'clear'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
      affixLine(data, 'grounded'),
    ],
    avoid: [
      `Cualquier arma que no sea bastón. ${bolt} still casts, and ${name(data, 'storm_lance')} still changes it, but ${pathName(data, 'storm')} stops adding its damage, ${name(data, 'twice_told_bolt')} stops changing it, and the Skill Tree shows those lines struck through.`,
      'Velocidad de ataque en el equipo. No hace que lances hechizos más rápido.',
      `Quedarte entre la multitud. ${name(data, 'storm_lance')} is a line: step back so the enemies come at you along it.`,
    ],
    legendaries: [
      { item: 'crown_of_the_struck_hour', changes: `Every ${skillName(data, 'storm_bolt')} becomes two: the bolt, and a ${skillName(data, 'forkline')} from the first enemy it hits.` },
      { item: 'lantern_of_second_sounds', changes: 'Lightning reaches deeper into a pack and lands its hardest blow on the last enemy, not the first.' },
      { item: 'rainmaker', changes: `Every ${skillName(data, 'squall')} you drop breaks over you as well, so the storm comes with you, and every area you leave lasts longer.` },
    ],
    chase: `${skillName(data, 'storm_bolt')} es el botón que más presionas, y la Corona convierte cada lanzamiento también en una ${skillName(data, 'forkline')}.`,
    strengths: [
      `Grupos que se acercan desde un lado. ${name(data, 'storm_lance')} golpea toda la línea.`,
      `The boss once the build comes together. At level ${second} it was ${bossSpeedRank(data, id, second)} build to win.`,
    ],
    weakSpots: [
      'Quedarte sin maná en una pelea larga. Usa el frasco antes de vaciarte, no después.',
      `Being caught. With ${name(data, 'eye_of_the_storm')} taken you have little life. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
      'Enemigos rodeándote. Sal de ahí para que vuelvan a estar todos de un lado.',
    ],
    thin: [],
    marks: {
      storm_storm_bolt: 'Tu primer punto y, desde ahora, tu habilidad principal.',
      storm_lance: 'La configuración empieza aquí.',
      eye_of_the_storm: `This is where you give up ${lifeCut} of your life for a lot more lightning damage.`,
      rolling_thunder: `This one changes ${skillName(data, 'thunderclap')}, which this build does not have. The route passes through it on the way to the keystone.`,
      twice_told_bolt: `A second form for ${bolt}. Choose which one it uses on this place's card.`,
      standing_thunder: 'A storm around you that heals you while it strikes.',
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
    mainSkill: 'your main attack',
    forWho: 'Para quienes quieren que cada golpe impacte dos veces, sin importar qué arma lleven.',
    plays: [
      `${pathName(data, 'echo')} no requiere un arma ni tiene elemento: se adapta a lo que lleves. Tu primer punto es ${fork}, relámpagos que saltan de un enemigo a otro; justo después, ${name(data, 'first_echo')} hace que todas las habilidades de área duren más y golpeen con más fuerza.`,
      `At level ${echoes} ${name(data, 'twice_swung')} makes your main attack happen twice: a moment after it lands, its echo strikes the same way again for half the damage. Your main attack is whatever your weapon makes of it: ${skillName(data, 'cleave')} and its turns with a blade or a heavy weapon, ${skillName(data, 'quarrel')} with a crossbow, ${skillName(data, 'storm_bolt')} with a staff. A held spin does not echo; it hits harder instead.`,
      `At level ${forked} ${name(data, 'forked')} lets each hit of your main attack throw a ${fork} from the enemy it struck. At level ${keystone} ${name(data, 'twice_remembered')} trades a little damage on everything for bigger, longer area skills and a shorter wait on ${skillName(data, 'held_breath')}.`,
      `${skillName(data, 'static_brand')} comes at level ${brand}: it marks the first enemy it touches, and your next hit on that enemy bursts the mark over everything around it. With your main attack striking twice, a mark rarely waits long.`,
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
      'Changing weapons for every fight. Every skill works with any weapon, but each arm\'s skills are stronger with their own, and its weapon damage lines answer only to it.',
      `Throwing ${fork} at a single enemy. Wait a moment for the pack to come.`,
    ],
    legendaries: [
      { item: 'wirethread_gloves', changes: `An enemy your echo kills throws a ${skillName(data, 'forkline')}, so a pack that starts dying keeps dying.` },
      { item: 'lantern_of_second_sounds', changes: `Every ${skillName(data, 'forkline')} you throw jumps further and hits hardest at the end of its chain.` },
      { item: 'crown_of_the_struck_hour', changes: `With a staff in hand, each ${skillName(data, 'storm_bolt')} also splits into a ${skillName(data, 'forkline')}.` },
    ],
    chase: 'Son la única pieza que potencia el eco en sí, sin importar qué arma lleves.',
    strengths: [
      `Limpiar grupos. Fue la configuración ${speedRank(data, id, second)} en alcanzar el nivel ${second}.`,
      `The boss. At level ${second} it was ${bossSpeedRank(data, id, second)} build to win, and played steadily it won ${percent(steadyBossShare(data, id, first))} of its fights at level ${first}.`,
      'Cualquier arma. Si el próximo buen botín es una ballesta en vez de un bastón, el eco seguirá funcionando.',
    ],
    weakSpots: [
      `Maná. Cada lanzamiento de ${fork} consume maná; usa el frasco antes de quedarte sin él.`,
      `Errores al principio. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
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
      thunder_in_the_bones: `From here the route turns to ${pathName(data, 'storm')}, which makes ${fork} stronger. These places need a staff.`,
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
      `El Tiro nocturno recorre ${pathName(data, 'wind')} with ${groupNeeds(data, 'crossbow')} in your hands, which turns ${skillName(data, 'cleave')} into ${quarrel}. Almost every place on the path answers only while you hold one. Tu primer punto es ${skillName(data, 'ghost_wave')}: a pale wave that rolls through the whole line.`,
      `${name(data, 'shadow_veil')} comes at level ${placeLevel(data, id, 'shadow_veil')}: after every roll your shots hit harder and pierce one more enemy for two seconds. At level ${placeLevel(data, id, 'slip_through')} ${name(data, 'slip_through')} turns your roll into a step through the shadow to where you aim, and it veils you like a roll.`,
      `${skillName(data, 'umbra')} comes at level ${placeLevel(data, id, 'wind_umbra')}: a shadow around you in which enemies deal less damage. At level ${keystone} you take ${name(data, 'never_still')}: faster attacks, faster feet and shorter waits on your movement, and ${armourCut} less armour.`,
      `At level ${placeLevel(data, id, 'fanned_shot')} ${name(data, 'fanned_shot')} turns ${quarrel} into a fan of bolts across the way ahead, and at level ${placeLevel(data, id, 'heavy_shot')} ${name(data, 'heavy_shot')} gives it a second form: hold it and let go of one heavy bolt. ${quarrel} uses one at a time: choose which on that place's card on the Skill Tree, or right-click the skill on your bar (hold it on a phone).`,
    ],
    lean: [
      `Rueda y luego dispara. ${skillName(data, 'quarrel')} is strongest in the two seconds after a roll or a step, so move often and fire right after.`,
      `Empieza lanzando ${skillName(data, 'ghost_wave')} a lo largo del grupo y usa ${skillName(data, 'umbra')} cuando te alcancen.`,
    ],
    lookFor: [
      `Una ballesta: ${weaponNames(groupWeapons(data, 'crossbow'))}.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
    ],
    avoid: [
      `Cualquier arma que no sea ballesta. Without one ${quarrel} is ${skillName(data, 'cleave')} again, and ${pathName(data, 'wind')} keeps its life, its speed, ${skillName(data, 'ghost_wave')} and ${skillName(data, 'umbra')} but none of the damage it gives your shots.`,
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
      `El jefe, cuando la configuración ya está desarrollada. Played steadily it won ${percent(steadyBossShare(data, id, second))} of its fights at level ${second}.`,
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
