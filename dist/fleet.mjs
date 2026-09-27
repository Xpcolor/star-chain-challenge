/** Visual identities only. AI strength and all combat values remain in the rules engine. */
export const PLAYER_SHIP=Object.freeze({id:'aurora',name:'曙光 · 双翼巡航舰',model:'./assets/ship-player.glb',detailedModel:'./assets/detailed-player.glb',portrait:'./assets/player-cinematic-v2.png',fallback:'./assets/player-cinematic-v2.png',length:6.2,art:{bounds:[177,165,1384,862],muzzle:[1380,502],engines:[[185,434],[185,562]]}});
const names=['星针探测器','微光穿梭艇','星芽截击机','云雀轻型飞碟','巡航双体舰','寻路环翼舰','探路弦月舰','流光双擎突击舰','引航三体舰','逐光双环舰','远航碟形巡洋舰','守望多翼舰','追光弦月旗舰','破晓星环旗舰','织星重型飞碟','星航核心旗舰'];
const art=[
  [[335,49,1268,960],[389,515],[[1120,515]]],
  [[156,160,1425,857],[158,505],[[1390,480]]],
  [[213,257,1306,803],[215,535],[[1290,520]]],
  [[136,311,1399,735],[214,572],[[1133,658],[1250,629]]],
  [[55,224,1490,807],[70,535],[[1440,422],[1440,674]]],
  [[132,178,1413,796],[138,602],[[1380,490]]],
  [[122,120,1465,921],[831,530],[[1390,515]]],
  [[175,228,1396,793],[178,531],[[1320,380],[1320,581]]],
  [[53,171,1502,857],[60,554],[[1440,344],[1460,500],[1410,669]]],
  [[73,200,1473,794],[75,531],[[1380,530]]],
  [[47,185,1490,811],[56,619],[[1450,542]]],
  [[37,104,1511,916],[40,538],[[1430,410],[1430,550]]],
  [[222,109,1414,915],[225,542],[[1325,416],[1395,510],[1300,620]]],
  [[46,106,1499,928],[48,482],[[1415,366],[1470,447],[1482,537]]],
  [[56,147,1481,875],[60,617],[[1370,587]]],
  [[33,35,1467,970],[36,519],[[1400,500],[1400,600]]],
];
export const FLEET=Object.freeze(names.map((name,i)=>Object.freeze({id:`fleet-${String(i+1).padStart(2,'0')}`,name,model:`./assets/ship-${String(i+1).padStart(2,'0')}.glb`,detailedModel:`./assets/detailed-${String(i+1).padStart(2,'0')}.glb`,portrait:`./assets/enemy-tier-${String(i+1).padStart(2,'0')}.png`,fallback:`./assets/enemy-tier-${String(i+1).padStart(2,'0')}.png`,length:3.2+i*3/15,art:{bounds:art[i][0],muzzle:art[i][1],engines:art[i][2]}})));
