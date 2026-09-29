import {RELEASE} from './version.mjs';
import {MODULES,SECTORS} from './tactics.mjs';

export function manualHTML(game){
  return `<div class="modal-content manual-content">
    <header class="modal-head manual-head">
      <div><p class="manual-eyebrow">游戏指南</p><h2 id="modal-title">星链对战 · 玩法 V${RELEASE.version}</h2></div>
      <button class="btn quiet" data-action="close-modal">关闭</button>
    </header>
    <div class="manual-body">
      <p class="manual-intro">移动星链，达成攻击目标；抢先完成维修，保持你的战舰优势。</p>
      <div class="manual-facts" aria-label="一局速览">
        <div><strong>18 / 24</strong><span>初始生命 · 第8级起24血</span></div>
        <div><strong>6 张</strong><span>公开手牌 · 出牌后补满</span></div>
        <div><strong>12 轮</strong><span>最多轮数 · 归零立即结束</span></div>
      </div>
      <section class="manual-section" aria-labelledby="manual-basics">
        <h3 id="manual-basics"><span class="manual-index">01</span>基本玩法</h3>
        <ol class="rules-list manual-steps"><li><strong>开局。</strong>第1–7级双方18血，第8级起双方24血、6 张手牌。先从三个模块中选一个；对手提前选定，双方选择后公开。只在开局各掷一颗六面骰，点大先手，同点重掷。骰子胜方再从亮出的三条星域里选一条，整局双方共用。12 轮分成前段和后段，第 4 轮结束后先手从三项里选一个后段增益，双方一起生效。之后轮流行动，双方手牌始终公开。后手获得 ${game.shieldAllowance} 点一次性护盾，优先抵消伤害，耗尽不恢复。护盾按实际等级固定为1–3点，开局会显示本局数值。</li>
          <li><strong>出牌。</strong>选 1 张数字牌，对一条星链做加法或减法。普通出牌的每一步都在 0–20 之间，最终位置必须改变。加速可以先超过 20，但不能小于 0，最后一步必须回到 0–20，允许回到原位；按最终局面判定攻击，不限使用次数。</li>
          <li><strong>攻击。</strong>落点满足左侧公共目标，全部符合条件的目标都会触发，分别造成 1、2、3 点伤害。模块和星域满足条件时叠加，预览会把基础伤害、模块和星域分开显示。点击「确认出牌」自动结算，攻击力只用于本次出牌。区域和精准目标会标在三条星链的刻度上。</li>
          <li><strong>校准。</strong>每局双方各有 1 次，必须自己按按钮，不会自动使用。按钮在橙星链下方、手牌上方。先选好牌、星链和加减。最终落点离当前任一攻击目标正好差 1 格，这一格仍在 0–20、不是出发点，而且结算更好时，按钮才会亮成「校准至某一格」。按下后落点挪到更好的一侧；再按一次，或改选牌、星链、加减，都会取消。确认出牌才消耗这次机会。普通数字牌、星云、加速和跃迁都可以校准。</li>
          <li><strong>修复。</strong>右侧是双方争抢的 3 个共享任务（第8级起为4个），进度分别记录。谁先完成谁回复 1 或 2 点生命，可以超过本局初始的 18 / 24 点生命，上不封顶。完成几项就刷新几项，被替换任务的双方进度清零，其他任务保留进度。新任务从下一次出牌开始计数。</li>
          <li><strong>补牌。</strong>确认后，伤害和回血一次性结算。随后从 3 张明牌中选择，或点「随机抽 1 张」，补满 6 张后自动轮到对手。第 12 轮和对局结束时无需补牌。</li>
          <li><strong>获胜。</strong>对手生命归零即获胜，没有额外反击回合。若双方完成第 12 轮后都仍存活，剩余生命多者胜，相同则平局。</li></ol>
      </section>
      <details class="manual-section" open>
        <summary><span class="manual-index">02</span>功能牌<span class="manual-section-hint">五种牌的使用方法</span></summary>
        <div class="manual-card-grid">
        <article class="manual-card manual-card--cyan"><h4 aria-label="星云 W"><span class="manual-card-symbol" aria-hidden="true">W</span>星云</h4><p>选中后点选 1–9，作为所选数字使用。</p></article>
        <article class="manual-card manual-card--gold"><h4 aria-label="加速 A"><span class="manual-card-symbol" aria-hidden="true">A</span>加速</h4><p>搭配 2 张普通数字牌，按选择顺序连续运算，每一步分别设置加减。不能搭配星云。中间结果可以超过 20，不能小于 0，最终结果必须在 0–20，允许回到起点。牌面会写出中间结果，例如 18 + 3 = 21，再 − 4 = 17。只按最终局面判定攻击与奖励，每次出牌结算一次，不限使用次数，照常消耗加速牌及两张数字牌。例如蓝4、紫10、橙16时，紫星链10 + 8 − 8 = 10可触发「等距三星」。</p></article>
        <article class="manual-card manual-card--purple"><h4 aria-label="跃迁 J"><span class="manual-card-symbol" aria-hidden="true">J</span>跃迁</h4><p>单独使用：可选 20 − 当前值，以及前后各一格。只显示 0–20 内的格子；例如 4 可以落到 15、16、17；10 可以落到 9、10、11（允许 10 跃迁落回 10）；0 的 20 − 0 = 20，因 21 超出范围只能落到 19 或 20；20 的 20 − 20 = 0，因 −1 超出范围只能落到 0 或 1。按最终落点判定攻击：两条星链都是 0 时，其中一条跃迁到 20，可与剩下的 0 触发「二十星门」；两条都是 20 时，其中一条跃迁到 0，也可与剩下的 20 触发；两条都是 10 时，一条跃迁落回 10，同样可与剩下的 10 触发「二十星门」与十号港口。只要出牌前桌面有该目标，就造成 3 点基础伤害，同一目标每次出牌只结算一次。不计加减法。</p></article>
        <article class="manual-card manual-card--blue"><h4 aria-label="定轨 D"><span class="manual-card-symbol" aria-hidden="true">D</span>定轨<span class="manual-level">第8级起</span></h4><p>单独使用，在0、10、20中选择不同于起点的落点。</p></article>
        <article class="manual-card manual-card--green"><h4 aria-label="调拨 B"><span class="manual-card-symbol" aria-hidden="true">B</span>调拨<span class="manual-level">第8级起</span></h4><p>选择另一张手牌与一张明牌交换，消耗B后继续当前回合，换来的牌立即可用，也可搭配其他功能牌。交换不攻击、不回血、不重置连续进度；最终出牌后统一补满6张。</p></article>
        </div>
        <p class="manual-callout">第1–7级：18血，攻击与维修各3项，44张牌（数字36、星云3、加速3、跃迁2）。第8级起：24血，双方项目各4项，增加定轨2张、调拨2张，共48张。支援只调整机器人强度，不改变所选等级的牌组与项目数。所有对局触发全部达成的攻击目标，仅结算出牌前已出现的项目。</p>
      </details>
      <details class="manual-section" open>
        <summary><span class="manual-index">03</span>模块与星域<span class="manual-section-hint">装备加成与整局规则</span></summary>
        <h4 class="manual-subtitle">战舰模块</h4><p>每人只装备一个模块，触发次数用完后本局不再提供加成。每局从下面六种里抽出三种供双方选择，可选相同模块。对手会优先锁定其中最近用得少的一种，所以六种会轮流出现；它不会在你选择后换装。点开牌桌上的模块名称可查看效果与剩余次数。</p><ul class="sector-rules">${MODULES.map(m=>`<li><strong>${m.name}</strong><span>${m.text} 每局最多 ${m.limit} 次。</span></li>`).join('')}</ul><h4 class="manual-subtitle">随机星域</h4><p>开局亮出下面六种里的三种，骰子胜方选一种，整局固定，没有使用次数，对双方一视同仁。说明显示在蓝星链上方。加成都要求这次出牌已经触发公共攻击目标。和你的模块方向一致时，说明后面会写出来，不另加伤害。</p><ul class="sector-rules">${SECTORS.map(s=>`<li><strong>${s.name}</strong><span>${s.text}</span></li>`).join('')}</ul><p>命中护盾也算触发攻击；血量只扣除护盾抵消后的伤害。工程舱按维修出牌加一次回血，同时完成多项也不重复加成。加成不产生新的领奖事件。</p>
        <p>连击炮要求自己的相邻两次出牌都在同色星链触发攻击；休整或未触发攻击会断开。巡航引擎只收集实际触发攻击的颜色，收齐三色后清空，休整保留已收集颜色。巡航星域同样要求相邻两次出牌都触发攻击，而且两次颜色不同；中间休整或没打中也会断开。</p>
      </details>
      <details class="manual-section" open>
        <summary><span class="manual-index">04</span>休整与结算<span class="manual-section-hint">任务刷新、连续进度与牌堆</span></summary>
        <div class="manual-notes"><p>休整可弃 0–2 张手牌，并替换 1 张攻击目标，再补满手牌。本回合不移动、不攻击、不回血；会中断连续攻击任务。</p>
        <p>自动结算全部满足条件的攻击目标，不再限制两项。只结算出牌前已经出现的目标和补给，新刷出的项目不能由同一次出牌再次触发。</p>
        <p>加速星的一次出牌可同时包含加法和减法，但“2 次出牌”仍只计一次。所有维修任务只累计它出现在桌面之后的动作。</p>
        <p>已用牌自动回收，牌堆耗尽时重新洗牌。对手只能读取双方手牌及公开信息，无法预知抽牌和新目标。</p></div>
      </details>
      <details class="manual-section" open>
        <summary><span class="manual-index">05</span>难度与记录<span class="manual-section-hint">支援邀请与存档</span></summary>
        <p class="rules-note">按实际对战等级解锁下一位。支援邀请开启时，每连续输2局，弹窗询问是否下调1级。接受才降低，最低1级；拒绝则保持当前难度，再两连败才重新询问。连续赢2局恢复1级，最高回到所选等级。平局清空连胜连败，退出不计。名字后的「支援模式」表示本局实际难度较低。游玩记录持续保存，可在「记录与难度」导出；参数调整只影响新局。刷新开启新对局。</p>
      </details>
      <footer class="manual-footer"><span>可随时从右上角「玩法说明」再次查看。</span><button class="btn primary" data-action="close-modal">回到牌桌</button></footer>
    </div>
  </div>`;
}
