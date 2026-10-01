(function () {
  'use strict';

  var STORAGE_KEY = 'mtgLifeCounter.v1';
  var COLORS = [
    '#1f7d3a',
    '#2a5c9e',
    '#6e38b0',
    '#c44738',
    '#c4b896',
    '#7a3aad',
    '#8a5a1a',
    '#1a7a7a',
    '#8a1a5a',
    '#3a6b8a'
  ];
  var COLOR_NAMES = ['Verde', 'Azul', 'Purpura', 'Rojo', 'Blanco', 'Violeta', 'Oro', 'Teal', 'Magenta', 'Grisazul'];
  var COUNTERS = [
    { key: 'poison', label: 'Veneno', lethal: 10 },
    { key: 'tax', label: 'Impuesto de comandante', lethal: 0 },
    { key: 'energy', label: 'Energia', lethal: 0 },
    { key: 'experience', label: 'Experiencia', lethal: 0 },
    { key: 'storm', label: 'Storm', lethal: 0 },
    { key: 'charge', label: 'Carga', lethal: 0 },
    { key: 'custom', label: 'Personalizado', lethal: 0 }
  ];
  var DICE = [4, 6, 8, 10, 12, 20];

  var state = {
    playerCount: 4,
    startingLife: 40,
    layoutId: 'face',
    players: [],
    turn: 1,
    timerSeconds: 0,
    timerRunning: false,
    planeName: '',
    started: false
  };

  var ui = {
    editingIndex: -1,
    keypadTarget: null,
    keypadBuffer: '',
    diceSides: 20,
    diceCount: 1,
    suppressClick: false,
    suggestTimer: null,
    suggestSeq: 0,
    suggestNames: [],
    deltas: [],
    history: []
  };

  var timerId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function on(el, ev, fn) {
    el.addEventListener(ev, fn, false);
  }

  function hasClass(el, name) {
    return (' ' + el.className + ' ').indexOf(' ' + name + ' ') !== -1;
  }

  function addClass(el, name) {
    if (!hasClass(el, name)) {
      el.className = el.className ? el.className + ' ' + name : name;
    }
  }

  function removeClass(el, name) {
    el.className = (' ' + el.className + ' ').replace(' ' + name + ' ', ' ').replace(/^ | $/g, '');
  }

  function toggleClass(el, name, onFlag) {
    if (onFlag) {
      addClass(el, name);
    } else {
      removeClass(el, name);
    }
  }

  function closest(el, selector) {
    while (el && el.nodeType === 1) {
      if (matches(el, selector)) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  function matches(el, selector) {
    var fn = el.matches || el.webkitMatchesSelector || el.msMatchesSelector || el.mozMatchesSelector;
    if (fn) {
      return fn.call(el, selector);
    }
    return false;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatTime(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      return h + ':' + pad2(m) + ':' + pad2(s);
    }
    return pad2(m) + ':' + pad2(s);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return false;
      }
      var data = JSON.parse(raw);
      if (!data || !data.players || !data.players.length) {
        return false;
      }
      state.playerCount = data.playerCount || data.players.length;
      state.startingLife = data.startingLife || 40;
      state.layoutId = data.layoutId || 'face';
      state.players = data.players;
      state.turn = data.turn || 1;
      state.timerSeconds = data.timerSeconds || 0;
      state.timerRunning = false;
      state.planeName = data.planeName || '';
      state.started = !!data.started;
      fixPlayerColors();
      return state.started;
    } catch (e) {
      return false;
    }
  }

  function emptyCounters() {
    return {
      poison: 0,
      tax: 0,
      energy: 0,
      experience: 0,
      storm: 0,
      charge: 0,
      custom: 0
    };
  }

  function isBlackish(color) {
    var h = String(color || '').replace('#', '');
    var r;
    var g;
    var b;
    var max;
    var min;
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (h.length !== 6) {
      return false;
    }
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return false;
    }
    max = Math.max(r, g, b);
    min = Math.min(r, g, b);
    return max < 80 && (max - min) < 28;
  }

  function fixPlayerColors() {
    var i;
    var changed = false;
    if (!state.players) {
      return;
    }
    for (i = 0; i < state.players.length; i++) {
      if (isBlackish(state.players[i].color)) {
        state.players[i].color = COLORS[2];
        changed = true;
      }
    }
    if (changed) {
      save();
    }
  }

  function makePlayer(i, life) {
    return {
      id: 'p' + (i + 1),
      name: 'Jugador ' + (i + 1),
      life: life,
      color: COLORS[i % COLORS.length],
      dead: false,
      partners: false,
      counters: emptyCounters(),
      cmd: {},
      view: 0,
      bgArt: '',
      bgCdn: '',
      bgCard: ''
    };
  }

  function syncCommanderMaps() {
    var i, j, p, q, key, keyB;
    for (i = 0; i < state.players.length; i++) {
      p = state.players[i];
      if (!p.cmd) {
        p.cmd = {};
      }
      for (j = 0; j < state.players.length; j++) {
        if (i === j) {
          continue;
        }
        q = state.players[j];
        key = q.id;
        keyB = q.id + 'b';
        if (typeof p.cmd[key] !== 'number') {
          p.cmd[key] = 0;
        }
        if (q.partners) {
          if (typeof p.cmd[keyB] !== 'number') {
            p.cmd[keyB] = 0;
          }
        } else if (p.cmd.hasOwnProperty(keyB)) {
          delete p.cmd[keyB];
        }
      }
    }
  }

  function viewList(playerIndex) {
    var list = [{ type: 'life' }];
    var i, p, src;
    p = state.players[playerIndex];
    for (i = 0; i < state.players.length; i++) {
      if (i === playerIndex) {
        continue;
      }
      src = state.players[i];
      list.push({ type: 'cmd', src: i, partner: 0, key: src.id, label: src.name });
      if (src.partners) {
        list.push({ type: 'cmd', src: i, partner: 1, key: src.id + 'b', label: src.name + ' B' });
      }
    }
    if (p.view >= list.length) {
      p.view = 0;
    }
    return list;
  }

  function shortName(name) {
    var s = String(name || '');
    var m = s.match(/Jugador\s+(\d+)/i);
    if (m) {
      return 'J' + m[1];
    }
    s = s.split(' ')[0];
    if (s.length > 8) {
      return s.substring(0, 8);
    }
    return s;
  }

  function commanderLethal(p) {
    var k;
    if (!p.cmd) {
      return false;
    }
    for (k in p.cmd) {
      if (p.cmd.hasOwnProperty(k) && p.cmd[k] >= 21) {
        return true;
      }
    }
    return false;
  }

  function addCmd(playerIndex, key, dir) {
    var p = state.players[playerIndex];
    var old;
    var next;
    if (!p.cmd) {
      p.cmd = {};
    }
    old = p.cmd[key] || 0;
    next = old + dir;
    if (next < 0) {
      next = 0;
    }
    p.cmd[key] = next;
    p.life -= (next - old);
    if (next >= 21 || p.life <= 0 || p.counters.poison >= 10) {
      p.dead = true;
    }
    save();
    return next - old;
  }

  function clearDeltas() {
    var i;
    var slot;
    for (i = 0; i < ui.deltas.length; i++) {
      slot = ui.deltas[i];
      if (slot && slot.timer) {
        clearTimeout(slot.timer);
      }
    }
    ui.deltas = [];
    ui.history = [];
  }

  function pushHistory(index, key, value) {
    var book;
    var list;
    if (!value) {
      return;
    }
    if (!ui.history[index]) {
      ui.history[index] = {};
    }
    book = ui.history[index];
    list = book[key];
    if (!list) {
      list = [];
      book[key] = list;
    }
    list.push(value);
    while (list.length > 5) {
      list.shift();
    }
  }

  function historyHtml(list) {
    var html = '';
    var i;
    var n;
    var abs;
    var rank;
    if (!list || !list.length) {
      return '';
    }
    for (i = 0; i < list.length; i++) {
      n = list[i];
      abs = n < 0 ? -n : n;
      rank = list.length - 1 - i;
      html += '<span class="hist-item hist-z' + rank + ' ' + (n < 0 ? 'hist-down' : 'hist-up') + '">' +
        abs + '</span><br>';
    }
    return html;
  }

  function commitDelta(index, key, value) {
    if (!value) {
      return;
    }
    pushHistory(index, key, value);
    if (key !== 'life') {
      pushHistory(index, 'life', -value);
    }
  }

  function bumpDelta(index, amount, key) {
    var slot;
    if (!amount) {
      return;
    }
    slot = ui.deltas[index];
    if (!slot || slot.key !== key) {
      if (slot && slot.timer) {
        clearTimeout(slot.timer);
        if (slot.value) {
          commitDelta(index, slot.key, slot.value);
        }
      }
      slot = { value: 0, key: key, timer: null };
      ui.deltas[index] = slot;
    } else if (slot.timer) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
    slot.value += amount;
    slot.timer = setTimeout(function () {
      if (ui.deltas[index] !== slot) {
        return;
      }
      if (slot.value) {
        commitDelta(index, slot.key, slot.value);
      }
      slot.value = 0;
      slot.timer = null;
      if (state.players[index]) {
        updateSeat(index);
      }
    }, 2000);
  }

  function startGame(count, life) {
    var i;
    state.playerCount = count;
    state.startingLife = life;
    state.players = [];
    for (i = 0; i < count; i++) {
      state.players.push(makePlayer(i, life));
    }
    state.turn = 1;
    state.timerSeconds = 0;
    state.timerRunning = false;
    state.planeName = '';
    state.started = true;
    clearDeltas();
    stopTimer(true);
    syncCommanderMaps();
    save();
    closeOverlay('overlay-setup');
    buildSeats();
    renderToolbar();
    renderAll();
  }

  function layoutBoxes(n, W, H) {
    return layoutBoxesFor(n, W, H, state.layoutId);
  }

  function layoutOptions(n) {
    if (n === 2) {
      return [
        { id: 'face', name: 'Enfrentados', desc: 'Uno arriba y uno abajo' },
        { id: 'sides', name: 'Izquierda / derecha', desc: 'Tablet en el medio' },
        { id: 'same', name: 'Lado a lado', desc: 'Los dos miran la pantalla' }
      ];
    }
    if (n === 3) {
      return [
        { id: 'face', name: '1 vs 2', desc: 'Uno enfrente, dos de este lado' },
        { id: 'table', name: 'Alrededor', desc: 'Tres lados de la mesa' },
        { id: 'same', name: 'Tres columnas', desc: 'Todos hacia el mismo lado' }
      ];
    }
    if (n === 4) {
      return [
        { id: 'face', name: '2 vs 2', desc: 'Dos de cada lado de la mesa' },
        { id: 'table', name: 'Alrededor', desc: 'Un jugador por lado' },
        { id: 'same', name: 'Cuadricula', desc: 'Todos hacia el mismo lado' }
      ];
    }
    if (n === 9) {
      return [
        { id: 'face', name: '4 vs 5', desc: 'Dos filas enfrentadas' },
        { id: 'table', name: 'Alrededor', desc: 'Mesa de 9' },
        { id: 'same', name: '3 x 3', desc: 'Cuadricula, misma vista' }
      ];
    }
    return [
      { id: 'face', name: Math.floor(n / 2) + ' vs ' + (n - Math.floor(n / 2)), desc: 'Filas enfrentadas' },
      { id: 'table', name: 'Alrededor', desc: 'Alrededor de la tablet' },
      { id: 'same', name: 'Misma vista', desc: 'Filas sin girar' }
    ];
  }

  function ensureLayoutId(n) {
    var opts = layoutOptions(n);
    var i;
    for (i = 0; i < opts.length; i++) {
      if (opts[i].id === state.layoutId) {
        return;
      }
    }
    state.layoutId = opts[0].id;
  }

  function slices(total, count, gap) {
    var out = [];
    var i;
    var pos = 0;
    var size;
    var base;
    var inner;
    var extra;
    if (count <= 0) {
      return out;
    }
    if (count === 1) {
      out.push({ pos: 0, size: total });
      return out;
    }
    inner = total - gap * (count - 1);
    if (inner < count) {
      inner = total;
      gap = 0;
    }
    base = Math.floor(inner / count);
    extra = inner - base * count;
    for (i = 0; i < count; i++) {
      size = base + (i === count - 1 ? extra : 0);
      out.push({ pos: pos, size: size });
      pos += size + gap;
    }
    return out;
  }

  function fillRows(W, H, gap, rows) {
    var ys = slices(H, rows.length, gap);
    var boxes = [];
    var r;
    var c;
    var xs;
    var row;
    for (r = 0; r < rows.length; r++) {
      row = rows[r];
      xs = slices(W, row.ids.length, gap);
      for (c = 0; c < row.ids.length; c++) {
        boxes[row.ids[c]] = {
          x: xs[c].pos,
          y: ys[r].pos,
          w: xs[c].size,
          h: ys[r].size,
          rot: row.rot || 0
        };
      }
    }
    return boxes;
  }

  function faceRows(n, flipTop) {
    var topN = Math.floor(n / 2);
    var botN = n - topN;
    var south = [];
    var north = [];
    var remain = [];
    var i;
    for (i = 0; i < botN; i++) {
      south.push(i);
    }
    for (i = botN; i < n; i++) {
      remain.push(i);
    }
    for (i = remain.length - 1; i >= 0; i--) {
      north.push(remain[i]);
    }
    return [
      { ids: north, rot: flipTop ? 180 : 0 },
      { ids: south, rot: 0 }
    ];
  }

  function aroundCounts(n) {
    if (n === 3) {
      return { n: 0, e: 1, s: 1, w: 1 };
    }
    if (n === 4) {
      return { n: 1, e: 1, s: 1, w: 1 };
    }
    if (n === 5) {
      return { n: 2, e: 1, s: 1, w: 1 };
    }
    if (n === 6) {
      return { n: 2, e: 1, s: 2, w: 1 };
    }
    if (n === 7) {
      return { n: 2, e: 2, s: 2, w: 1 };
    }
    if (n === 8) {
      return { n: 2, e: 2, s: 2, w: 2 };
    }
    if (n === 9) {
      return { n: 3, e: 2, s: 2, w: 2 };
    }
    return { n: 3, e: 2, s: 3, w: 2 };
  }

  function assignAround(n) {
    var c = aroundCounts(n);
    var i = 0;
    var k;
    var tmp;
    var south = [];
    var east = [];
    var north = [];
    var west = [];
    for (k = 0; k < c.s; k++) {
      south.push(i);
      i += 1;
    }
    tmp = [];
    for (k = 0; k < c.e; k++) {
      tmp.push(i);
      i += 1;
    }
    for (k = tmp.length - 1; k >= 0; k--) {
      east.push(tmp[k]);
    }
    tmp = [];
    for (k = 0; k < c.n; k++) {
      tmp.push(i);
      i += 1;
    }
    for (k = tmp.length - 1; k >= 0; k--) {
      north.push(tmp[k]);
    }
    for (k = 0; k < c.w; k++) {
      west.push(i);
      i += 1;
    }
    return { north: north, east: east, south: south, west: west };
  }

  function layoutBands(W, H, gap, sides, rots) {
    var north = sides.north || [];
    var south = sides.south || [];
    var west = sides.west || [];
    var east = sides.east || [];
    var hasN = north.length > 0;
    var hasS = south.length > 0;
    var hasW = west.length > 0;
    var hasE = east.length > 0;
    var hasMid = hasW || hasE;
    var vCount = (hasN ? 1 : 0) + (hasMid ? 1 : 0) + (hasS ? 1 : 0);
    var ys;
    var yi = 0;
    var yN = 0;
    var hN = 0;
    var yM = 0;
    var hM = 0;
    var yS = 0;
    var hS = 0;
    var boxes = [];
    var xs;
    var xi;
    var i;

    if (vCount < 1) {
      return fillRows(W, H, gap, faceRows(north.length + south.length + west.length + east.length, true));
    }
    ys = slices(H, vCount, gap);
    if (hasN) {
      yN = ys[yi].pos;
      hN = ys[yi].size;
      yi += 1;
    }
    if (hasMid) {
      yM = ys[yi].pos;
      hM = ys[yi].size;
      yi += 1;
    }
    if (hasS) {
      yS = ys[yi].pos;
      hS = ys[yi].size;
    }

    function placeRow(ids, y, h, rot) {
      var rowXs = slices(W, ids.length, gap);
      var p;
      for (p = 0; p < ids.length; p++) {
        boxes[ids[p]] = { x: rowXs[p].pos, y: y, w: rowXs[p].size, h: h, rot: rot };
      }
    }

    function placeCol(ids, x, y, w, h, rot) {
      var colYs = slices(h, ids.length, gap);
      var p;
      for (p = 0; p < ids.length; p++) {
        boxes[ids[p]] = { x: x, y: y + colYs[p].pos, w: w, h: colYs[p].size, rot: rot };
      }
    }

    if (hasN) {
      placeRow(north, yN, hN, rots.n);
    }
    if (hasS) {
      placeRow(south, yS, hS, rots.s);
    }
    if (hasMid) {
      xs = slices(W, (hasW ? 1 : 0) + (hasE ? 1 : 0), gap);
      xi = 0;
      if (hasW) {
        placeCol(west, xs[xi].pos, yM, xs[xi].size, hM, rots.w);
        xi += 1;
      }
      if (hasE) {
        placeCol(east, xs[xi].pos, yM, xs[xi].size, hM, rots.e);
      }
    }

    for (i = 0; i < boxes.length; i++) {
      if (!boxes[i]) {
        return fillRows(W, H, gap, faceRows(sides.north.length + sides.south.length + sides.west.length + sides.east.length, true));
      }
    }
    return boxes;
  }

  function layoutBoxesFor(n, W, H, layoutId) {
    var gap = 2;
    var id = layoutId || 'face';
    var around;
    var rotsTable = { n: 180, e: 270, s: 0, w: 90 };

    if (id === 'sides' && n === 2) {
      return layoutBands(W, H, gap, { north: [], south: [], west: [0], east: [1] }, { n: 0, e: 270, s: 0, w: 90 });
    }
    if (id === 'same' && n === 2) {
      return fillRows(W, H, gap, [{ ids: [0, 1], rot: 0 }]);
    }
    if (id === 'same' && n === 3) {
      return fillRows(W, H, gap, [{ ids: [0, 1, 2], rot: 0 }]);
    }
    if (id === 'same' && n === 9) {
      return fillRows(W, H, gap, [
        { ids: [6, 7, 8], rot: 0 },
        { ids: [3, 4, 5], rot: 0 },
        { ids: [0, 1, 2], rot: 0 }
      ]);
    }
    if (id === 'table' && n >= 3) {
      around = assignAround(n);
      return layoutBands(W, H, gap, around, rotsTable);
    }
    if (n === 4) {
      return fillRows(W, H, gap, [
        { ids: [2, 3], rot: 180 },
        { ids: [0, 1], rot: 0 }
      ]);
    }
    if (id === 'same') {
      return fillRows(W, H, gap, faceRows(n, false));
    }
    return fillRows(W, H, gap, faceRows(n, true));
  }

  function applySeatBox(seat, box, boardW) {
    var panel = seat.getElementsByClassName('panel')[0];
    var rot = box.rot || 0;
    var cx = box.x + box.w / 2;
    var onRight = boardW && cx > boardW / 2 + 1;
    var onLeft = boardW && cx < boardW / 2 - 1;
    var menuRight = false;
    seat.style.left = box.x + 'px';
    seat.style.top = box.y + 'px';
    seat.style.width = box.w + 'px';
    seat.style.height = box.h + 'px';
    if (rot === 90 || rot === 270) {
      panel.style.width = box.h + 'px';
      panel.style.height = box.w + 'px';
      panel.style.left = ((box.w - box.h) / 2) + 'px';
      panel.style.top = ((box.h - box.w) / 2) + 'px';
    } else {
      panel.style.width = '100%';
      panel.style.height = '100%';
      panel.style.left = '0px';
      panel.style.top = '0px';
    }
    if (onRight) {
      menuRight = rot !== 180;
    } else if (onLeft) {
      menuRight = rot === 180;
    }
    toggleClass(seat, 'menu-right', menuRight);
    if (rot === 180) {
      panel.style.webkitTransform = 'rotate(180deg)';
      panel.style.transform = 'rotate(180deg)';
      addClass(panel, 'rot-180');
    } else if (rot) {
      panel.style.webkitTransform = 'rotate(' + rot + 'deg)';
      panel.style.transform = 'rotate(' + rot + 'deg)';
      removeClass(panel, 'rot-180');
    } else {
      panel.style.webkitTransform = 'none';
      panel.style.transform = 'none';
      removeClass(panel, 'rot-180');
    }
    toggleClass(seat, 'is-flip', rot === 180);
    seat.setAttribute('data-rot', String(rot));
  }

  function createSeat(index) {
    var seat = document.createElement('div');
    var panel = document.createElement('div');
    var hitM = document.createElement('div');
    var hitP = document.createElement('div');
    var hud = document.createElement('div');
    var top = document.createElement('div');
    var bot = document.createElement('div');
    var menu = document.createElement('button');
    var name = document.createElement('span');
    var cellMenu = document.createElement('div');
    var cellName = document.createElement('div');
    var cellCmd = document.createElement('div');
    var life = document.createElement('div');
    var delta = document.createElement('div');
    var hist = document.createElement('div');
    var caption = document.createElement('div');
    var cmdRow = document.createElement('div');
    var artImg = document.createElement('img');
    var shade = document.createElement('div');
    var dead = document.createElement('div');
    var skull = document.createElement('span');

    seat.className = 'seat';
    seat.setAttribute('data-index', String(index));
    panel.className = 'panel';
    hitM.className = 'hit hit-minus';
    hitP.className = 'hit hit-plus';
    hitM.setAttribute('data-dir', '-1');
    hitP.setAttribute('data-dir', '1');
    hitM.innerHTML = '<span class="hit-sign">-</span>';
    hitP.innerHTML = '<span class="hit-sign">+</span>';
    hud.className = 'hud';
    top.className = 'hud-top';
    bot.className = 'hud-bot';
    menu.className = 'btn-menu';
    menu.type = 'button';
    menu.setAttribute('data-act', 'menu');
    menu.innerHTML = '<span class="menu-bars"></span>';
    name.className = 'name';
    cellMenu.className = 'hud-cell hud-cell-menu';
    cellName.className = 'hud-cell hud-cell-name';
    cellCmd.className = 'hud-cell hud-cell-cmd';
    life.className = 'life';
    life.setAttribute('data-act', 'keypad');
    delta.className = 'delta';
    hist.className = 'hist';
    caption.className = 'life-caption';
    cmdRow.className = 'cmd-row';
    artImg.className = 'panel-art';
    artImg.alt = '';
    artImg.setAttribute('referrerpolicy', 'no-referrer');
    shade.className = 'panel-shade';
    dead.className = 'dead-mask';
    skull.innerHTML = 'PERDIO';
    dead.appendChild(skull);
    cellMenu.appendChild(menu);
    top.appendChild(cellMenu);
    top.appendChild(cellName);
    top.appendChild(cellCmd);
    hud.appendChild(top);
    hud.appendChild(name);
    hud.appendChild(life);
    hud.appendChild(delta);
    hud.appendChild(hist);
    hud.appendChild(caption);
    hud.appendChild(cmdRow);
    hud.appendChild(bot);
    panel.appendChild(artImg);
    panel.appendChild(shade);
    panel.appendChild(hitM);
    panel.appendChild(hitP);
    panel.appendChild(hud);
    panel.appendChild(dead);
    seat.appendChild(panel);
    return seat;
  }

  function buildSeats() {
    var board = $('board');
    var i;
    board.innerHTML = '';
    for (i = 0; i < state.players.length; i++) {
      board.appendChild(createSeat(i));
    }
    layoutSeats();
  }

  function openHubAisle(boxes, W, H) {
    var hw = 4;
    var hh = 4;
    var min = 48;
    var cx = W / 2;
    var cy = H / 2;
    var i;
    var b;
    var right;
    var bottom;
    var midX;
    var midY;
    if (!boxes || !W || !H) {
      return;
    }
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      if (!b) {
        continue;
      }
      right = b.x + b.w;
      bottom = b.y + b.h;
      midX = b.x + b.w / 2;
      midY = b.y + b.h / 2;
      if (midX > cx - hw && midX < cx + hw && midY > cy - hh && midY < cy + hh) {
        continue;
      }
      if (b.w < W * 0.7) {
        if (midX < cx && right > cx - hw) {
          if (cx - hw - b.x >= min) {
            b.w = cx - hw - b.x;
          }
        } else if (midX >= cx && b.x < cx + hw) {
          if (right - (cx + hw) >= min) {
            b.w = right - (cx + hw);
            b.x = cx + hw;
          }
        }
      }
      right = b.x + b.w;
      if (b.h < H * 0.7) {
        if (midY < cy && bottom > cy - hh) {
          if (cy - hh - b.y >= min) {
            b.h = cy - hh - b.y;
          }
        } else if (midY >= cy && b.y < cy + hh) {
          if (bottom - (cy + hh) >= min) {
            b.h = bottom - (cy + hh);
            b.y = cy + hh;
          }
        }
      }
    }
  }

  function layoutSeats() {
    var board = $('board');
    var W = board.clientWidth;
    var H = board.clientHeight;
    var edge = 8;
    var padX = 0;
    var innerW = W;
    var innerH = H;
    var boxes;
    var seats;
    var i;
    if (W > edge * 2 + 120) {
      innerW = W - edge * 2;
      padX = edge;
    }
    if (H > edge + 120) {
      innerH = H - edge;
    }
    boxes = layoutBoxes(state.players.length, innerW, innerH);
    seats = board.getElementsByClassName('seat');
    openHubAisle(boxes, innerW, innerH);
    for (i = 0; i < boxes.length; i++) {
      if (boxes[i]) {
        boxes[i].x += padX;
      }
    }
    for (i = 0; i < seats.length; i++) {
      if (boxes[i]) {
        applySeatBox(seats[i], boxes[i], W);
      }
    }
  }

  function relayoutSoon() {
    setTimeout(function () {
      if (state.started && state.players.length) {
        layoutSeats();
        renderAll();
      }
    }, 50);
  }

  function syncHub() {
    var hub = $('hub');
    if (!hub) {
      return;
    }
    toggleClass(hub, 'hidden', !state.started);
    toggleClass(hub, 'is-close', hasClass(document.body, 'is-fs'));
    hub.title = hasClass(document.body, 'is-fs') ? 'Salir de pantalla completa' : 'Menú';
  }

  function enterFullscreen() {
    var root = document.documentElement;
    addClass(document.body, 'is-fs');
    closeOverlay('overlay-menu');
    syncHub();
    try {
      if (root.requestFullscreen) {
        root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else if (root.webkitRequestFullScreen) {
        root.webkitRequestFullScreen();
      }
    } catch (e) {}
    relayoutSoon();
  }

  function exitFullscreen() {
    removeClass(document.body, 'is-fs');
    syncHub();
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.webkitCancelFullScreen) {
        document.webkitCancelFullScreen();
      }
    } catch (e) {}
    relayoutSoon();
  }

  function renderMenuCommanders() {
    var html = '';
    var i;
    var p;
    var n;
    var box = $('menu-cmd-counts');
    if (!box) {
      return;
    }
    if (!state.players || !state.players.length) {
      box.innerHTML = '';
      return;
    }
    for (i = 0; i < state.players.length; i++) {
      p = state.players[i];
      n = p.partners ? 2 : 1;
      html += '<div class="counter-row"><span>' + escapeHtml(p.name) +
        '</span><div class="ctr-btns"><button type="button" data-act="cmd-count" data-player="' + i +
        '" data-dir="-1">-</button><strong>' + n + '</strong><button type="button" data-act="cmd-count" data-player="' +
        i + '" data-dir="1">+</button></div></div>';
    }
    box.innerHTML = html;
  }

  function renderToolbar() {
    $('turn-label').innerHTML = String(state.turn);
    $('timer-label').innerHTML = formatTime(state.timerSeconds);
    $('btn-timer').innerHTML = state.timerRunning ? '&#10073;&#10073;' : '&#9654;';
  }

  function chipsHtml(p) {
    var html = '';
    var i;
    var c;
    var val;
    for (i = 0; i < COUNTERS.length; i++) {
      c = COUNTERS[i];
      val = p.counters[c.key] || 0;
      if (val) {
        html += '<span class="chip' + (c.lethal && val >= c.lethal ? ' danger' : '') + '">' +
          c.label.split(' ')[0] + ' ' + val + '</span>';
      }
    }
    return html;
  }

  function cmdBadgesHtml(playerIndex) {
    var views = viewList(playerIndex);
    var p = state.players[playerIndex];
    var html = '';
    var i;
    var v;
    var src;
    var val;
    if (p.view > 0) {
      html += '<button type="button" class="cmd-back" data-act="cmd-back">Volver</button>';
    }
    for (i = 1; i < views.length; i++) {
      v = views[i];
      src = state.players[v.src];
      val = p.cmd[v.key] || 0;
      html += '<button type="button" class="cmd-badge' +
        (p.view === i ? ' active' : '') +
        (val >= 21 ? ' lethal' : '') +
        '" data-act="cmd-src" data-view="' + i + '">' +
        '<span class="cmd-dot" style="background:' + src.color + '"></span>' +
        (src.partners ? '<span class="cmd-mark">' + (v.partner ? '2' : '1') + '</span>' : '') +
        '<span class="cmd-badge-n">' + val + '</span></button>';
    }
    return html;
  }

  function updateSeat(index) {
    var board = $('board');
    var seat = board.getElementsByClassName('seat')[index];
    var p = state.players[index];
    var views = viewList(index);
    var v = views[p.view] || views[0];
    var panel = seat.getElementsByClassName('panel')[0];
    var lifeEl = seat.getElementsByClassName('life')[0];
    var deltaEl = seat.getElementsByClassName('delta')[0];
    var histEl = seat.getElementsByClassName('hist')[0];
    var nameEl = seat.getElementsByClassName('name')[0];
    var caption = seat.getElementsByClassName('life-caption')[0];
    var cmdRow = seat.getElementsByClassName('cmd-row')[0];
    var bot = seat.getElementsByClassName('hud-bot')[0];
    var dead = seat.getElementsByClassName('dead-mask')[0];
    var artEl = seat.getElementsByClassName('panel-art')[0];
    var value;
    var label;
    var boxW;
    var src;
    var slot;
    var deltaKey;
    var histBook;

    panel.style.backgroundColor = (v.type === 'cmd' && state.players[v.src]) ? state.players[v.src].color : p.color;
    panel.style.backgroundImage = 'none';
    if (v.type !== 'cmd' && p.bgArt && artEl) {
      src = p.bgArt;
      artEl.setAttribute('referrerpolicy', 'no-referrer');
      if (p.bgCdn) {
        artEl.setAttribute('data-cdn', p.bgCdn);
      }
      addClass(panel, 'has-art');
      if (artEl.getAttribute('src') !== src) {
        artEl.style.display = 'none';
        artEl.onload = function () {
          artEl.style.display = 'block';
        };
        artEl.onerror = function () {
          var cdn = artEl.getAttribute('data-cdn');
          artEl.onerror = null;
          if (cdn && artEl.getAttribute('src') !== cdn) {
            artEl.src = cdn;
          } else {
            artEl.style.display = 'none';
            removeClass(panel, 'has-art');
          }
        };
        artEl.src = src;
      } else {
        artEl.style.display = 'block';
      }
    } else if (artEl) {
      artEl.onload = null;
      artEl.onerror = null;
      artEl.removeAttribute('src');
      artEl.style.display = 'none';
      removeClass(panel, 'has-art');
    }
    nameEl.innerHTML = escapeHtml(p.name);
    bot.innerHTML = chipsHtml(p);
    cmdRow.innerHTML = cmdBadgesHtml(index);

    if (v.type === 'life') {
      value = p.life;
      label = '';
      removeClass(panel, 'cmd-mode');
    } else {
      value = p.cmd[v.key] || 0;
      label = '';
      addClass(panel, 'cmd-mode');
    }
    lifeEl.innerHTML = String(value);
    caption.innerHTML = label;
    deltaKey = v.type === 'life' ? 'life' : v.key;
    slot = ui.deltas[index];
    if (deltaEl) {
      if (slot && slot.value && slot.key === deltaKey) {
        deltaEl.innerHTML = (slot.value > 0 ? '+' : '') + slot.value;
      } else {
        deltaEl.innerHTML = '';
      }
    }
    if (histEl) {
      histBook = ui.history[index];
      histEl.innerHTML = historyHtml(histBook && histBook[deltaKey]);
    }
    if ((seat.getAttribute('data-rot') || '0') === '180') {
      addClass(panel, 'rot-180');
      panel.style.webkitTransform = 'rotate(180deg)';
      panel.style.transform = 'rotate(180deg)';
    }

    boxW = seat.clientWidth;
    toggleClass(seat, 'tight', boxW < 260);
    if (boxW < 220 || (v.type === 'cmd' && value >= 21)) {
      addClass(lifeEl, 'small');
    } else {
      removeClass(lifeEl, 'small');
    }
    toggleClass(dead, 'show', p.dead);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function winnerName() {
    var i;
    var last = null;
    var n = 0;
    for (i = 0; i < state.players.length; i++) {
      if (!state.players[i].dead && state.players[i].life > 0) {
        n += 1;
        last = state.players[i].name;
      }
    }
    return n === 1 ? last : null;
  }

  function renderAll() {
    var i;
    var banner = $('winner-banner');
    var w;
    for (i = 0; i < state.players.length; i++) {
      updateSeat(i);
    }
    renderToolbar();
    syncHub();
    w = winnerName();
    if (state.started && state.players.length > 1 && w) {
      removeClass(banner, 'hidden');
      $('winner-text').innerHTML = 'Ganador: ' + escapeHtml(w);
    } else {
      addClass(banner, 'hidden');
    }
  }

  function changeCurrent(index, dir) {
    var p = state.players[index];
    var views = viewList(index);
    var v = views[p.view] || views[0];
    var applied = dir;
    if (v.type === 'life') {
      p.life += dir;
      if (dir > 0 && p.life > 0 && p.counters.poison < 10 && !commanderLethal(p)) {
        p.dead = false;
      }
      if (p.counters.poison >= 10 || p.life <= 0 || commanderLethal(p)) {
        p.dead = true;
      }
      save();
    } else {
      applied = addCmd(index, v.key, dir);
    }
    bumpDelta(index, applied, v.type === 'life' ? 'life' : v.key);
    renderAll();
  }

  function cycleView(index, dir) {
    var p = state.players[index];
    var views = viewList(index);
    p.view += dir;
    if (p.view < 0) {
      p.view = views.length - 1;
    }
    if (p.view >= views.length) {
      p.view = 0;
    }
    save();
    updateSeat(index);
  }

  function openOverlay(id) {
    addClass($(id), 'is-open');
  }

  function closeOverlay(id) {
    removeClass($(id), 'is-open');
  }

  function closeAllOverlays() {
    var nodes = document.getElementsByClassName('overlay');
    var i;
    for (i = 0; i < nodes.length; i++) {
      removeClass(nodes[i], 'is-open');
    }
  }

  function openPlayerMenu(index) {
    var p = state.players[index];
    var i;
    var html = '';
    var c;
    ui.editingIndex = index;
    $('player-modal-title').innerHTML = escapeHtml(p.name);
    $('player-name').value = p.name;
    $('player-partners').checked = !!p.partners;
    html = '';
    for (i = 0; i < COLORS.length; i++) {
      html += '<button type="button" class="swatch' + (COLORS[i] === p.color ? ' selected' : '') +
        '" data-color="' + COLORS[i] + '" style="background:' + COLORS[i] + '" title="' + COLOR_NAMES[i] + '"></button>';
    }
    $('color-row').innerHTML = html;
    html = '';
    for (i = 0; i < COUNTERS.length; i++) {
      c = COUNTERS[i];
      html += '<div class="counter-row" data-ckey="' + c.key + '"><span>' + c.label +
        '</span><div class="ctr-btns"><button type="button" data-cdir="-1">-</button><strong>' +
        (p.counters[c.key] || 0) + '</strong><button type="button" data-cdir="1">+</button></div></div>';
    }
    $('counter-list').innerHTML = html;
    fillCmdList(index);
    $('btn-kill').innerHTML = p.dead ? 'Revivir' : 'Eliminar jugador';
    fillPlayerCardUi(p);
    openOverlay('overlay-player');
  }

  function fillPlayerCardUi(p) {
    $('player-card-query').value = p.bgCard || '';
    hideCardSuggest();
    if (p.bgArt) {
      $('player-card-status').innerHTML = escapeHtml(p.bgCard || 'Fondo activo');
      $('player-card-preview').innerHTML = '<div class="bg-preview"><img src="' + p.bgArt + '" alt="" referrerpolicy="no-referrer"></div>';
    } else {
      $('player-card-status').innerHTML = '';
      $('player-card-preview').innerHTML = '';
    }
  }

  function hideCardSuggest() {
    var el = $('player-card-suggest');
    el.innerHTML = '';
    removeClass(el, 'is-open');
    ui.suggestNames = [];
    ui.suggestSeq += 1;
    if (ui.suggestTimer) {
      clearTimeout(ui.suggestTimer);
      ui.suggestTimer = null;
    }
  }

  function showCardSuggest(names) {
    var el = $('player-card-suggest');
    var html = '';
    var i;
    if (!names || !names.length) {
      hideCardSuggest();
      return;
    }
    ui.suggestNames = names;
    for (i = 0; i < names.length; i++) {
      html += '<button type="button" class="suggest-item" data-suggest-i="' + i + '">' +
        escapeHtml(names[i]) + '</button>';
    }
    el.innerHTML = html;
    addClass(el, 'is-open');
  }

  function fetchCardSuggest() {
    var q = $('player-card-query').value.replace(/^\s+|\s+$/g, '');
    var seq;
    var url;
    ui.suggestTimer = null;
    if (q.length < 2) {
      hideCardSuggest();
      return;
    }
    ui.suggestSeq += 1;
    seq = ui.suggestSeq;
    url = 'https://api.scryfall.com/cards/autocomplete?q=' + encodeURIComponent(q);
    xhrGet(url, function (err, text) {
      var data;
      if (seq !== ui.suggestSeq) {
        return;
      }
      if (err) {
        hideCardSuggest();
        return;
      }
      try {
        data = JSON.parse(text);
      } catch (e) {
        hideCardSuggest();
        return;
      }
      showCardSuggest(data.data || []);
    });
  }

  function scheduleCardSuggest() {
    if (ui.suggestTimer) {
      clearTimeout(ui.suggestTimer);
    }
    ui.suggestTimer = setTimeout(fetchCardSuggest, 280);
  }

  function pickCardSuggest(name) {
    hideCardSuggest();
    $('player-card-query').value = name;
    searchPlayerBg();
  }

  function cardArtUrl(card) {
    var face;
    if (card.image_uris) {
      return card.image_uris.normal || card.image_uris.large || card.image_uris.art_crop || card.image_uris.small || '';
    }
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
      face = card.card_faces[0].image_uris;
      return face.normal || face.large || face.art_crop || face.small || '';
    }
    return '';
  }

  function cardApiImageUrl(card, version) {
    if (card && card.id) {
      return 'https://api.scryfall.com/cards/' + card.id + '?format=image&version=' + (version || 'normal');
    }
    if (card && card.name) {
      return 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(card.name) + '&format=image&version=' + (version || 'normal');
    }
    return '';
  }

  function searchPlayerBg() {
    var q = $('player-card-query').value.replace(/^\s+|\s+$/g, '');
    var url;
    var idx = ui.editingIndex;
    var p;
    $('player-card-status').innerHTML = 'Buscando...';
    hideCardSuggest();
    if (!q) {
      $('player-card-status').innerHTML = 'Escribe el nombre de una carta.';
      return;
    }
    if (idx < 0) {
      return;
    }
    url = 'https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(q);
    xhrGet(url, function (err, text) {
      var card;
      var art;
      if (idx !== ui.editingIndex) {
        return;
      }
      if (err) {
        $('player-card-status').innerHTML = 'No se encontro. Prueba un nombre mas exacto o revisa la conexion.';
        return;
      }
      try {
        card = JSON.parse(text);
      } catch (e) {
        $('player-card-status').innerHTML = 'Respuesta invalida.';
        return;
      }
      art = cardApiImageUrl(card, 'normal') || cardArtUrl(card);
      if (!art) {
        $('player-card-status').innerHTML = 'Esa carta no tiene imagen.';
        return;
      }
      p = state.players[idx];
      p.bgCard = card.name;
      p.bgArt = art;
      p.bgCdn = cardArtUrl(card);
      $('player-card-query').value = card.name;
      $('player-card-status').innerHTML = escapeHtml(card.name);
      $('player-card-preview').innerHTML = '<div class="bg-preview"><img src="' + art + '" alt="" referrerpolicy="no-referrer"></div>';
      save();
      updateSeat(idx);
    });
  }

  function clearPlayerBg() {
    var idx = ui.editingIndex;
    var p;
    if (idx < 0) {
      return;
    }
    p = state.players[idx];
    p.bgArt = '';
    p.bgCdn = '';
    p.bgCard = '';
    $('player-card-query').value = '';
    $('player-card-status').innerHTML = 'Fondo quitado.';
    $('player-card-preview').innerHTML = '';
    save();
    updateSeat(idx);
  }

  function fillCmdList(index) {
    var p = state.players[index];
    var views = viewList(index);
    var html = '';
    var i;
    var v;
    var val;
    for (i = 1; i < views.length; i++) {
      v = views[i];
      val = p.cmd[v.key] || 0;
      html += '<div class="counter-row" data-cmdkey="' + v.key + '"><span>' +
        escapeHtml(v.label) + (val >= 21 ? ' LETAL' : '') +
        '</span><div class="ctr-btns"><button type="button" data-cmddir="-1">-</button><strong>' +
        val + '</strong><button type="button" data-cmddir="1">+</button></div></div>';
    }
    $('cmd-list').innerHTML = html || '<p class="sub">No hay rivales en la mesa.</p>';
  }

  function applyPlayerMenu() {
    var idx = ui.editingIndex;
    var p;
    if (idx < 0) {
      return;
    }
    p = state.players[idx];
    p.name = $('player-name').value.replace(/^\s+|\s+$/g, '') || p.name;
    p.partners = $('player-partners').checked;
    syncCommanderMaps();
    save();
    renderAll();
  }

  function openKeypad(index) {
    var p = state.players[index];
    var views = viewList(index);
    var v = views[p.view] || views[0];
    ui.keypadTarget = { index: index, view: v };
    if (v.type === 'life') {
      $('keypad-title').innerHTML = 'Vida de ' + escapeHtml(p.name);
      ui.keypadBuffer = String(p.life);
    } else {
      $('keypad-title').innerHTML = 'Daño de ' + escapeHtml(v.label);
      ui.keypadBuffer = String(p.cmd[v.key] || 0);
    }
    $('keypad-value').innerHTML = ui.keypadBuffer;
    openOverlay('overlay-keypad');
  }

  function commitKeypad() {
    var t = ui.keypadTarget;
    var p;
    var n;
    if (!t) {
      return;
    }
    p = state.players[t.index];
    n = parseInt(ui.keypadBuffer, 10);
    if (isNaN(n)) {
      n = 0;
    }
    if (t.view.type === 'life') {
      p.life = n;
      if (p.life <= 0 || p.counters.poison >= 10 || commanderLethal(p)) {
        p.dead = true;
      }
    } else {
      if (n < 0) {
        n = 0;
      }
      addCmd(t.index, t.view.key, n - (p.cmd[t.view.key] || 0));
    }
    save();
    closeOverlay('overlay-keypad');
    renderAll();
  }

  function xhrGet(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) {
        if (x.status >= 200 && x.status < 300) {
          cb(null, x.responseText);
        } else {
          cb(new Error('HTTP ' + x.status));
        }
      }
    };
    try {
      x.send(null);
    } catch (e) {
      cb(e);
    }
  }

  function searchCard() {
    var q = $('card-query').value.replace(/^\s+|\s+$/g, '');
    var url;
    $('card-status').innerHTML = 'Buscando...';
    $('card-result').innerHTML = '';
    if (!q) {
      $('card-status').innerHTML = 'Escribe el nombre de una carta.';
      return;
    }
    url = 'https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(q);
    xhrGet(url, function (err, text) {
      var card;
      var html;
      var usd;
      var legal;
      if (err) {
        $('card-status').innerHTML = 'No se pudo buscar. Revisa la conexion o prueba un nombre mas exacto.';
        return;
      }
      try {
        card = JSON.parse(text);
      } catch (e) {
        $('card-status').innerHTML = 'Respuesta invalida.';
        return;
      }
      usd = card.prices && card.prices.usd ? '$' + card.prices.usd : '-';
      legal = card.legalities || {};
      html = '<div class="card-block">';
      if (card.image_uris && card.image_uris.small) {
        html += '<img src="' + card.image_uris.small + '" alt="">';
      } else if (card.card_faces && card.card_faces[0].image_uris) {
        html += '<img src="' + card.card_faces[0].image_uris.small + '" alt="">';
      }
      html += '<div class="card-meta"><strong>' + escapeHtml(card.name) + '</strong><br>' +
        escapeHtml(card.mana_cost || '') + '<br>' +
        escapeHtml(card.type_line || '') + '<br>' +
        'USD: ' + usd + '<br>' +
        'Commander: ' + (legal.commander || '-') + '<br>' +
        'Modern: ' + (legal.modern || '-') + '<br>' +
        'Standard: ' + (legal.standard || '-') +
        '</div></div>';
      $('card-status').innerHTML = card.set_name ? escapeHtml(card.set_name) : '';
      $('card-result').innerHTML = html;
    });
  }

  function rollDie(sides) {
    return 1 + Math.floor(Math.random() * sides);
  }

  function showDiceResult() {
    var i;
    var n;
    var html = '';
    var total = 0;
    for (i = 0; i < ui.diceCount; i++) {
      n = rollDie(ui.diceSides);
      total += n;
      html += '<span class="die-pip">' + n + '</span>';
    }
    if (ui.diceCount > 1) {
      html += '<div style="margin-top:8px;font-size:16px">Total ' + total + '</div>';
    }
    $('dice-result').innerHTML = html;
  }

  function highRoll() {
    var i;
    var rolls = [];
    var best = 0;
    var html = '';
    var r;
    for (i = 0; i < state.players.length; i++) {
      r = rollDie(20);
      rolls.push(r);
      if (r > best) {
        best = r;
      }
    }
    for (i = 0; i < state.players.length; i++) {
      html += '<div class="high-row' + (rolls[i] === best ? ' win' : '') + '">' +
        escapeHtml(state.players[i].name) + ': <strong>' + rolls[i] + '</strong>' +
        (rolls[i] === best ? '  <<' : '') + '</div>';
    }
    $('high-result').innerHTML = html;
  }

  function planarRoll() {
    var faces = ['-', '-', '-', '-', 'CAOS', 'PLANESWALK'];
    var face = faces[Math.floor(Math.random() * faces.length)];
    var el = $('planar-result');
    el.innerHTML = face === '-' ? 'En blanco' : face;
    el.className = 'planar-face' + (face === 'CAOS' ? ' chaos' : '') + (face === 'PLANESWALK' ? ' walk' : '');
  }

  function stopTimer(resetFlag) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    state.timerRunning = false;
    if (resetFlag) {
      $('btn-timer').innerHTML = '&#9654;';
    }
  }

  function startTimer() {
    stopTimer(false);
    state.timerRunning = true;
    timerId = setInterval(function () {
      state.timerSeconds += 1;
      $('timer-label').innerHTML = formatTime(state.timerSeconds);
      if (state.timerSeconds % 10 === 0) {
        save();
      }
    }, 1000);
    $('btn-timer').innerHTML = '&#10073;&#10073;';
  }

  function toggleTimer() {
    if (state.timerRunning) {
      stopTimer(false);
      $('btn-timer').innerHTML = '&#9654;';
      save();
    } else {
      startTimer();
      save();
    }
    renderToolbar();
  }

  function bindPointer(root) {
    var startX = 0;
    var startY = 0;
    var startEl = null;
    var longTimer = null;
    var longFired = false;
    var moved = false;
    var hitEl = null;
    var touchMode = false;

    function clearLong() {
      if (longTimer) {
        clearTimeout(longTimer);
        longTimer = null;
      }
    }

    function pressHit(el, onFlag) {
      if (hitEl) {
        removeClass(hitEl, 'pressed');
      }
      hitEl = onFlag ? el : null;
      if (hitEl) {
        addClass(hitEl, 'pressed');
      }
    }

    function seatIndexFrom(el) {
      var seat = closest(el, '.seat');
      if (!seat) {
        return -1;
      }
      return parseInt(seat.getAttribute('data-index'), 10);
    }

    function handleTap(el, isHold) {
      var seatIdx;
      var hit;
      var dir;
      var act;
      var overlay;
      var choice;
      var swatch;
      var row;
      var ckey;
      var p;
      var val;
      var actEl;
      var viewN;
      var layCard;
      var i;
      var sugI;
      var sugEl;

      if (closest(el, 'input')) {
        return;
      }

      if (el.nodeType === 3) {
        el = el.parentNode;
      }

      if (!el.getAttribute || !el.getAttribute('data-act')) {
        actEl = closest(el, '[data-act]');
        if (actEl) {
          el = actEl;
        }
      }

      overlay = closest(el, '.overlay');
      if (overlay && el === overlay) {
        if (overlay.id === 'overlay-setup') {
          return;
        }
        if (overlay.id === 'overlay-player') {
          applyPlayerMenu();
        }
        if (overlay.id === 'overlay-plane') {
          state.planeName = $('plane-name').value;
          save();
        }
        closeOverlay(overlay.id);
        return;
      }

      act = el.getAttribute && el.getAttribute('data-act');
      if (!act && el.parentNode && el.parentNode.getAttribute) {
        act = el.parentNode.getAttribute('data-act');
        if (act) {
          el = el.parentNode;
        }
      }

      if (act === 'hub') {
        if (hasClass(document.body, 'is-fs')) {
          exitFullscreen();
        } else {
          renderToolbar();
          renderMenuCommanders();
          openOverlay('overlay-menu');
        }
        return;
      }
      if (act === 'new') {
        closeOverlay('overlay-menu');
        openOverlay('overlay-confirm');
        return;
      }
      if (act === 'fs') {
        enterFullscreen();
        return;
      }
      if (act === 'dice') {
        closeOverlay('overlay-menu');
        $('dice-result').innerHTML = '';
        openOverlay('overlay-dice');
        return;
      }
      if (act === 'layout') {
        closeOverlay('overlay-menu');
        renderLayoutPicker('layout-row-game');
        openOverlay('overlay-layout');
        return;
      }
      if (act === 'high') {
        closeOverlay('overlay-menu');
        $('high-result').innerHTML = '';
        openOverlay('overlay-high');
        return;
      }
      if (act === 'search') {
        closeOverlay('overlay-menu');
        openOverlay('overlay-search');
        return;
      }
      if (act === 'plane') {
        closeOverlay('overlay-menu');
        $('plane-name').value = state.planeName || '';
        openOverlay('overlay-plane');
        return;
      }
      if (act === 'cmd-count') {
        seatIdx = parseInt(el.getAttribute('data-player'), 10);
        dir = parseInt(el.getAttribute('data-dir'), 10);
        p = state.players[seatIdx];
        if (p && ((dir > 0 && !p.partners) || (dir < 0 && p.partners))) {
          p.partners = dir > 0;
          for (i = 0; i < state.players.length; i++) {
            state.players[i].view = 0;
          }
          syncCommanderMaps();
          save();
          renderAll();
          renderMenuCommanders();
        }
        return;
      }
      if (act === 'turn-prev') {
        if (state.turn > 1) {
          state.turn -= 1;
        }
        save();
        renderToolbar();
        return;
      }
      if (act === 'turn-next') {
        state.turn += 1;
        save();
        renderToolbar();
        return;
      }
      if (act === 'timer') {
        toggleTimer();
        return;
      }
      if (act === 'menu') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          openPlayerMenu(seatIdx);
        }
        return;
      }
      if (act === 'keypad') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          openKeypad(seatIdx);
        }
        return;
      }
      if (act === 'cmd-back') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          state.players[seatIdx].view = 0;
          save();
          updateSeat(seatIdx);
        }
        return;
      }
      if (act === 'cmd-prev') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          cycleView(seatIdx, -1);
        }
        return;
      }
      if (act === 'cmd-next') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          cycleView(seatIdx, 1);
        }
        return;
      }
      if (act === 'cmd-toggle') {
        seatIdx = seatIndexFrom(el);
        if (seatIdx >= 0) {
          p = state.players[seatIdx];
          if (p.view === 0) {
            cycleView(seatIdx, 1);
          } else {
            p.view = 0;
            save();
            updateSeat(seatIdx);
          }
        }
        return;
      }
      if (act === 'cmd-src') {
        seatIdx = seatIndexFrom(el);
        viewN = parseInt(el.getAttribute('data-view'), 10);
        if (seatIdx >= 0 && !isNaN(viewN)) {
          state.players[seatIdx].view = viewN;
          save();
          updateSeat(seatIdx);
        }
        return;
      }

      hit = closest(el, '.hit');
      if (hit) {
        seatIdx = seatIndexFrom(hit);
        dir = parseInt(hit.getAttribute('data-dir'), 10);
        if (seatIdx >= 0) {
          changeCurrent(seatIdx, isHold ? dir * 10 : dir);
        }
        return;
      }

      choice = closest(el, '.choice');
      if (choice && choice.getAttribute('data-count')) {
        state.playerCount = parseInt(choice.getAttribute('data-count'), 10);
        ensureLayoutId(state.playerCount);
        markSelected(choice.parentNode, choice);
        renderLayoutPicker('layout-row');
        return;
      }
      if (choice && choice.getAttribute('data-life')) {
        state.startingLife = parseInt(choice.getAttribute('data-life'), 10);
        markSelected(choice.parentNode, choice);
        return;
      }
      if (choice && choice.getAttribute('data-dice')) {
        ui.diceSides = parseInt(choice.getAttribute('data-dice'), 10);
        markSelected(choice.parentNode, choice);
        return;
      }

      layCard = closest(el, '[data-layout]');
      if (layCard) {
        state.layoutId = layCard.getAttribute('data-layout');
        save();
        renderLayoutPicker('layout-row');
        renderLayoutPicker('layout-row-game');
        if (state.started && state.players.length) {
          layoutSeats();
          renderAll();
        }
        return;
      }

      if (el.id === 'btn-menu-close') {
        closeOverlay('overlay-menu');
        return;
      }
      if (el.id === 'btn-layout-close') {
        closeOverlay('overlay-layout');
        if (state.started && state.players.length) {
          layoutSeats();
          renderAll();
        }
        return;
      }

      if (el.id === 'btn-start') {
        startGame(state.playerCount, state.startingLife);
        return;
      }
      if (el.id === 'btn-continue') {
        closeOverlay('overlay-setup');
        syncCommanderMaps();
        buildSeats();
        renderAll();
        return;
      }
      if (el.id === 'btn-player-close') {
        applyPlayerMenu();
        closeOverlay('overlay-player');
        return;
      }
      if (el.id === 'btn-player-card-go') {
        hideCardSuggest();
        searchPlayerBg();
        return;
      }
      if (el.id === 'btn-player-card-clear') {
        hideCardSuggest();
        clearPlayerBg();
        return;
      }
      sugEl = closest(el, '[data-suggest-i]');
      if (sugEl) {
        sugI = parseInt(sugEl.getAttribute('data-suggest-i'), 10);
        if (ui.suggestNames[sugI]) {
          pickCardSuggest(ui.suggestNames[sugI]);
        }
        return;
      }
      if (el.id === 'btn-kill') {
        p = state.players[ui.editingIndex];
        p.dead = !p.dead;
        save();
        $('btn-kill').innerHTML = p.dead ? 'Revivir' : 'Eliminar jugador';
        renderAll();
        return;
      }
      if (el.id === 'btn-keypad-ok') {
        commitKeypad();
        return;
      }
      if (el.id === 'btn-keypad-cancel') {
        closeOverlay('overlay-keypad');
        return;
      }
      if (el.id === 'btn-roll') {
        showDiceResult();
        return;
      }
      if (el.id === 'btn-coin') {
        $('dice-result').innerHTML = '<span class="die-pip">' + (Math.random() < 0.5 ? 'CARA' : 'CRUZ') + '</span>';
        return;
      }
      if (el.id === 'btn-dice-close') {
        closeOverlay('overlay-dice');
        return;
      }
      if (el.id === 'dice-minus') {
        if (ui.diceCount > 1) {
          ui.diceCount -= 1;
        }
        $('dice-count').innerHTML = String(ui.diceCount);
        return;
      }
      if (el.id === 'dice-plus') {
        if (ui.diceCount < 10) {
          ui.diceCount += 1;
        }
        $('dice-count').innerHTML = String(ui.diceCount);
        return;
      }
      if (el.id === 'btn-high-roll') {
        highRoll();
        return;
      }
      if (el.id === 'btn-high-close') {
        closeOverlay('overlay-high');
        return;
      }
      if (el.id === 'btn-card-go') {
        searchCard();
        return;
      }
      if (el.id === 'btn-search-close') {
        closeOverlay('overlay-search');
        return;
      }
      if (el.id === 'btn-planar-roll') {
        planarRoll();
        return;
      }
      if (el.id === 'btn-plane-close') {
        state.planeName = $('plane-name').value;
        save();
        closeOverlay('overlay-plane');
        return;
      }
      if (el.id === 'btn-confirm-yes') {
        exitFullscreen();
        closeAllOverlays();
        stopTimer(true);
        state.started = false;
        save();
        syncHub();
        openOverlay('overlay-setup');
        refreshSetup();
        return;
      }
      if (el.id === 'btn-confirm-no') {
        closeOverlay('overlay-confirm');
        return;
      }

      swatch = closest(el, '.swatch');
      if (swatch) {
        p = state.players[ui.editingIndex];
        p.color = swatch.getAttribute('data-color');
        markSelected(swatch.parentNode, swatch);
        save();
        renderAll();
        return;
      }

      if (el.getAttribute && el.getAttribute('data-cmddir')) {
        row = closest(el, '.counter-row');
        if (row && ui.editingIndex >= 0) {
          ckey = row.getAttribute('data-cmdkey');
          addCmd(ui.editingIndex, ckey, parseInt(el.getAttribute('data-cmddir'), 10));
          fillCmdList(ui.editingIndex);
          renderAll();
        }
        return;
      }

      if (el.getAttribute && el.getAttribute('data-cdir')) {
        row = closest(el, '.counter-row');
        if (row) {
          ckey = row.getAttribute('data-ckey');
          p = state.players[ui.editingIndex];
          val = (p.counters[ckey] || 0) + parseInt(el.getAttribute('data-cdir'), 10);
          if (val < 0) {
            val = 0;
          }
          p.counters[ckey] = val;
          if (ckey === 'poison' && val >= 10) {
            p.dead = true;
          }
          row.getElementsByTagName('strong')[0].innerHTML = String(val);
          save();
          renderAll();
        }
        return;
      }

      if (closest(el, '.key')) {
        handleKey(closest(el, '.key').getAttribute('data-k'));
      }
    }

    function handleKey(k) {
      if (k === 'C') {
        ui.keypadBuffer = '0';
      } else if (k === '-') {
        if (ui.keypadBuffer.charAt(0) === '-') {
          ui.keypadBuffer = ui.keypadBuffer.substring(1);
        } else {
          ui.keypadBuffer = '-' + ui.keypadBuffer;
        }
      } else {
        if (ui.keypadBuffer === '0' || ui.keypadBuffer === '-0') {
          ui.keypadBuffer = (ui.keypadBuffer.charAt(0) === '-' ? '-' : '') + k;
        } else if (ui.keypadBuffer.length < 5) {
          ui.keypadBuffer += k;
        }
      }
      $('keypad-value').innerHTML = ui.keypadBuffer;
    }

    function markSelected(parent, el) {
      var nodes = parent.getElementsByClassName(el.className.split(' ')[0]);
      var i;
      for (i = 0; i < nodes.length; i++) {
        removeClass(nodes[i], 'selected');
      }
      addClass(el, 'selected');
    }

    on(root, 'touchstart', function (e) {
      var t;
      var hit;
      if (e.touches.length !== 1) {
        return;
      }
      touchMode = true;
      t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startEl = e.target;
      longFired = false;
      moved = false;
      clearLong();
      hit = closest(startEl, '.hit');
      if (hit) {
        pressHit(hit, true);
        longTimer = setTimeout(function () {
          longFired = true;
          pressHit(null, false);
          handleTap(hit, true);
          ui.suppressClick = true;
        }, 420);
      }
    });

    on(root, 'touchmove', function (e) {
      var t;
      if (!touchMode || e.touches.length !== 1) {
        return;
      }
      t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 14 || Math.abs(t.clientY - startY) > 14) {
        moved = true;
        clearLong();
        pressHit(null, false);
      }
    });

    on(root, 'touchend', function (e) {
      var dx;
      var dy;
      var idx;
      var t;
      var rot;
      var seat;
      var endX;
      var endY;
      clearLong();
      pressHit(null, false);
      if (!touchMode) {
        return;
      }
      touchMode = false;
      if (closest(startEl, 'input') || closest(startEl, 'label') || closest(e.target, 'input') || closest(e.target, 'label')) {
        return;
      }
      if (longFired) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        ui.suppressClick = true;
        return;
      }
      t = e.changedTouches[0];
      endX = t.clientX;
      endY = t.clientY;
      dx = endX - startX;
      dy = endY - startY;
      seat = closest(startEl, '.seat');
      if (seat && moved && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        rot = parseInt(seat.getAttribute('data-rot'), 10) || 0;
        idx = parseInt(seat.getAttribute('data-index'), 10);
        if (rot === 180) {
          dx = -dx;
        }
        cycleView(idx, dx < 0 ? 1 : -1);
        if (e.preventDefault) {
          e.preventDefault();
        }
        ui.suppressClick = true;
        return;
      }
      if (!moved) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        ui.suppressClick = true;
        handleTap(startEl, false);
      }
    });

    on(root, 'click', function (e) {
      var hold;
      if (ui.suppressClick) {
        ui.suppressClick = false;
        if (e.preventDefault) {
          e.preventDefault();
        }
        return;
      }
      if (closest(e.target, 'input') || closest(e.target, 'label')) {
        return;
      }
      hold = e.shiftKey;
      handleTap(e.target, hold);
    });

    on(root, 'mousedown', function (e) {
      var hit;
      if (touchMode) {
        return;
      }
      hit = closest(e.target, '.hit');
      if (!hit) {
        return;
      }
      pressHit(hit, true);
      longFired = false;
      longTimer = setTimeout(function () {
        longFired = true;
        pressHit(null, false);
        handleTap(hit, true);
        ui.suppressClick = true;
      }, 420);
    });

    on(root, 'mouseup', function () {
      if (!touchMode) {
        clearLong();
        pressHit(null, false);
      }
    });
  }

  function renderLayoutPicker(containerId) {
    var el = $(containerId);
    var n;
    var opts;
    var html = '';
    var i;
    var j;
    var opt;
    var boxes;
    var b;
    var PW = 96;
    var PH = 60;
    var preview;
    if (!el) {
      return;
    }
    n = (containerId === 'layout-row-game' && state.players.length) ? state.players.length : state.playerCount;
    ensureLayoutId(n);
    opts = layoutOptions(n);
    for (i = 0; i < opts.length; i++) {
      opt = opts[i];
      boxes = layoutBoxesFor(n, PW, PH, opt.id);
      preview = '';
      for (j = 0; j < boxes.length; j++) {
        b = boxes[j];
        if (!b) {
          continue;
        }
        preview += '<span class="mini-seat" style="left:' + b.x + 'px;top:' + b.y +
          'px;width:' + b.w + 'px;height:' + b.h + 'px;line-height:' + b.h +
          'px;background:' + COLORS[j % COLORS.length] + '">' + (j + 1) + '</span>';
      }
      html += '<button type="button" class="layout-card' + (opt.id === state.layoutId ? ' selected' : '') +
        '" data-layout="' + opt.id + '"><div class="layout-preview">' + preview +
        '</div><strong>' + opt.name + '</strong><small>' + opt.desc + '</small></button>';
    }
    el.innerHTML = html;
  }

  function refreshSetup() {
    var row = $('count-row');
    var html = '';
    var i;
    var n;
    for (i = 2; i <= 10; i++) {
      n = i;
      html += '<button type="button" class="choice' + (n === state.playerCount ? ' selected' : '') +
        '" data-count="' + n + '">' + n + '</button>';
    }
    row.innerHTML = html;
    markLifeChoices();
    renderLayoutPicker('layout-row');
    if (state.started && state.players.length) {
      removeClass($('continue-wrap'), 'hidden');
    } else {
      addClass($('continue-wrap'), 'hidden');
    }
  }

  function markLifeChoices() {
    var nodes = document.querySelectorAll('[data-life]');
    var i;
    var v;
    for (i = 0; i < nodes.length; i++) {
      v = parseInt(nodes[i].getAttribute('data-life'), 10);
      toggleClass(nodes[i], 'selected', v === state.startingLife);
    }
  }

  function buildStatic() {
    var row = $('dice-types');
    var pad = $('keypad');
    var html = '';
    var i;
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'C'];
    for (i = 0; i < DICE.length; i++) {
      html += '<button type="button" class="choice' + (DICE[i] === ui.diceSides ? ' selected' : '') +
        '" data-dice="' + DICE[i] + '">d' + DICE[i] + '</button>';
    }
    row.innerHTML = html;
    html = '';
    for (i = 0; i < keys.length; i++) {
      html += '<button type="button" class="key" data-k="' + keys[i] + '">' + keys[i] + '</button>';
    }
    pad.innerHTML = html;
  }

  function preventZoom() {
    on(document, 'gesturestart', function (e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
    });
    on(document, 'touchmove', function (e) {
      var t = e.target;
      var scroll = closest(t, '.modal');
      if (!scroll && e.touches.length > 1 && e.preventDefault) {
        e.preventDefault();
      }
    });
    on(document, 'dblclick', function (e) {
      if (e.preventDefault) {
        e.preventDefault();
      }
    });
  }

  on(window, 'resize', function () {
    if (state.started && state.players.length) {
      layoutSeats();
      renderAll();
    }
  });

  on(window, 'orientationchange', function () {
    setTimeout(function () {
      if (state.started && state.players.length) {
        layoutSeats();
        renderAll();
      }
    }, 250);
  });

  on(document, 'webkitfullscreenchange', function () {
    if (!document.webkitFullscreenElement) {
      removeClass(document.body, 'is-fs');
      syncHub();
      relayoutSoon();
    }
  });
  on(document, 'fullscreenchange', function () {
    if (!document.fullscreenElement) {
      removeClass(document.body, 'is-fs');
      syncHub();
      relayoutSoon();
    }
  });

  on($('player-name'), 'change', function () {
    applyPlayerMenu();
    $('player-modal-title').innerHTML = escapeHtml(state.players[ui.editingIndex].name);
  });

  on($('player-partners'), 'change', function () {
    if (ui.editingIndex < 0) {
      return;
    }
    applyPlayerMenu();
    fillCmdList(ui.editingIndex);
  });

  on($('card-query'), 'keydown', function (e) {
    var key = e.keyCode || e.which;
    if (key === 13) {
      searchCard();
    }
  });

  on($('player-card-query'), 'keydown', function (e) {
    var key = e.keyCode || e.which;
    if (key === 13) {
      hideCardSuggest();
      searchPlayerBg();
    }
  });

  on($('player-card-query'), 'input', function () {
    scheduleCardSuggest();
  });

  on($('player-card-query'), 'keyup', function (e) {
    var key = e.keyCode || e.which;
    if (key === 13 || key === 37 || key === 38 || key === 39 || key === 40) {
      return;
    }
    scheduleCardSuggest();
  });

  on($('player-card-suggest'), 'touchstart', function (e) {
    if (closest(e.target, '[data-suggest-i]') && e.preventDefault) {
      e.preventDefault();
    }
  });

  buildStatic();
  preventZoom();
  bindPointer(document.body);

  if (load()) {
    syncCommanderMaps();
    ensureLayoutId(state.playerCount);
    refreshSetup();
  } else {
    state.playerCount = 4;
    state.startingLife = 40;
    state.layoutId = 'face';
    refreshSetup();
  }
})();
