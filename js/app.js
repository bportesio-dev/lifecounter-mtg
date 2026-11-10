(function () {
  'use strict';

  var STORAGE_KEY = 'mtgLifeCounter.v1';
  var COLORS = [
    '#10ffa0',
    '#3aa0ff',
    '#b845ff',
    '#ff2a5f',
    '#e8eef6',
    '#00f0ff',
    '#ffb000',
    '#ff6b9a',
    '#ff7a18',
    '#3dffe0'
  ];
  var LEGACY_COLORS = [
    '#1f7d3a',
    '#2a5c9e',
    '#6e38b0',
    '#c44738',
    '#c4b896',
    '#1a7a7a',
    '#8a5a1a',
    '#7a3aad',
    '#8a1a5a',
    '#3a6b8a'
  ];
  var COLOR_NAMES = ['Verde', 'Azul', 'Purpura', 'Rojo', 'Blanco', 'Cian', 'Amarillo', 'Rosa', 'Naranja', 'Teal'];
  var COUNTERS = [
    { key: 'poison', label: 'Veneno', lethal: 10 },
    { key: 'tax', label: 'Impuesto de comandante', lethal: 0 },
    { key: 'energy', label: 'Energia', lethal: 0 },
    { key: 'experience', label: 'Experiencia', lethal: 0 },
    { key: 'charge', label: 'Carga', lethal: 0 }
  ];
  var STAT_ICONS = [
    { key: 'tax', src: 'assets/commander.png', tone: 'ink' },
    { key: 'poison', src: 'assets/poison.png', tone: 'ink' },
    { key: 'energy', src: 'assets/energy.svg', tone: 'ink' },
    { key: 'experience', src: 'assets/experience.png', tone: 'ink' },
    { key: 'charge', src: 'assets/charge.svg', tone: 'ink' }
  ];
  var DICE = [4, 6, 8, 10, 12, 20];

  var state = {
    playerCount: 4,
    startingLife: 40,
    layoutId: 'face',
    players: [],
    turn: 1,
    active: 0,
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
    history: [],
    strikeFrom: -1,
    strikeTo: -1,
    strikeAmount: 0,
    strikeCmd: 0,
    strikeCmdB: 0,
    hadWinner: false
  };

  var timerId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function on(el, ev, fn) {
    el.addEventListener(ev, fn, false);
  }

  function onTouchMove(el, fn) {
    try {
      el.addEventListener('touchmove', fn, { passive: false });
    } catch (err) {
      el.addEventListener('touchmove', fn, false);
    }
  }

  function classText(el) {
    if (typeof el.className === 'string') {
      return el.className;
    }
    if (el.className && typeof el.className.baseVal === 'string') {
      return el.className.baseVal;
    }
    return el.getAttribute('class') || '';
  }

  function setClassText(el, value) {
    if (typeof el.className === 'string') {
      el.className = value;
      return;
    }
    if (el.className && typeof el.className.baseVal === 'string') {
      el.className.baseVal = value;
      return;
    }
    el.setAttribute('class', value);
  }

  function hasClass(el, name) {
    return (' ' + classText(el) + ' ').indexOf(' ' + name + ' ') !== -1;
  }

  function addClass(el, name) {
    var current;
    if (!hasClass(el, name)) {
      current = classText(el);
      setClassText(el, current ? current + ' ' + name : name);
    }
  }

  function removeClass(el, name) {
    setClassText(el, (' ' + classText(el) + ' ').replace(' ' + name + ' ', ' ').replace(/^ | $/g, ''));
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

  function lifeText(n) {
    var sign = '';
    var abs;
    n = parseInt(n, 10);
    if (isNaN(n)) {
      n = 0;
    }
    if (n < 0) {
      sign = '-';
    }
    abs = Math.abs(n);
    return sign + (abs < 10 ? '0' + abs : '' + abs);
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
      state.active = typeof data.active === 'number' ? data.active : 0;
      state.timerSeconds = data.timerSeconds || 0;
      state.timerRunning = false;
      state.planeName = data.planeName || '';
      state.started = !!data.started;
      state.lifeByTurn = data.lifeByTurn || [];
      state.damageLog = data.damageLog || [];
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
      charge: 0
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

  function hexParts(color) {
    var h = String(color || '').replace('#', '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (h.length !== 6) {
      return { r: 252, g: 84, b: 72 };
    }
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  function isRedColor(color) {
    return String(color || '').toLowerCase() === '#fc5448';
  }

  function accentOf(color) {
    if (isRedColor(color)) {
      return '#f75049';
    }
    return color || '#e7e9ee';
  }

  function toneIndex(color) {
    var i;
    var c = String(color || '').toLowerCase();
    for (i = 0; i < COLORS.length; i++) {
      if (c === COLORS[i].toLowerCase()) {
        return i;
      }
    }
    return -1;
  }

  function clearTone(seat) {
    var i;
    for (i = 0; i < COLORS.length; i++) {
      removeClass(seat, 'tone-c' + i);
    }
  }

  function paintSeat(seat, panel, color, active) {
    var p = hexParts(color);
    var idx = toneIndex(color);
    var frame = seat.getElementsByClassName('seat-frame')[0];
    var alpha = active ? '0.88' : '0.42';
    var glow = active ? '0.18' : '0.08';
    var width = active ? '2px' : '1px';
    clearTone(seat);
    toggleClass(seat, 'ink-dark', false);
    if (idx !== -1) {
      addClass(seat, 'tone-c' + idx);
    }
    seat.style.setProperty('--seat-accent', color || '#00f0ff');
    seat.style.setProperty('--seat-rgb', p.r + ',' + p.g + ',' + p.b);
    panel.style.backgroundColor = '#0c101a';
    panel.style.border = width + ' solid rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + alpha + ')';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = 'inset 0 0 30px rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + glow + '), 0 0 16px rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (active ? '0.28' : '0.12') + ')';
    seat.style.backgroundColor = 'transparent';
    seat.style.webkitBoxShadow = 'none';
    seat.style.boxShadow = 'none';
    if (frame) {
      frame.style.backgroundColor = 'transparent';
      frame.style.webkitFilter = 'none';
      frame.style.filter = 'none';
    }
  }

  function fixPlayerColors() {
    var i;
    var j;
    var changed = false;
    var current;
    if (!state.players) {
      return;
    }
    for (i = 0; i < state.players.length; i++) {
      current = String(state.players[i].color || '').toLowerCase();
      for (j = 0; j < LEGACY_COLORS.length; j++) {
        if (current === LEGACY_COLORS[j]) {
          state.players[i].color = COLORS[j];
          changed = true;
          current = COLORS[j].toLowerCase();
          break;
        }
      }
      if (current === '#18f084') {
        state.players[i].color = COLORS[0];
        changed = true;
        current = COLORS[0].toLowerCase();
      }
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
      eliminated: false,
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

  function cmdAmount(p, key) {
    var n = Number(p && p.cmd ? p.cmd[key] : 0);
    if (isNaN(n) || n < 0) {
      return 0;
    }
    return n;
  }

  function commanderLethal(p) {
    var i;
    var j;
    var src;
    if (!p || !state.players) {
      return false;
    }
    for (i = 0; i < state.players.length; i++) {
      if (state.players[i] !== p) {
        continue;
      }
      for (j = 0; j < state.players.length; j++) {
        if (i === j) {
          continue;
        }
        src = state.players[j];
        if (cmdAmount(p, src.id) >= 21) {
          return true;
        }
        if (src.partners && cmdAmount(p, src.id + 'b') >= 21) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  function lifeAmount(p) {
    var n = Number(p && p.life);
    if (isNaN(n)) {
      return 0;
    }
    return n;
  }

  function rulesLoss(p) {
    return lifeAmount(p) <= 0 || commanderLethal(p) || !!(p.counters && Number(p.counters.poison) >= 10);
  }

  function isOut(p) {
    return showLost(p);
  }

  function showLost(p) {
    if (lifeAmount(p) > 0 && !commanderLethal(p)) {
      return !!(p.counters && Number(p.counters.poison) >= 10) || !!p.eliminated;
    }
    return true;
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
    noteLife();
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
    var rank;
    var text;
    if (!list || !list.length) {
      return '';
    }
    for (i = list.length - 1; i >= 0; i--) {
      n = list[i];
      rank = list.length - 1 - i;
      text = (n > 0 ? '+' : '') + lifeText(n);
      html += '<span class="hist-item hist-z' + rank + ' ' + (n < 0 ? 'hist-down' : 'hist-up') + '">' + text + '</span>';
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

  function turnRing() {
    var n;
    var order = [];
    var i;
    var face4;
    if (!state.players || !state.players.length) {
      return order;
    }
    n = state.players.length;
    if (n === 4 && state.layoutId !== 'table') {
      face4 = [0, 2, 3, 1];
      for (i = 0; i < face4.length; i++) {
        order.push(face4[i]);
      }
      return order;
    }
    order.push(0);
    for (i = n - 1; i >= 1; i--) {
      order.push(i);
    }
    return order;
  }

  function nextAlive(from, dir) {
    var order = turnRing();
    var n = order.length;
    var pos = 0;
    var i;
    var at;
    var idx;
    if (!n) {
      return 0;
    }
    for (i = 0; i < n; i++) {
      if (order[i] === from) {
        pos = i;
        break;
      }
    }
    dir = dir < 0 ? -1 : 1;
    for (i = 1; i <= n; i++) {
      at = pos + dir * i;
      at = ((at % n) + n) % n;
      idx = order[at];
      if (state.players[idx] && !isOut(state.players[idx])) {
        return idx;
      }
    }
    return from;
  }

  function ensureActive() {
    var n;
    if (!state.players || !state.players.length) {
      state.active = 0;
      return;
    }
    n = state.players.length;
    if (typeof state.active !== 'number' || isNaN(state.active) || state.active < 0 || state.active >= n) {
      state.active = 0;
    }
    if (isOut(state.players[state.active])) {
      state.active = nextAlive(state.active, 1);
    }
  }

  function advanceTurn(dir) {
    if (!state.started || !state.players || !state.players.length) {
      return;
    }
    ensureActive();
    if (dir < 0) {
      if (state.turn > 1) {
        state.turn -= 1;
      }
      state.active = nextAlive(state.active, -1);
    } else {
      noteLife();
      state.active = nextAlive(state.active, 1);
      state.turn += 1;
      noteLife();
    }
    save();
    renderAll();
  }

  function openFirstPicker() {
    var html = '';
    var i;
    var p;
    html = '<button type="button" class="first-player random" data-act="first-random">Aleatorio</button>';
    for (i = 0; i < state.players.length; i++) {
      p = state.players[i];
      html += '<button type="button" class="first-player" data-act="first-player" data-player="' + i + '">' +
        '<span class="first-swatch" style="background:' + p.color + '"></span>' +
        escapeHtml(p.name) + '</button>';
    }
    $('first-row').innerHTML = html;
    openOverlay('overlay-first');
  }

  function startGame(count, life) {
    var i;
    if (count > 6) {
      count = 6;
    }
    if (count < 2) {
      count = 2;
    }
    state.playerCount = count;
    state.startingLife = life;
    state.players = [];
    for (i = 0; i < count; i++) {
      state.players.push(makePlayer(i, life));
    }
    state.turn = 1;
    state.active = 0;
    state.timerSeconds = 0;
    state.timerRunning = false;
    state.planeName = '';
    state.started = true;
    state.lifeByTurn = [];
    state.damageLog = [];
    ui.hadWinner = false;
    clearDeltas();
    stopTimer(true);
    syncCommanderMaps();
    noteLife();
    save();
    closeOverlay('overlay-setup');
    buildSeats();
    renderToolbar();
    renderAll();
    openFirstPicker();
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
        { id: 'table', name: 'Alrededor', desc: 'Tres lados de la mesa' }
      ];
    }
    if (n === 4) {
      return [
        { id: 'face', name: 'Enfrentados', desc: 'Dos de cada lado de la mesa' },
        { id: 'table', name: 'Alrededor', desc: 'Un jugador por lado' },
        { id: 'same', name: 'Misma vista', desc: 'Filas sin girar' }
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
    var gap = 6;
    var id = layoutId || 'face';
    var around;
    var rotsTable = { n: 180, e: 270, s: 0, w: 90 };

    if (id === 'sides' && n === 2) {
      return layoutBands(W, H, gap, { north: [], south: [], west: [0], east: [1] }, { n: 0, e: 270, s: 0, w: 90 });
    }
    if (id === 'same' && n === 2) {
      return fillRows(W, H, gap, [{ ids: [0, 1], rot: 0 }]);
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
    if (id === 'same' && n === 4) {
      return fillRows(W, H, gap, [
        { ids: [2, 3], rot: 0 },
        { ids: [0, 1], rot: 0 }
      ]);
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
    var frame = seat.getElementsByClassName('seat-frame')[0];
    var rot = box.rot || 0;
    var cx = box.x + box.w / 2;
    var onRight = boardW && cx > boardW / 2 + 1;
    var onLeft = boardW && cx < boardW / 2 - 1;
    var menuRight = false;
    var edge = 0;
    var fw;
    var fh;
    var pw;
    var ph;
    var spin;
    seat.style.left = box.x + 'px';
    seat.style.top = box.y + 'px';
    seat.style.width = box.w + 'px';
    seat.style.height = box.h + 'px';
    if (rot === 90 || rot === 270) {
      fw = box.h;
      fh = box.w;
    } else {
      fw = box.w;
      fh = box.h;
    }
    pw = fw - edge * 2;
    ph = fh - edge * 2;
    if (frame) {
      frame.style.width = fw + 'px';
      frame.style.height = fh + 'px';
      frame.style.left = ((box.w - fw) / 2) + 'px';
      frame.style.top = ((box.h - fh) / 2) + 'px';
      frame.style.webkitClipPath = 'none';
      frame.style.clipPath = 'none';
    }
    panel.style.width = pw + 'px';
    panel.style.height = ph + 'px';
    panel.style.left = ((box.w - pw) / 2) + 'px';
    panel.style.top = ((box.h - ph) / 2) + 'px';
    panel.style.webkitClipPath = 'none';
    panel.style.clipPath = 'none';
    if (onRight) {
      menuRight = rot !== 180;
    } else if (onLeft) {
      menuRight = rot === 180;
    }
    toggleClass(seat, 'menu-right', menuRight);
    toggleClass(seat, 'hist-right', seat.getAttribute('data-index') === '1' || seat.getAttribute('data-index') === '2');
    if (rot === 180) {
      spin = 'rotate(180deg)';
      addClass(panel, 'rot-180');
      if (frame) {
        addClass(frame, 'rot-180');
      }
    } else if (rot) {
      spin = 'rotate(' + rot + 'deg)';
      removeClass(panel, 'rot-180');
      if (frame) {
        removeClass(frame, 'rot-180');
      }
    } else {
      spin = 'none';
      removeClass(panel, 'rot-180');
      if (frame) {
        removeClass(frame, 'rot-180');
      }
    }
    panel.style.webkitTransform = spin;
    panel.style.transform = spin;
    if (frame) {
      frame.style.webkitTransform = spin;
      frame.style.transform = spin;
    }
    toggleClass(seat, 'is-flip', rot === 180);
    seat.setAttribute('data-rot', String(rot));
  }

  function createSeat(index) {
    var seat = document.createElement('div');
    var frame = document.createElement('div');
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
    var nextBtn = document.createElement('button');
    var integrity = document.createElement('div');
    var integrityTrack = document.createElement('div');
    var integrityFill = document.createElement('div');
    var integrityLabel = document.createElement('span');

    seat.className = 'seat';
    seat.setAttribute('data-index', String(index));
    frame.className = 'seat-frame';
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
    integrity.className = 'integrity';
    integrityTrack.className = 'integrity-track';
    integrityFill.className = 'integrity-fill';
    integrityLabel.className = 'integrity-label';
    integrityTrack.appendChild(integrityFill);
    integrity.appendChild(integrityTrack);
    integrity.appendChild(integrityLabel);
    cmdRow.className = 'cmd-row';
    artImg.className = 'panel-art';
    artImg.alt = '';
    artImg.setAttribute('referrerpolicy', 'no-referrer');
    shade.className = 'panel-shade';
    dead.className = 'dead-mask';
    nextBtn.type = 'button';
    nextBtn.className = 'btn-next';
    nextBtn.setAttribute('data-act', 'turn-next');
    nextBtn.innerHTML = 'Siguiente';
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
    hud.appendChild(integrity);
    hud.appendChild(bot);
    panel.appendChild(artImg);
    panel.appendChild(shade);
    panel.appendChild(hitM);
    panel.appendChild(hitP);
    panel.appendChild(hud);
    panel.appendChild(dead);
    panel.appendChild(cmdRow);
    panel.appendChild(nextBtn);
    seat.appendChild(frame);
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
      if (b.w < W * 0.7 && !(b.x < cx - hw && right > cx + hw)) {
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
      bottom = b.y + b.h;
      if (b.h < H * 0.7 && !(b.y < cy - hh && bottom > cy + hh)) {
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
    var who = 'Turno';
    $('turn-label').innerHTML = String(state.turn);
    if (state.players && state.players[state.active]) {
      who = state.players[state.active].name;
    }
    if ($('turn-who')) {
      $('turn-who').innerHTML = escapeHtml(who);
    }
    $('timer-label').innerHTML = formatTime(state.timerSeconds);
    $('btn-timer').innerHTML = state.timerRunning ? '&#10073;&#10073;' : '&#9654;';
  }

  function isStatCounter(key) {
    var i;
    for (i = 0; i < STAT_ICONS.length; i++) {
      if (STAT_ICONS[i].key === key) {
        return true;
      }
    }
    return false;
  }

  function counterLethal(key) {
    var i;
    for (i = 0; i < COUNTERS.length; i++) {
      if (COUNTERS[i].key === key) {
        return COUNTERS[i].lethal;
      }
    }
    return 0;
  }

  function chipsHtml(p) {
    var html = '';
    var i;
    var c;
    var val;
    for (i = 0; i < COUNTERS.length; i++) {
      c = COUNTERS[i];
      if (isStatCounter(c.key)) {
        continue;
      }
      val = p.counters[c.key] || 0;
      if (val) {
        html += '<span class="chip' + (c.lethal && val >= c.lethal ? ' danger' : '') + '">' +
          c.label.split(' ')[0] + ' ' + val + '</span>';
      }
    }
    return html;
  }

  function statIconsHtml(p) {
    var html = '';
    var i;
    var spec;
    var val;
    var lethal;
    for (i = 0; i < STAT_ICONS.length; i++) {
      spec = STAT_ICONS[i];
      val = p.counters[spec.key] || 0;
      if (val <= 0) {
        continue;
      }
      lethal = counterLethal(spec.key);
      html += '<span class="stat-chip' + (lethal && val >= lethal ? ' danger' : '') + '">' +
        '<img class="stat-icon ' + spec.tone + (spec.key === 'tax' || spec.key === 'poison' ? ' lg' : '') +
        '" src="' + spec.src + '" alt="">' +
        '<span class="stat-n">' + val + '</span></span>';
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
    var accent;
    if (p.view > 0) {
      html += '<button type="button" class="cmd-back" data-act="cmd-back">Volver</button>';
    }
    for (i = 1; i < views.length; i++) {
      v = views[i];
      src = state.players[v.src];
      val = p.cmd[v.key] || 0;
      accent = val >= 21 ? '#f75049' : accentOf(src.color);
      html += '<button type="button" class="cmd-badge' +
        (p.view === i ? ' active' : '') +
        (val >= 21 ? ' lethal' : '') +
        '" data-act="cmd-src" data-view="' + i + '">' +
        '<span class="cmd-dot" style="background:' + accent + ';box-shadow:0 0 8px ' + accent + '"></span>' +
        (src.partners ? '<span class="cmd-mark" style="color:' + accent + ';text-shadow:0 0 6px ' + accent + '">' + (v.partner ? '2' : '1') + '</span>' : '') +
        '<span class="cmd-badge-n" style="color:' + accent + ';text-shadow:0 0 6px ' + accent + '">' + val + '</span></button>';
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
    var frame = seat.getElementsByClassName('seat-frame')[0];
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
    var htmlBadges;
    var htmlStats;
    var integrityEl;
    var integrityFill;
    var integrityLabel;
    var startLife;
    var pctLife;
    var barLife;
    var overLife;
    var pending;
    var nextLife;

    paintSeat(seat, panel, (v.type === 'cmd' && state.players[v.src]) ? state.players[v.src].color : p.color, index === state.active);
    panel.style.backgroundImage = '';
    panel.style.backgroundSize = '';
    if (v.type !== 'cmd' && p.bgArt && artEl) {
      src = toArtCrop(p.bgArt);
      artEl.setAttribute('referrerpolicy', 'no-referrer');
      if (p.bgCdn) {
        artEl.setAttribute('data-cdn', toArtCrop(p.bgCdn));
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
    htmlBadges = cmdBadgesHtml(index);
    htmlStats = statIconsHtml(p);
    if (htmlBadges || htmlStats) {
      cmdRow.innerHTML = '<div class="cmd-bar">' +
        (htmlBadges ? '<div class="cmd-line">' + htmlBadges + '</div>' : '') +
        (htmlStats ? '<div class="stat-line">' + htmlStats + '</div>' : '') +
        '</div>';
    } else {
      cmdRow.innerHTML = '';
    }
    toggleClass(seat, 'has-stats', !!htmlStats);

    if (v.type === 'life') {
      value = p.life;
      label = '';
      removeClass(panel, 'cmd-mode');
    } else {
      value = p.cmd[v.key] || 0;
      label = 'Daño comandante ' + escapeHtml(String(v.label || '').replace(/^Jugador/i, 'jugador'));
      addClass(panel, 'cmd-mode');
    }
    pending = v.type === 'life' && ui.strikeTo === index && hasClass($('overlay-strike'), 'is-open') && strikeLifeDelta() !== 0;
    toggleClass(seat, 'strike-pending', pending);
    if (pending) {
      nextLife = p.life - strikeLifeDelta();
      lifeEl.innerHTML = '<span class="life-old">' + lifeText(p.life) + '</span><span class="life-next">' + lifeText(nextLife) + '</span>';
    } else {
      lifeEl.innerHTML = lifeText(value);
    }
    caption.innerHTML = label;
    integrityEl = seat.getElementsByClassName('integrity')[0];
    integrityFill = seat.getElementsByClassName('integrity-fill')[0];
    integrityLabel = seat.getElementsByClassName('integrity-label')[0];
    if (integrityEl && integrityFill && integrityLabel) {
      if (v.type === 'life') {
        startLife = state.startingLife || 40;
        pctLife = startLife ? Math.round((p.life / startLife) * 100) : 100;
        barLife = pctLife;
        overLife = p.life - startLife;
        if (barLife < 0) {
          barLife = 0;
        }
        if (barLife > 100) {
          barLife = 100;
        }
        if (pending) {
          barLife = startLife ? Math.round((nextLife / startLife) * 100) : barLife;
          if (barLife < 0) {
            barLife = 0;
          }
          if (barLife > 100) {
            barLife = 100;
          }
        }
        integrityFill.style.width = barLife + '%';
        if (pending) {
          integrityLabel.innerHTML = 'DAÑO INMINENTE // ' + strikePendingLabel();
        } else if (overLife > 0) {
          integrityLabel.innerHTML = 'OVERCLOCKED // +' + overLife;
        } else {
          integrityLabel.innerHTML = 'INTEGRITY // ' + pctLife + '%';
        }
        removeClass(integrityEl, 'hidden');
      } else {
        addClass(integrityEl, 'hidden');
      }
    }
    deltaKey = v.type === 'life' ? 'life' : v.key;
    slot = ui.deltas[index];
    if (deltaEl) {
      if (slot && slot.value && slot.key === deltaKey) {
        deltaEl.innerHTML = (slot.value > 0 ? '+' : '') + lifeText(slot.value);
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
      if (frame) {
        addClass(frame, 'rot-180');
        frame.style.webkitTransform = 'rotate(180deg)';
        frame.style.transform = 'rotate(180deg)';
      }
    }

    boxW = seat.clientWidth;
    toggleClass(seat, 'tight', boxW < 260);
    if (boxW < 220) {
      addClass(lifeEl, 'small');
    } else {
      removeClass(lifeEl, 'small');
    }
    toggleClass(dead, 'show', showLost(p));
    toggleClass(seat, 'is-turn', index === state.active);
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
      if (!isOut(state.players[i])) {
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
    ensureActive();
    for (i = 0; i < state.players.length; i++) {
      updateSeat(i);
    }
    renderToolbar();
    syncHub();
    w = winnerName();
    if (state.started && state.players.length > 1 && w) {
      removeClass(banner, 'hidden');
      $('winner-text').innerHTML = 'Ganador: ' + escapeHtml(w);
      if (!ui.hadWinner) {
        ui.hadWinner = true;
        openLifeChart();
      }
    } else {
      addClass(banner, 'hidden');
      ui.hadWinner = false;
    }
  }

  function changeCurrent(index, dir) {
    var p = state.players[index];
    var views = viewList(index);
    var v = views[p.view] || views[0];
    var applied = dir;
    if (v.type === 'life') {
      p.life += dir;
      noteLife();
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
    $('btn-kill').innerHTML = isOut(p) ? 'Revivir' : 'Eliminar jugador';
    fillPlayerCardUi(p);
    openOverlay('overlay-player');
  }

  function fillPlayerCardUi(p) {
    $('player-card-query').value = p.bgCard || '';
    hideCardSuggest();
    if (p.bgArt) {
      $('player-card-status').innerHTML = escapeHtml(p.bgCard || 'Fondo activo');
      $('player-card-preview').innerHTML = '<div class="bg-preview"><img src="' + toArtCrop(p.bgArt) + '" alt="" referrerpolicy="no-referrer"></div>';
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

  function toArtCrop(url) {
    var s = String(url || '');
    if (!s) {
      return '';
    }
    s = s.replace(/\/(small|normal|large|png|border_crop)\//, '/art_crop/');
    s = s.replace(/version=(small|normal|large|png|border_crop)/, 'version=art_crop');
    return s;
  }

  function cardArtUrl(card) {
    var face;
    if (card.image_uris) {
      return card.image_uris.art_crop || card.image_uris.normal || card.image_uris.large || card.image_uris.small || '';
    }
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
      face = card.card_faces[0].image_uris;
      return face.art_crop || face.normal || face.large || face.small || '';
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
      art = cardApiImageUrl(card, 'art_crop') || cardArtUrl(card);
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
      noteLife();
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

  function commanderControlAt(x, y) {
    var bars = document.getElementsByClassName('cmd-bar');
    var top;
    var i;
    var j;
    var bar;
    var r;
    var buttons;
    var b;
    var best;
    var bestD;
    var cx;
    var cy;
    var d;
    top = document.elementFromPoint(x, y);
    if (top && closest(top, '.overlay')) {
      return null;
    }
    for (i = 0; i < bars.length; i++) {
      bar = bars[i];
      r = bar.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
        continue;
      }
      buttons = bar.getElementsByTagName('button');
      best = null;
      bestD = 0;
      for (j = 0; j < buttons.length; j++) {
        b = buttons[j];
        r = b.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
          continue;
        }
        cx = (r.left + r.right) / 2;
        cy = (r.top + r.bottom) / 2;
        d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (!best || d < bestD) {
          best = b;
          bestD = d;
        }
      }
      return best || bar;
    }
    return null;
  }

  function lifeSnapshot() {
    var out = [];
    var i;
    for (i = 0; i < state.players.length; i++) {
      out.push(state.players[i].life);
    }
    return out;
  }

  function noteLife() {
    var turn;
    if (!state.started || !state.players || !state.players.length) {
      return;
    }
    if (!state.lifeByTurn) {
      state.lifeByTurn = [];
    }
    turn = state.turn || 1;
    while (state.lifeByTurn.length < turn) {
      state.lifeByTurn.push(lifeSnapshot());
    }
    state.lifeByTurn[turn - 1] = lifeSnapshot();
  }

  function seatCenter(index) {
    var board = $('board');
    var seat = board.getElementsByClassName('seat')[index];
    var b;
    var r;
    if (!seat) {
      return null;
    }
    b = board.getBoundingClientRect();
    r = seat.getBoundingClientRect();
    return {
      x: r.left - b.left + r.width / 2,
      y: r.top - b.top + r.height / 2
    };
  }

  function seatAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    var seat;
    if (!el) {
      return -1;
    }
    seat = closest(el, '.seat');
    if (!seat || closest(el, '.overlay')) {
      return -1;
    }
    return parseInt(seat.getAttribute('data-index'), 10);
  }

  function markStrikeTarget(fromIndex, toIndex) {
    var seats = $('board').getElementsByClassName('seat');
    var i;
    var dragging = fromIndex >= 0;
    var locked = dragging && toIndex >= 0 && toIndex !== fromIndex;
    for (i = 0; i < seats.length; i++) {
      toggleClass(seats[i], 'strike-source', dragging && i === fromIndex);
      toggleClass(seats[i], 'strike-target', locked && i === toIndex);
      toggleClass(seats[i], 'strike-dim', dragging && i !== fromIndex && !(locked && i === toIndex));
    }
  }

  function hideArrow() {
    var badge = $('drag-badge');
    var reticle = $('drag-reticle');
    sfxDragEnd();
    removeClass($('drag-arrow'), 'show');
    if (badge) {
      removeClass(badge, 'show');
    }
  if (reticle) {
    reticle.setAttribute('display', 'none');
    reticle.style.display = 'none';
  }
    markStrikeTarget(-1, -1);
  }

  function clampNum(n, min, max) {
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }

  function showArrow(x1, y1, x2, y2, tx, ty, fromColor, toColor, locked, fromIndex, toIndex) {
    var svg = $('drag-arrow');
    var board = $('board');
    var grad = $('laser-grad');
    var source = $('drag-source');
    var reticle = $('drag-reticle');
    var badge = $('drag-badge');
    var ring = $('drag-source-ring');
    var core = $('drag-source-core');
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux;
    var uy;
    var mx;
    var my;
    var fromPlayer;
    var toPlayer;
    if (!svg || len < 8) {
      return;
    }
    ux = dx / len;
    uy = dy / len;
    svg.setAttribute('width', String(board.clientWidth));
    svg.setAttribute('height', String(board.clientHeight));
    svg.style.width = board.clientWidth + 'px';
    svg.style.height = board.clientHeight + 'px';
    if (grad) {
      grad.setAttribute('x1', String(x1));
      grad.setAttribute('y1', String(y1));
      grad.setAttribute('x2', String(x2));
      grad.setAttribute('y2', String(y2));
    }
    if ($('laser-stop-0')) {
      $('laser-stop-0').setAttribute('stop-color', fromColor);
    }
    if ($('laser-stop-2')) {
      $('laser-stop-2').setAttribute('stop-color', locked ? toColor : '#00f0ff');
    }
    $('drag-arrow-shadow').setAttribute('x1', String(x1));
    $('drag-arrow-shadow').setAttribute('y1', String(y1));
    $('drag-arrow-shadow').setAttribute('x2', String(x2));
    $('drag-arrow-shadow').setAttribute('y2', String(y2));
    $('drag-arrow-line').setAttribute('x1', String(x1));
    $('drag-arrow-line').setAttribute('y1', String(y1));
    $('drag-arrow-line').setAttribute('x2', String(x2));
    $('drag-arrow-line').setAttribute('y2', String(y2));
    if (source) {
      source.setAttribute('transform', 'translate(' + x1 + ' ' + y1 + ')');
    }
    if (ring) {
      ring.setAttribute('stroke', fromColor);
    }
    if (core) {
      core.setAttribute('fill', fromColor);
    }
    if (reticle) {
      if (locked) {
        reticle.setAttribute('transform', 'translate(' + tx + ' ' + ty + ')');
        reticle.removeAttribute('display');
        reticle.style.display = '';
      } else {
        reticle.setAttribute('display', 'none');
        reticle.style.display = 'none';
      }
    }
    if (badge) {
      if (locked) {
        mx = (x1 + tx) / 2 - uy * 36;
        my = (y1 + ty) / 2 + ux * 36;
        mx = clampNum(mx, 120, board.clientWidth - 120);
        my = clampNum(my, 46, board.clientHeight - 46);
        fromPlayer = state.players[fromIndex];
        toPlayer = state.players[toIndex];
        $('drag-from-name').innerHTML = escapeHtml(fromPlayer ? fromPlayer.name : '');
        $('drag-from-name').style.color = fromColor;
        $('drag-to-name').innerHTML = escapeHtml(toPlayer ? toPlayer.name : '');
        $('drag-to-name').style.color = toColor;
        badge.style.left = mx + 'px';
        badge.style.top = my + 'px';
        addClass(badge, 'show');
      } else {
        removeClass(badge, 'show');
      }
    }
    addClass(svg, 'show');
  }

  function updateDragArrow(fromIndex, clientX, clientY, toIndex) {
    var from = seatCenter(fromIndex);
    var board;
    var to = null;
    var locked;
    var x2;
    var y2;
    var tx = 0;
    var ty = 0;
    var dx;
    var dy;
    var len;
    var x1;
    var y1;
    var fromColor;
    var toColor;
    if (!from) {
      return;
    }
    board = $('board').getBoundingClientRect();
    locked = toIndex >= 0 && toIndex !== fromIndex;
    fromColor = (state.players[fromIndex] && state.players[fromIndex].color) || '#10ffa0';
    if (locked) {
      to = seatCenter(toIndex);
      if (!to) {
        locked = false;
      }
    }
    if (locked && to) {
      tx = to.x;
      ty = to.y;
      x2 = tx;
      y2 = ty;
      toColor = (state.players[toIndex] && state.players[toIndex].color) || '#ff2a5f';
      markStrikeTarget(fromIndex, toIndex);
    } else {
      x2 = clientX - board.left;
      y2 = clientY - board.top;
      toColor = '#00f0ff';
      locked = false;
      markStrikeTarget(fromIndex, -1);
    }
    dx = x2 - from.x;
    dy = y2 - from.y;
    len = Math.sqrt(dx * dx + dy * dy) || 1;
    x1 = from.x;
    y1 = from.y;
    if (len > 70) {
      x1 += dx / len * 28;
      y1 += dy / len * 28;
      if (locked) {
        x2 -= dx / len * 48;
        y2 -= dy / len * 48;
      }
    }
    sfxDragTarget(locked ? toIndex : -1);
    showArrow(x1, y1, x2, y2, tx, ty, fromColor, toColor, locked, fromIndex, toIndex);
  }

  function strikeLifeDelta() {
    var attacker = state.players[ui.strikeFrom];
    var delta = ui.strikeAmount || 0;
    delta += ui.strikeCmd || 0;
    if (attacker && attacker.partners) {
      delta += ui.strikeCmdB || 0;
    }
    return delta;
  }

  function strikePendingLabel() {
    var loss = strikeLifeDelta();
    var text = (loss > 0 ? '-' : loss < 0 ? '+' : '') + lifeText(Math.abs(loss)) + ' HP';
    return text;
  }

  function strikeHpText(amount) {
    var n = amount || 0;
    return (n > 0 ? '-' : '') + lifeText(n) + ' HP';
  }

  function paintCmdValue(el, value) {
    if (!el) {
      return;
    }
    el.innerHTML = strikeHpText(value || 0);
  }

  function paintStrikeReadout() {
    var target = ui.strikeTo;
    if ($('strike-value')) {
      $('strike-value').innerHTML = strikeHpText(ui.strikeAmount || 0);
    }
    paintCmdValue($('strike-cmd-value'), ui.strikeCmd || 0);
    paintCmdValue($('strike-cmd-b-value'), ui.strikeCmdB || 0);
    if (target >= 0 && state.players[target]) {
      updateSeat(target);
    }
  }

  function nudgeStrikeAmount(dir) {
    var next = (ui.strikeAmount || 0) + dir;
    if (next < 0) {
      next = 0;
    }
    if (next > 99) {
      next = 99;
    }
    if (next === ui.strikeAmount) {
      return;
    }
    ui.strikeAmount = next;
    sfxTick(dir > 0);
    paintStrikeReadout();
  }

  function nudgeStrikeCmd(field, dir) {
    var next = (ui[field] || 0) + dir;
    if (next < 0) {
      next = 0;
    }
    if (next > 99) {
      next = 99;
    }
    if (next === ui[field]) {
      return;
    }
    ui[field] = next;
    sfxTick(dir > 0);
    paintStrikeReadout();
  }

  function resetStrikeModal() {
    ui.strikeAmount = 0;
    ui.strikeCmd = 0;
    ui.strikeCmdB = 0;
    if ($('strike-value')) {
      $('strike-value').innerHTML = strikeHpText(0);
    }
    paintCmdValue($('strike-cmd-value'), 0);
    paintCmdValue($('strike-cmd-b-value'), 0);
  }

  function openStrike(fromIndex, toIndex) {
    var a = state.players[fromIndex];
    var b = state.players[toIndex];
    if (!a || !b) {
      return;
    }
    ui.strikeFrom = fromIndex;
    ui.strikeTo = toIndex;
    resetStrikeModal();
    syncCommanderMaps();
    if (a.partners) {
      removeClass($('strike-cmd-b'), 'hidden');
      $('strike-cmd-label').innerHTML = 'CMD 1';
      $('strike-cmd-b-label').innerHTML = 'CMD 2';
    } else {
      addClass($('strike-cmd-b'), 'hidden');
      $('strike-cmd-label').innerHTML = 'CMD';
    }
    $('strike-title').innerHTML = 'Enlace de combate táctico';
    $('strike-from').innerHTML = escapeHtml(a.name);
    $('strike-from').style.color = a.color || '#10ffa0';
    $('strike-to').innerHTML = escapeHtml(b.name);
    $('strike-to').style.color = b.color || '#ff2a5f';
    openOverlay('overlay-strike');
    paintStrikeReadout();
  }

  function applyStrike() {
    var defender;
    var attacker;
    var target = ui.strikeTo;
    var source = ui.strikeFrom;
    var amount = ui.strikeAmount || 0;
    var key;
    var keyB;
    var cmdDelta;
    var cmdDeltaB;
    if (target < 0 || !state.players[target] || source < 0 || !state.players[source]) {
      closeOverlay('overlay-strike');
      resetStrikeModal();
      return;
    }
    if (amount < 0) {
      amount = 0;
    }
    defender = state.players[target];
    attacker = state.players[source];
    if (!defender.cmd) {
      defender.cmd = {};
    }
    key = attacker.id;
    cmdDelta = ui.strikeCmd || 0;
    cmdDeltaB = 0;
    keyB = key + 'b';
    if (attacker.partners) {
      cmdDeltaB = ui.strikeCmdB || 0;
    }
    closeOverlay('overlay-strike');
    resetStrikeModal();
    ui.strikeFrom = -1;
    ui.strikeTo = -1;
    if (!amount && !cmdDelta && !cmdDeltaB) {
      updateSeat(target);
      return;
    }
    sfxImpact();
    defender.life -= amount + cmdDelta + cmdDeltaB;
    defender.cmd[key] = cmdAmount(defender, key) + cmdDelta;
    if (attacker.partners) {
      defender.cmd[keyB] = cmdAmount(defender, keyB) + cmdDeltaB;
    }
    if (amount > 0) {
      if (!state.damageLog) {
        state.damageLog = [];
      }
      state.damageLog.push({
        turn: state.turn || 1,
        from: source,
        to: target,
        amount: amount
      });
    }
    noteLife();
    save();
    if (amount) {
      bumpDelta(target, -amount, 'life');
    }
    if (cmdDelta) {
      bumpDelta(target, cmdDelta, key);
    }
    if (cmdDeltaB) {
      bumpDelta(target, cmdDeltaB, keyB);
    }
    renderAll();
  }

  function openLifeChart() {
    openOverlay('overlay-chart');
    renderLifeChart();
  }

  function renderLifeChart() {
    var turns = state.lifeByTurn || [];
    var players = state.players || [];
    var log = state.damageLog || [];
    var W = 560;
    var H = 280;
    var chartEl = $('life-chart');
    var availW;
    var availH;
    if (chartEl && chartEl.clientWidth > 40 && chartEl.clientHeight > 120) {
      availW = chartEl.clientWidth;
      availH = chartEl.clientHeight - 40;
      if (availH < 160) {
        availH = 160;
      }
      H = Math.round(W * availH / availW);
      if (H < 200) {
        H = 200;
      }
      if (H > 900) {
        H = 900;
      }
    }
    var padL = 34;
    var padR = 16;
    var padT = 18;
    var padB = 32;
    var nTurns = turns.length;
    var minL = 0;
    var maxL = state.startingLife || 40;
    var t;
    var p;
    var life;
    var span;
    var plotW;
    var plotH;
    var svg = '';
    var legend = '';
    var pts;
    var x;
    var y;
    var color;
    var received;
    var key;
    var i;
    var ev;
    var label;
    if (!nTurns || !players.length) {
      $('life-chart').innerHTML = '<p class="sub">Todavía no hay vida registrada.</p>';
      return;
    }
    for (t = 0; t < nTurns; t++) {
      if (!turns[t]) {
        continue;
      }
      for (p = 0; p < turns[t].length; p++) {
        life = turns[t][p];
        if (life < minL) {
          minL = life;
        }
        if (life > maxL) {
          maxL = life;
        }
      }
    }
    if (maxL === minL) {
      maxL = minL + 1;
    }
    span = maxL - minL;
    plotW = W - padL - padR;
    plotH = H - padT - padB;
    function chartX(index) {
      if (nTurns === 1) {
        return padL + plotW / 2;
      }
      return padL + plotW * index / (nTurns - 1);
    }
    function chartY(value) {
      return padT + plotH * (1 - (value - minL) / span);
    }
    svg += '<svg class="life-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#444" stroke-width="1"/>';
    svg += '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#444" stroke-width="1"/>';
    svg += '<text x="' + (padL - 6) + '" y="' + (chartY(maxL) + 4) + '" fill="#aaa" font-size="11" text-anchor="end">' + maxL + '</text>';
    svg += '<text x="' + (padL - 6) + '" y="' + (chartY(minL) + 4) + '" fill="#aaa" font-size="11" text-anchor="end">' + minL + '</text>';
    for (t = 0; t < nTurns; t++) {
      x = chartX(t);
      svg += '<text x="' + x + '" y="' + (H - 10) + '" fill="#aaa" font-size="11" text-anchor="middle">T' + (t + 1) + '</text>';
    }
    received = {};
    for (i = 0; i < log.length; i++) {
      ev = log[i];
      key = ev.turn + ':' + ev.to;
      received[key] = (received[key] || 0) + ev.amount;
    }
    for (p = 0; p < players.length; p++) {
      color = players[p].color || '#ccc';
      pts = '';
      for (t = 0; t < nTurns; t++) {
        if (!turns[t] || typeof turns[t][p] !== 'number') {
          continue;
        }
        pts += (pts ? ' ' : '') + chartX(t) + ',' + chartY(turns[t][p]);
      }
      if (pts) {
        svg += '<polyline fill="none" stroke="' + color + '" stroke-width="3" points="' + pts + '"/>';
      }
      for (t = 0; t < nTurns; t++) {
        if (!turns[t] || typeof turns[t][p] !== 'number') {
          continue;
        }
        x = chartX(t);
        y = chartY(turns[t][p]);
        svg += '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="' + color + '"/>';
        label = received[(t + 1) + ':' + p];
        if (label) {
          svg += '<text x="' + x + '" y="' + (y - 8) + '" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">-' + label + '</text>';
        }
      }
      legend += '<span class="chart-key"><span class="chart-swatch" style="background:' + color + '"></span>' +
        escapeHtml(players[p].name) + '</span>';
    }
    svg += '</svg>';
    $('life-chart').innerHTML = svg + '<div class="chart-legend">' + legend + '</div>';
  }

  var sfxAim = { src: 'assets/recarga.mp3', data: null, buf: null, decoding: false, pending: false, loading: false };
  var sfxShot = { src: 'assets/shoot.mp3', data: null, buf: null, decoding: false, pending: false, loading: false };
  var sfxCtx = null;
  var sfxLockIndex = -1;

  function sfxInit() {
    var Ctx;
    if (!sfxCtx) {
      Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        return null;
      }
      try {
        sfxCtx = new Ctx();
      } catch (err) {
        return null;
      }
    }
    if (sfxCtx.state === 'suspended' && sfxCtx.resume) {
      try {
        sfxCtx.resume();
      } catch (errResume) {}
    }
    return sfxCtx;
  }

  function sfxTick(up) {
    var ctx;
    var osc;
    var gain;
    try {
      ctx = sfxInit();
      if (!ctx) {
        return;
      }
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(up ? 900 : 500, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (err) {}
  }

  function sfxFetch(item) {
    var xhr;
    if (!item || item.loading || item.data || item.buf) {
      return;
    }
    item.loading = true;
    xhr = new XMLHttpRequest();
    xhr.open('GET', item.src, true);
    try {
      xhr.responseType = 'arraybuffer';
    } catch (errType) {}
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      item.loading = false;
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
        return;
      }
      if (!xhr.response) {
        return;
      }
      item.data = xhr.response;
      if (sfxCtx && (!sfxCtx.state || sfxCtx.state === 'running')) {
        sfxDecode(item);
      }
    };
    try {
      xhr.send(null);
    } catch (errSend) {
      item.loading = false;
    }
  }

  function sfxEnsure() {
    sfxFetch(sfxAim);
    sfxFetch(sfxShot);
  }

  function sfxDecode(item) {
    var ctx;
    var data;
    if (!item || item.buf || item.decoding || !item.data) {
      return;
    }
    ctx = sfxInit();
    if (!ctx || !ctx.decodeAudioData) {
      return;
    }
    item.decoding = true;
    try {
      data = item.data.slice ? item.data.slice(0) : item.data;
    } catch (errSlice) {
      data = item.data;
    }
    try {
      ctx.decodeAudioData(data, function (buf) {
        item.buf = buf;
        item.decoding = false;
        if (item.pending) {
          sfxPlayItem(item);
        }
      }, function () {
        item.decoding = false;
      });
    } catch (errDec) {
      item.decoding = false;
    }
  }

  function sfxUnlock() {
    sfxInit();
    sfxEnsure();
    sfxDecode(sfxAim);
    sfxDecode(sfxShot);
  }

  function sfxPlayItem(item) {
    var ctx;
    var src;
    var gain;
    if (!item) {
      return;
    }
    if (!item.buf) {
      item.pending = true;
      sfxUnlock();
      return;
    }
    item.pending = false;
    try {
      ctx = sfxInit();
      if (!ctx) {
        return;
      }
      src = ctx.createBufferSource();
      gain = ctx.createGain();
      src.buffer = item.buf;
      try {
        gain.gain.setValueAtTime(0.9, ctx.currentTime);
      } catch (errGain) {
        gain.gain.value = 0.9;
      }
      src.connect(gain);
      gain.connect(ctx.destination);
      if (src.start) {
        src.start(0);
      } else if (src.noteOn) {
        src.noteOn(0);
      }
    } catch (err) {}
  }

  function sfxPlay(item) {
    sfxPlayItem(item);
  }

  function sfxDragTarget(toIndex) {
    if (toIndex >= 0 && toIndex !== sfxLockIndex) {
      sfxLockIndex = toIndex;
      sfxEnsure();
      sfxPlay(sfxAim);
      return;
    }
    if (toIndex < 0) {
      sfxLockIndex = -1;
    }
  }

  function sfxDragEnd() {
    sfxLockIndex = -1;
  }

  function sfxImpact() {
    sfxEnsure();
    sfxPlay(sfxShot);
  }

  function sfxIsMinus(el) {
    var node;
    var dir;
    var text;
    var k;
    if (!el) {
      return false;
    }
    node = closest(el, '.hit') || closest(el, 'button') || closest(el, '.key') || el;
    if (!node || !node.getAttribute) {
      return false;
    }
    if (node.id && node.id.indexOf('minus') !== -1) {
      return true;
    }
    if (node.className && String(node.className).indexOf('step-down') !== -1) {
      return true;
    }
    if (node.getAttribute('data-act') === 'turn-prev') {
      return true;
    }
    dir = node.getAttribute('data-dir') || node.getAttribute('data-cdir') || node.getAttribute('data-cmddir');
    if (dir && parseInt(dir, 10) < 0) {
      return true;
    }
    k = node.getAttribute('data-k');
    if (k === '-') {
      return true;
    }
    text = (node.textContent || '').replace(/^\s+|\s+$/g, '');
    return text === '-' || text === '-1';
  }

  function sfxButton(el, act) {
    if (act && act.indexOf('strike-') === 0 && act !== 'strike-cancel') {
      return;
    }
    if (!act && !closest(el, 'button') && !closest(el, '.hit') && !closest(el, '.choice') && !closest(el, '.swatch') && !closest(el, '.key') && !closest(el, '.menu-item') && !closest(el, '.layout-card') && !closest(el, '.first-player') && !closest(el, '.suggest-item')) {
      return;
    }
    sfxTick(!sfxIsMinus(el));
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
    var dragFrom = -1;
    var strikeDrag = false;
    var mouseDown = false;

    function clearLong() {
      if (longTimer) {
        clearTimeout(longTimer);
        longTimer = null;
      }
    }

    function strikeHoldButton(el) {
      var btn = closest(el, 'button');
      var act;
      if (!btn || !closest(btn, '#overlay-strike')) {
        return null;
      }
      act = btn.getAttribute('data-act') || '';
      if (act === 'strike-minus' || act === 'strike-plus' || act === 'strike-cmd-minus' || act === 'strike-cmd-plus' || act === 'strike-cmd-b-minus' || act === 'strike-cmd-b-plus') {
        return btn;
      }
      return null;
    }

    function armHold(el) {
      pressHit(el, true);
      longTimer = setTimeout(function () {
        longFired = true;
        pressHit(null, false);
        handleTap(el, true);
        ui.suppressClick = true;
      }, 420);
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

    function dragSourceIndex(el) {
      if (!state.started || !el) {
        return -1;
      }
      if (closest(el, '.overlay') || closest(el, 'button') || closest(el, '.cmd-bar')) {
        return -1;
      }
      return seatIndexFrom(el);
    }

    function trackDrag(clientX, clientY) {
      var to;
      if (dragFrom < 0) {
        return;
      }
      to = seatAtPoint(clientX, clientY);
      if (isNaN(to)) {
        to = -1;
      }
      if (to >= 0 && to !== dragFrom) {
        strikeDrag = true;
      }
      updateDragArrow(dragFrom, clientX, clientY, to);
    }

    function finishDrag(clientX, clientY) {
      var to;
      var from;
      if (!strikeDrag) {
        hideArrow();
        dragFrom = -1;
        return false;
      }
      from = dragFrom;
      to = seatAtPoint(clientX, clientY);
      hideArrow();
      strikeDrag = false;
      dragFrom = -1;
      if (to >= 0 && to !== from) {
        openStrike(from, to);
      }
      return true;
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
        if (overlay.id === 'overlay-setup' || overlay.id === 'overlay-first') {
          return;
        }
        if (overlay.id === 'overlay-strike') {
          cancelTarget = ui.strikeTo;
          closeOverlay('overlay-strike');
          resetStrikeModal();
          ui.strikeFrom = -1;
          ui.strikeTo = -1;
          if (cancelTarget >= 0 && state.players[cancelTarget]) {
            updateSeat(cancelTarget);
          }
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

      sfxButton(el, act || '');

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
      if (act === 'first-random') {
        state.active = Math.floor(Math.random() * state.players.length);
        save();
        closeOverlay('overlay-first');
        renderAll();
        return;
      }
      if (act === 'first-player') {
        state.active = parseInt(el.getAttribute('data-player'), 10);
        if (isNaN(state.active)) {
          state.active = 0;
        }
        save();
        closeOverlay('overlay-first');
        renderAll();
        return;
      }
      if (act === 'turn-prev') {
        advanceTurn(-1);
        return;
      }
      if (act === 'turn-next') {
        advanceTurn(1);
        return;
      }
      if (act === 'chart') {
        closeOverlay('overlay-menu');
        openLifeChart();
        return;
      }
      if (act === 'chart-close') {
        closeOverlay('overlay-chart');
        return;
      }
      if (act === 'strike-minus') {
        nudgeStrikeAmount(isHold ? -10 : -1);
        return;
      }
      if (act === 'strike-plus') {
        nudgeStrikeAmount(isHold ? 10 : 1);
        return;
      }
      if (act === 'strike-cmd-minus') {
        nudgeStrikeCmd('strikeCmd', isHold ? -10 : -1);
        return;
      }
      if (act === 'strike-cmd-plus') {
        nudgeStrikeCmd('strikeCmd', isHold ? 10 : 1);
        return;
      }
      if (act === 'strike-cmd-b-minus') {
        nudgeStrikeCmd('strikeCmdB', isHold ? -10 : -1);
        return;
      }
      if (act === 'strike-cmd-b-plus') {
        nudgeStrikeCmd('strikeCmdB', isHold ? 10 : 1);
        return;
      }
      if (act === 'strike-cancel') {
        var cancelTarget = ui.strikeTo;
        closeOverlay('overlay-strike');
        resetStrikeModal();
        ui.strikeFrom = -1;
        ui.strikeTo = -1;
        if (cancelTarget >= 0 && state.players[cancelTarget]) {
          updateSeat(cancelTarget);
        }
        return;
      }
      if (act === 'strike-ok') {
        applyStrike();
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
      if (hit && !closest(el, '.cmd-bar')) {
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
        if (rulesLoss(p)) {
          p.eliminated = false;
        } else {
          p.eliminated = !p.eliminated;
        }
        save();
        $('btn-kill').innerHTML = isOut(p) ? 'Revivir' : 'Eliminar jugador';
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
          $('btn-kill').innerHTML = isOut(state.players[ui.editingIndex]) ? 'Revivir' : 'Eliminar jugador';
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
          row.getElementsByTagName('strong')[0].innerHTML = String(val);
          $('btn-kill').innerHTML = isOut(p) ? 'Revivir' : 'Eliminar jugador';
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
      sfxUnlock();
      touchMode = true;
      t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startEl = commanderControlAt(startX, startY) || e.target;
      longFired = false;
      moved = false;
      strikeDrag = false;
      dragFrom = dragSourceIndex(startEl);
      if (dragFrom >= 0) {
        sfxUnlock();
      }
      clearLong();
      hit = closest(startEl, '.cmd-bar') ? null : closest(startEl, '.hit');
      if (!hit) {
        hit = strikeHoldButton(startEl);
      }
      if (hit) {
        armHold(hit);
      }
    });

    onTouchMove(root, function (e) {
      var t;
      if (!closest(startEl, '.modal') && e.preventDefault) {
        e.preventDefault();
      }
      if (!touchMode || e.touches.length !== 1) {
        return;
      }
      t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 14 || Math.abs(t.clientY - startY) > 14) {
        moved = true;
        clearLong();
        pressHit(null, false);
        trackDrag(t.clientX, t.clientY);
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
      if (moved && finishDrag(endX, endY)) {
        if (e.preventDefault) {
          e.preventDefault();
        }
        ui.suppressClick = true;
        return;
      }
      seat = closest(startEl, '.seat');
      if (seat && moved && !closest(startEl, '.cmd-bar') && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
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
      handleTap(commanderControlAt(e.clientX, e.clientY) || e.target, hold);
    });

    on(root, 'mousedown', function (e) {
      var hit;
      if (e.button && e.button !== 0) {
        return;
      }
      sfxUnlock();
      if (touchMode || commanderControlAt(e.clientX, e.clientY)) {
        return;
      }
      mouseDown = true;
      startX = e.clientX;
      startY = e.clientY;
      startEl = e.target;
      moved = false;
      strikeDrag = false;
      dragFrom = dragSourceIndex(startEl);
      if (dragFrom >= 0) {
        sfxUnlock();
      }
      longFired = false;
      hit = closest(e.target, '.hit') || strikeHoldButton(e.target);
      if (!hit) {
        return;
      }
      armHold(hit);
    });

    on(root, 'mousemove', function (e) {
      if (!mouseDown || touchMode) {
        return;
      }
      if (Math.abs(e.clientX - startX) > 14 || Math.abs(e.clientY - startY) > 14) {
        moved = true;
        clearLong();
        pressHit(null, false);
        trackDrag(e.clientX, e.clientY);
      }
    });

    on(root, 'mouseup', function (e) {
      if (touchMode) {
        return;
      }
      clearLong();
      pressHit(null, false);
      if (mouseDown && moved && finishDrag(e.clientX, e.clientY)) {
        ui.suppressClick = true;
      } else {
        hideArrow();
        dragFrom = -1;
        strikeDrag = false;
      }
      mouseDown = false;
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
        var seatColor = COLORS[j % COLORS.length];
        var seatParts = hexParts(seatColor);
        preview += '<span class="mini-seat" style="left:' + b.x + 'px;top:' + b.y +
          'px;width:' + b.w + 'px;height:' + b.h + 'px;line-height:' + b.h +
          'px;background:#0c101a;color:' + seatColor +
          ';border:1px solid rgba(' + seatParts.r + ',' + seatParts.g + ',' + seatParts.b + ',0.7)' +
          ';box-shadow:inset 0 0 8px rgba(' + seatParts.r + ',' + seatParts.g + ',' + seatParts.b + ',0.35)' +
          '">' + (j + 1) + '</span>';
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
    if (state.playerCount > 6) {
      state.playerCount = 6;
    }
    if (state.playerCount < 2) {
      state.playerCount = 2;
    }
    for (i = 2; i <= 6; i++) {
      n = i;
      html += '<button type="button" class="choice' + (n === state.playerCount ? ' selected' : '') +
        '" data-count="' + n + '">' + n + '</button>';
    }
    row.innerHTML = html;
    if ($('count-meta')) {
      $('count-meta').innerHTML = 'Seleccionado: ' + state.playerCount;
    }
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
    onTouchMove(document, function (e) {
      var t = e.target;
      if (closest(t, '.modal') || closest(t, '.suggest-list')) {
        return;
      }
      if (e.preventDefault) {
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

  sfxEnsure();
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
