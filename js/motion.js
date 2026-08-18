/* =========================================================================
   Interactiuni si animatii
     - holograma de puncte si formele ei pe scroll
     - valul care intuneca fundalul peste sectiunile cu text
     - meniu, sertar early access
     - aparitii la scroll, text care se lumineaza, text care se descifreaza
     - contoare care se rostogolesc, feed live, terminale care se scriu
     - sina orizontala cu clasele de agenti
     - cursor propriu, butoane magnetice, scantei la click, carduri inclinate
   ========================================================================= */

(function () {
  'use strict';

  var mqSmall = window.matchMedia('(max-width: 900px)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- formele, in functie de cat ai derulat --------------------- */
  /* etapele sunt aliniate la sectiuni: forma e vedeta in hero si la final,
     in rest ramane fundal, iar valul o mai si intuneca */
  var STOPS = [
    { at: 0.00, shape: 'hex', scale: 0.50, x: 0.14 },
    { at: 0.06, shape: 'hex', scale: 0.56, x: 0.10 },
    { at: 0.11, shape: 'grid', scale: 0.80, opacity: 0.8 },
    { at: 0.18, shape: 'cube', scale: 0.46, y: 0.16 },
    { at: 0.30, shape: 'grid', scale: 1.05 },
    { at: 0.42, shape: 'ring', scale: 0.62 },
    /* in dreptul buclei, forma se muta in coltul gol de jos-stanga:
       cercul din sectiune e deja destul de puternic vizual */
    { at: 0.54, shape: 'cube', scale: 0.30, x: -0.22, y: 0.26 },
    { at: 0.66, shape: 'bolt', scale: 0.52 },
    { at: 0.80, shape: 'candles', scale: 0.52 },
    { at: 0.90, shape: 'hex', scale: 0.34 },
    { at: 0.96, shape: 'hex', scale: 0.28, y: -0.06 },
    { at: 1.00, shape: 'hex', scale: 0.24, y: -0.12, opacity: 0.45 }
  ];

  function initParticles() {
    var cv = document.getElementById('bg-canvas');
    if (!cv || !window.ParticleField || reduced) return;

    /* pe telefon textul sta chiar peste forma, iar hero-ul nu are val,
       asa ca stingem holograma pana ramane textura, nu zgomot */
    var stops = STOPS.map(function (s) {
      if (!mqSmall.matches) return s;
      var c = {}, k;
      for (k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) c[k] = s[k]; }
      c.opacity = (c.opacity === undefined ? 1 : c.opacity) * 0.32;
      return c;
    });

    new window.ParticleField(cv, { stops: stops });
  }

  /* ---------- valul de intuneric --------------------------------------- */
  var veilEl = null;
  var veilSections = [];

  function initVeil() {
    veilEl = document.querySelector('[data-veil-el]');
    if (!veilEl) return;
    document.querySelectorAll('[data-veil]').forEach(function (el) {
      veilSections.push({ el: el, v: parseFloat(el.getAttribute('data-veil')) || 0 });
    });
  }

  function updateVeil() {
    if (!veilEl || !veilSections.length) return;
    var vh = window.innerHeight, acc = 0, sum = 0;
    for (var i = 0; i < veilSections.length; i += 1) {
      var r = veilSections[i].el.getBoundingClientRect();
      var ov = Math.min(vh, r.bottom) - Math.max(0, r.top);
      if (ov <= 0) continue;
      var w = ov / vh;
      acc += w * veilSections[i].v;
      sum += w;
    }
    veilEl.style.opacity = (sum > 0 ? acc / sum : 0).toFixed(3);
  }

  /* ---------- panoul interior al cardurilor cu colt taiat --------------- */
  function initPanes() {
    document.querySelectorAll('.bracket').forEach(function (el) {
      if (el.querySelector(':scope > .pane')) return;
      var pane = document.createElement('i');
      pane.className = 'pane';
      el.insertBefore(pane, el.firstChild);
    });
  }

  /* ---------- titlurile cu fantome decalate ----------------------------- */
  function initGlitch() {
    document.querySelectorAll('[data-glitch] .line').forEach(function (n) {
      n.setAttribute('data-text', n.textContent);
    });
  }

  /* ---------- text care se descifreaza ---------------------------------- */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\[]<>#*+-';

  /* progresul e legat de timp, nu de numarul de cadre: daca tabul sta ascuns
     si cadrele se opresc, textul se aseaza corect la prima revenire */
  function scramble(node) {
    var final = node.textContent;
    if (!final) return;
    var t0 = performance.now();
    var dur = 260 + final.length * 26;

    /* plasa de siguranta: daca fila e ascunsa si cadrele stau, textul tot
       ajunge intreg, ca sa nu ramana o eticheta descompusa pe ecran */
    var guard = setTimeout(function () { node.textContent = final; }, dur + 600);

    function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      if (p >= 1) { clearTimeout(guard); node.textContent = final; return; }

      var settled = p * (final.length + 2);
      var out = '';
      for (var i = 0; i < final.length; i += 1) {
        if (final[i] === ' ') { out += ' '; continue; }
        out += i < settled ? final[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      node.textContent = out;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initScramble() {
    var items = document.querySelectorAll('.scramble');
    if (!items.length) return;
    if (reduced || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        scramble(en.target);
      });
    }, { threshold: 0.6 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------- cursor propriu -------------------------------------------- */
  function initCursor() {
    var cur = document.querySelector('[data-cursor]');
    if (!cur || !mqFine.matches || reduced) return;

    var x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y;

    window.addEventListener('pointermove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
      cur.classList.add('is-on');
      var hot = e.target.closest('a, button, [data-tilt], input, select, textarea');
      cur.classList.toggle('is-hot', !!hot);
    }, { passive: true });

    document.addEventListener('pointerleave', function () { cur.classList.remove('is-on'); });

    (function tick() {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      cur.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      requestAnimationFrame(tick);
    })();
  }

  /* ---------- butoane magnetice ----------------------------------------- */
  function initMagnet() {
    if (!mqFine.matches || reduced) return;
    document.querySelectorAll('[data-magnet]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 14).toFixed(1) + 'px,' + (dy * 10).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- carduri care se inclina spre cursor ----------------------- */
  function initTilt() {
    if (!mqFine.matches || reduced) return;
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'perspective(900px) rotateY(' + (dx * 7).toFixed(2) +
          'deg) rotateX(' + (-dy * 7).toFixed(2) + 'deg) translateZ(6px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- scantei la click ------------------------------------------ */
  function initSpark() {
    if (reduced) return;
    window.addEventListener('pointerdown', function (e) {
      for (var i = 0; i < 7; i += 1) {
        var s = document.createElement('span');
        s.className = 'spark';
        s.style.left = e.clientX + 'px';
        s.style.top = e.clientY + 'px';
        document.body.appendChild(s);

        var a = (Math.PI * 2 * i) / 7 + Math.random() * 0.4;
        var d = 26 + Math.random() * 30;
        var anim = s.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(0)', opacity: 0 }
        ], { duration: 420 + Math.random() * 220, easing: 'cubic-bezier(.16,1,.3,1)' });

        anim.onfinish = (function (node) {
          return function () { node.remove(); };
        })(s);
      }
    }, { passive: true });
  }

  /* ---------- meniu (telefon) ------------------------------------------- */
  function initMenu() {
    var burger = document.querySelector('[data-burger]');
    var menu = document.querySelector('[data-menu]');
    if (!burger || !menu) return;

    function close() {
      burger.classList.remove('is-open');
      menu.classList.remove('is-open');
    }
    burger.addEventListener('click', function () {
      burger.classList.toggle('is-open');
      menu.classList.toggle('is-open');
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !burger.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
  }

  /* ---------- sertarul de early access ---------------------------------- */
  function initAccess() {
    var drawer = document.querySelector('[data-access]');
    var bg = document.querySelector('[data-access-bg]');
    if (!drawer) return;

    function open(e) {
      if (e) e.preventDefault();
      drawer.classList.add('is-open');
      if (bg) bg.classList.add('is-open');
      var first = drawer.querySelector('input');
      if (first) setTimeout(function () { first.focus(); }, 420);
    }
    function close() {
      drawer.classList.remove('is-open');
      if (bg) bg.classList.remove('is-open');
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-access-open]')) open(e);
      if (e.target.closest('[data-access-close]')) close();
    });
    if (bg) bg.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    if (location.hash === '#access') setTimeout(open, 500);

    var form = drawer.querySelector('[data-access-form]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitAccess(form, drawer);
      });
    }
  }

  /* trimiterea inscrierii: web3forms, endpoint propriu, sau mailto pe ultimul
     loc. Formularul nu se declara reusit decat daca chiar a plecat. */
  function submitAccess(form, drawer) {
    var A = window.SITE.access;
    var msg = drawer.querySelector('[data-access-msg]');
    var btn = drawer.querySelector('[data-access-submit]');
    var doneBox = drawer.querySelector('[data-access-done]');

    var data = {}, lines = [];
    new FormData(form).forEach(function (v, k) {
      if (v) { data[k] = v; lines.push(k + ': ' + v); }
    });
    data.page = location.href;

    /* fara nicio destinatie configurata: deschidem clientul de mail si
       spunem asta pe fata, ca sa nu para ca s-a trimis ceva */
    if (!A.web3formsKey && !A.endpoint) {
      msg.textContent = A.mailto;
      msg.classList.remove('is-err');
      location.href = 'mailto:' + window.SITE.brand.email +
        '?subject=' + encodeURIComponent('Whitelist - ' + (data.handle || '')) +
        '&body=' + encodeURIComponent(lines.join('\n'));
      return;
    }

    btn.disabled = true;
    btn.textContent = A.sending;
    msg.textContent = '';
    msg.classList.remove('is-err');

    var url, body = {}, k;
    for (k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) body[k] = data[k]; }

    if (A.web3formsKey) {
      url = 'https://api.web3forms.com/submit';
      body.access_key = A.web3formsKey;
      body.subject = 'Stonk Agents whitelist: ' + (data.handle || data.wallet || '');
      body.from_name = 'Stonk Agents site';
    } else {
      url = A.endpoint;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function () { return { success: true }; });
      })
      .then(function (j) {
        if (j && j.success === false) throw new Error('rejected');
        form.style.display = 'none';
        if (doneBox) doneBox.classList.add('is-on');
      })
      .catch(function () {
        msg.textContent = A.err;
        msg.classList.add('is-err');
        btn.disabled = false;
        btn.textContent = A.send;
      });
  }

  /* ---------- numaratoarea pana la mint ---------------------------------- */
  function initCountdown() {
    var el = document.querySelector('[data-countdown]');
    if (!el || el.getAttribute('data-done')) return;
    var target = new Date(el.getAttribute('data-target') || '').getTime();
    var val = el.querySelector('[data-cd-value]');
    if (!val || isNaN(target)) return;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    (function tick() {
      var left = target - Date.now();
      if (left <= 0) {
        el.innerHTML = '<i class="led"></i>' +
          ((window.SITE.launch && window.SITE.launch.liveLabel) || 'MINT IS LIVE');
        return;
      }
      var s = Math.floor(left / 1000);
      val.textContent = Math.floor(s / 86400) + 'D ' +
        pad(Math.floor(s % 86400 / 3600)) + 'H ' +
        pad(Math.floor(s % 3600 / 60)) + 'M ' +
        pad(s % 60) + 'S';
      setTimeout(tick, 1000);
    })();
  }

  /* ---------- copiat adresa contractului --------------------------------- */
  function initCopy() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]');
      if (!b || !navigator.clipboard) return;
      var was = b.textContent;
      navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
        b.textContent = (window.SITE.launch.contract.copied) || 'COPIED';
        b.classList.add('is-done');
        setTimeout(function () { b.textContent = was; b.classList.remove('is-done'); }, 1600);
      }, function () { /* browserul a refuzat, lasam textul cum era */ });
    });
  }

  /* ---------- aparitii la scroll ---------------------------------------- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------- text care se lumineaza cuvant cu cuvant -------------------- */
  var scrollTexts = [];

  function initScrollText() {
    document.querySelectorAll('.scroll-text').forEach(function (n) {
      var words = n.textContent.trim().split(/\s+/);
      n.innerHTML = words.map(function (w) {
        return '<span class="w">' + w + '</span>';
      }).join(' ');
      scrollTexts.push({ node: n, words: n.querySelectorAll('.w') });
    });
  }

  function updateScrollText() {
    var vh = window.innerHeight;
    scrollTexts.forEach(function (it) {
      var r = it.node.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var p = (vh * 0.82 - r.top) / (vh * 0.5);
      p = Math.min(1, Math.max(0, p));
      var upto = Math.round(p * it.words.length);
      for (var i = 0; i < it.words.length; i += 1) {
        it.words[i].classList.toggle('on', i < upto);
      }
    });
  }

  /* ---------- pasii din "how it works" ----------------------------------- */
  function updateSteps() {
    var steps = document.querySelectorAll('[data-step]');
    if (!steps.length || mqSmall.matches) return;
    var mid = window.innerHeight * 0.5;
    var best = null, bestD = Infinity;
    steps.forEach(function (s) {
      var r = s.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = s; }
    });
    steps.forEach(function (s) { s.classList.toggle('is-active', s === best); });
  }

  /* ---------- bara de sus capata fundal dupa primul ecran ---------------- */
  function updateNav() {
    document.body.classList.toggle('is-stuck', window.scrollY > 40);
  }

  /* ---------- sina orizontala cu clasele de agenti ----------------------- */
  var rail = null;

  function initRail() {
    var host = document.querySelector('[data-rail]');
    if (!host) return;
    rail = {
      host: host,
      track: host.querySelector('.rail-track'),
      bar: host.querySelector('[data-rail-bar]'),
      shift: 0
    };
    measureRail();
    window.addEventListener('resize', measureRail);
  }

  function measureRail() {
    if (!rail) return;
    if (mqSmall.matches) {
      rail.host.style.height = '';
      rail.track.style.transform = '';
      rail.shift = 0;
      return;
    }
    rail.shift = Math.max(0, rail.track.scrollWidth - window.innerWidth);
    rail.host.style.height = (window.innerHeight + rail.shift) + 'px';
    updateRail();
  }

  function updateRail() {
    if (!rail || !rail.shift) return;
    var top = rail.host.getBoundingClientRect().top;
    var p = Math.min(1, Math.max(0, -top / rail.shift));
    rail.track.style.transform = 'translate3d(' + (-p * rail.shift).toFixed(1) + 'px,0,0)';
    if (rail.bar) rail.bar.style.transform = 'scaleX(' + Math.max(0.05, p) + ')';
  }

  /* ---------- contoare care se rostogolesc ------------------------------- */
  function Odo(node) {
    this.node = node;
    this.dec = parseInt(node.getAttribute('data-dec') || '0', 10);
    this.suffix = node.getAttribute('data-suffix') || '';
    this.target = parseFloat(node.getAttribute('data-odo')) || 0;
    this.drift = parseFloat(node.getAttribute('data-drift') || '0');
    this.cells = [];
    this.len = -1;
    this.render(0);
  }

  Odo.prototype.fmt = function (v) {
    return v.toLocaleString('en-US', {
      minimumFractionDigits: this.dec,
      maximumFractionDigits: this.dec
    });
  };

  Odo.prototype.build = function (s) {
    var html = '';
    for (var i = 0; i < s.length; i += 1) {
      if (/\d/.test(s[i])) {
        html += '<span class="d"><span class="strip" style="transition-delay:' + (i * 26) + 'ms">' +
          '<i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i>' +
          '</span></span>';
      } else {
        html += '<span class="sep">' + s[i] + '</span>';
      }
    }
    if (this.suffix) html += '<span class="unit">' + this.suffix + '</span>';
    this.node.innerHTML = html;
    this.cells = Array.prototype.slice.call(this.node.querySelectorAll('.d .strip, .sep'));
    this.len = s.length;
  };

  Odo.prototype.render = function (v) {
    var s = this.fmt(v);
    if (s.length !== this.len) this.build(s);
    for (var i = 0; i < s.length; i += 1) {
      var cell = this.cells[i];
      if (!cell) continue;
      if (cell.className === 'strip') cell.style.transform = 'translateY(-' + s[i] + 'em)';
      else cell.textContent = s[i];
    }
  };

  Odo.prototype.run = function () {
    var self = this;
    if (reduced) {
      this.render(this.target);
      this.node.classList.add('is-live');
      this.tick();
      return;
    }
    var t0 = performance.now(), dur = 1500;
    function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      self.render(self.target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else {
        self.node.classList.add('is-live');
        self.tick();
      }
    }
    requestAnimationFrame(step);
  };

  /* folosit de js/live.js cand vine o cifra reala de la API */
  Odo.prototype.setTarget = function (v) {
    this.target = v;
    this.node.classList.add('is-live');
    this.render(v);
  };

  /* dupa numaratoare cifrele continua sa urce, ca sa para un sistem viu */
  Odo.prototype.tick = function () {
    var self = this;
    if (!this.drift) return;
    setTimeout(function () {
      self.target += self.drift * (0.4 + Math.random() * 1.2);
      self.render(self.target);
      self.tick();
    }, 2200 + Math.random() * 3200);
  };

  function initOdo() {
    var nodes = document.querySelectorAll('[data-odo]');
    if (!nodes.length) return;
    var made = [];
    nodes.forEach(function (n) { made.push(new Odo(n)); });
    /* js/live.js are nevoie de ele ca sa scrie cifrele venite de la API */
    window.SITE_STATE.odo = made;

    if (!('IntersectionObserver' in window)) {
      made.forEach(function (o) { o.run(); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        made.forEach(function (o) { if (o.node === en.target) o.run(); });
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  /* ---------- feed live in hero ------------------------------------------ */
  function initFeed() {
    var list = document.querySelector('[data-feed-list]');
    if (!list || reduced) return;
    setInterval(function () {
      var last = list.lastElementChild;
      if (!last) return;
      last.classList.add('is-new');
      list.insertBefore(last, list.firstElementChild);
      setTimeout(function () { last.classList.remove('is-new'); }, 900);
    }, 2100);
  }

  /* ---------- terminale care se scriu singure ---------------------------- */
  function typeTerminal(box) {
    var lines = Array.prototype.slice.call(box.querySelectorAll('.tline'));
    lines.forEach(function (l) {
      l.setAttribute('data-text', l.textContent);
      l.textContent = '';
    });
    var li = 0;
    function nextLine() {
      if (li >= lines.length) { box.classList.add('is-done'); return; }
      var node = lines[li];
      var text = node.getAttribute('data-text');
      var ci = 0;
      node.classList.add('is-typing');
      (function typeChar() {
        node.textContent = text.slice(0, ci);
        ci += 1;
        if (ci <= text.length) setTimeout(typeChar, 12);
        else {
          node.classList.remove('is-typing');
          li += 1;
          setTimeout(nextLine, 160);
        }
      })();
    }
    nextLine();
  }

  function initTerminals() {
    var boxes = document.querySelectorAll('[data-type]');
    if (!boxes.length) return;
    if (reduced || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        typeTerminal(en.target);
      });
    }, { threshold: 0.35 });
    boxes.forEach(function (b) { io.observe(b); });
  }

  /* ---------- lumina care urmareste cursorul pe panouri ------------------ */
  function initSpotlight() {
    document.querySelectorAll('[data-spot]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- rolarea trasaturilor --------------------------------------- */
  function initRoller() {
    var host = document.querySelector('.traits-grid');
    if (!host) return;

    var T = window.SITE.traits;
    var classes = window.SITE.classes.items;
    var glyphs = window.SITE_STATE.glyphs || {};

    var card = host.querySelector('.roll-card');
    var idEl = host.querySelector('[data-roll-id]');
    var glyphEl = host.querySelector('[data-roll-glyph]');
    var classEl = host.querySelector('[data-roll-class]');
    var tierEl = host.querySelector('[data-roll-tier]');
    var scoreEl = host.querySelector('[data-roll-score]');
    var frameEl = host.querySelector('[data-roll-frame]');
    var btn = host.querySelector('[data-roll]');
    var rows = Array.prototype.slice.call(host.querySelectorAll('[data-tstat]'));
    var ladder = Array.prototype.slice.call(host.querySelectorAll('[data-tier]'));
    if (!rows.length) return;

    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    function pickFrame() {
      var total = T.frames.reduce(function (s, f) { return s + f.weight; }, 0);
      var r = Math.random() * total;
      for (var i = 0; i < T.frames.length; i += 1) {
        r -= T.frames[i].weight;
        if (r <= 0) return T.frames[i].name;
      }
      return T.frames[0].name;
    }

    function tierFor(score) {
      for (var i = 0; i < T.tiers.length; i += 1) {
        if (score >= T.tiers[i].min) return T.tiers[i].name;
      }
      return T.tiers[T.tiers.length - 1].name;
    }

    function paintValues(vals) {
      rows.forEach(function (row, i) {
        var v = vals[i];
        row.querySelector('[data-tstat-val]').textContent = v;
        var segs = row.querySelectorAll('[data-segs] i');
        var lit = Math.round(v / 100 * segs.length);
        for (var s = 0; s < segs.length; s += 1) {
          segs[s].classList.toggle('on', s < lit);
          segs[s].classList.toggle('tip', s === lit - 1);
        }
      });
    }

    function roll() {
      var vals = T.stats.map(function (st) {
        return st.min + Math.floor(Math.random() * (st.max - st.min + 1));
      });
      var score = vals.reduce(function (a, b) { return a + b; }, 0);
      var cls = pick(classes);
      var frame = pickFrame();
      var tier = tierFor(score);
      var id = ('000' + Math.floor(Math.random() * 9999)).slice(-4);

      if (reduced) { settle(); return; }

      card.classList.add('is-rolling');
      var t0 = performance.now(), dur = 720;

      var guard = setTimeout(settle, dur + 700);

      function frameStep(now) {
        if ((now - t0) / dur >= 1) { clearTimeout(guard); settle(); return; }
        paintValues(T.stats.map(function (st) {
          return st.min + Math.floor(Math.random() * (st.max - st.min + 1));
        }));
        idEl.textContent = '#' + ('000' + Math.floor(Math.random() * 9999)).slice(-4);
        scoreEl.textContent = 160 + Math.floor(Math.random() * 236);
        requestAnimationFrame(frameStep);
      }
      requestAnimationFrame(frameStep);

      function settle() {
        card.classList.remove('is-rolling');
        paintValues(vals);
        idEl.textContent = '#' + id;
        scoreEl.textContent = score;
        frameEl.textContent = frame;
        classEl.textContent = cls.name;
        glyphEl.innerHTML = glyphs[cls.glyph] || '';
        tierEl.textContent = tier;
        tierEl.setAttribute('data-tier-name', tier);
        ladder.forEach(function (r) {
          r.classList.toggle('is-on', r.getAttribute('data-tier') === tier);
        });
      }
    }

    if (btn) btn.addEventListener('click', roll);

    /* prima rolare cand sectiunea intra in ecran */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          roll();
        });
      }, { threshold: 0.3 });
      io.observe(host);
    } else {
      roll();
    }
  }

  /* ---------- nodurile buclei se aprind pe rand -------------------------- */
  function initLoopNodes() {
    var nodes = document.querySelectorAll('[data-node]');
    if (!nodes.length || reduced) return;
    var marks = document.querySelectorAll('[data-mark]');
    var arc = document.querySelector('[data-arc]');
    var i = 0;

    /* arcul aprins se roteste cu 60 de grade pe nod, deci pare ca fluxul
       inainteaza pe cerc, nu ca doar clipesc etichetele */
    setInterval(function () {
      nodes.forEach(function (n, k) { n.classList.toggle('is-on', k === i); });
      marks.forEach(function (m, k) { m.classList.toggle('is-on', k === i); });
      if (arc) arc.style.transform = 'rotate(' + (i * 60) + 'deg)';
      i = (i + 1) % nodes.length;
    }, 1500);
  }

  /* ---------- bucla de scroll -------------------------------------------- */
  var queued = false;

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      updateScrollText();
      updateSteps();
      updateNav();
      updateRail();
      updateVeil();
    });
  }

  /* ---------- pornire ----------------------------------------------------- */
  function boot() {
    initPanes();
    initGlitch();
    initParticles();
    initVeil();
    initMenu();
    initAccess();
    initCountdown();
    initCopy();
    initScrollText();
    initReveal();
    initScramble();
    initRail();
    initOdo();
    initFeed();
    initTerminals();
    initSpotlight();
    initRoller();
    initLoopNodes();
    initCursor();
    initMagnet();
    initTilt();
    initSpark();

    updateScrollText();
    updateSteps();
    updateNav();
    updateRail();
    updateVeil();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  if (window.SITE_STATE) boot();
  else document.addEventListener('site:rendered', boot);
})();
