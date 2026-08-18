/* =========================================================================
   Randare: ia continutul din js/content.js si il pune in pagina.
   Marcaje folosite in HTML:
     data-t="cale.din.continut"   -> text simplu
     data-list="nume"             -> bloc generat (clase de agenti, pasi...)
   Nu scrie texte direct in index.html, ca sa ramana un singur loc de editat.
   ========================================================================= */

(function () {
  'use strict';

  var D = window.SITE;

  function get(path) {
    var parts = path.split('.');
    var node = D;
    for (var i = 0; i < parts.length; i += 1) {
      if (node == null) return '';
      node = node[parts[i]];
    }
    return node == null ? '' : node;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* textul e scris de doua ori: la hover primul urca, al doilea ii ia locul */
  function roll(text) {
    return '<span class="roll"><span>' + esc(text) + '</span>' +
      '<span class="b">' + esc(text) + '</span></span>';
  }

  /* ---------- bara de sus, meniu ---------------------------------------- */
  function renderNav() {
    var logo = document.querySelector('[data-logo]');
    if (logo) logo.innerHTML = esc(D.brand.name) + '<b>' + esc(D.brand.nameBold) + '</b>';

    var links = D.nav.map(function (l) {
      return '<a href="' + esc(l.href) + '">' + roll(l.label) + '</a>';
    }).join('');

    var bar = document.querySelector('[data-nav]');
    if (bar) bar.innerHTML = links;

    var menu = document.querySelector('[data-menu]');
    if (menu) {
      menu.innerHTML = links +
        '<a href="#access" data-access-open>' + roll(tokens('{{cta}}')) + '</a>';
    }
  }

  /* starea lansarii: un singur loc care decide textul butoanelor si eticheta */
  function launchStatus() {
    var L = D.launch || {};
    var st = L.status || 'soon';
    /* daca data a trecut, nu mai lasam pagina sa spuna "soon" */
    if (st === 'soon' && L.date && new Date(L.date).getTime() <= Date.now()) st = 'live';
    return st;
  }

  function tokens(text) {
    if (typeof text !== 'string' || text.indexOf('{{') < 0) return text;
    var L = D.launch || {}, st = launchStatus();
    return text
      .replace('{{cta}}', (L.cta && L.cta[st]) || 'MINT')
      .replace('{{status}}', (L.label && L.label[st]) || '');
  }

  /* ---------- texte simple ---------------------------------------------- */
  function renderSimple() {
    document.querySelectorAll('[data-t]').forEach(function (n) {
      n.textContent = tokens(get(n.getAttribute('data-t')));
    });
    document.querySelectorAll('[data-mail]').forEach(function (n) {
      n.textContent = D.brand.email;
      n.setAttribute('href', 'mailto:' + D.brand.email);
    });
  }

  /* ---------- etichetele de pe marginile ecranului ----------------------- */
  function renderHud() {
    var l = document.querySelector('[data-hud-left]');
    if (l) l.textContent = D.brand.hudLeft;
    var r = document.querySelector('[data-hud-right]');
    if (r) r.textContent = D.brand.hudRight;
  }

  /* ---------- feed-ul din hero ------------------------------------------ */
  function renderFeed() {
    var host = document.querySelector('[data-feed-list]');
    if (!host) return;
    host.innerHTML = D.hero.feed.map(function (line) {
      return '<li class="mono">' + esc(line) + '</li>';
    }).join('');
    var count = document.querySelector('[data-feed-count]');
    if (count) count.textContent = D.hero.feedTag || ('0' + D.hero.feed.length).slice(-2);
  }

  /* ---------- numaratoarea pana la mint ---------------------------------- */
  function renderCountdown() {
    var host = document.querySelector('[data-countdown]');
    if (!host) return;
    var L = D.launch || {};
    var st = launchStatus();

    if (st !== 'soon' || !L.date) {
      host.innerHTML = '<i class="led"></i>' + esc(st === 'sold' ? (L.label && L.label.sold) : L.liveLabel);
      host.setAttribute('data-done', '1');
      return;
    }
    host.innerHTML = '<i class="led"></i>' + esc(L.countdownLabel) +
      ' <b data-cd-value>--</b>';
    host.setAttribute('data-target', L.date);
  }

  /* ---------- adresa contractului ---------------------------------------- */
  function renderContract() {
    var host = document.querySelector('[data-contract]');
    if (!host) return;
    var c = (D.launch && D.launch.contract) || {};

    if (!c.address) {
      host.innerHTML = '<span class="c-label">' + esc(c.label || 'CONTRACT') + '</span>' +
        '<span class="c-soon">' + esc(c.soon || 'SOON') + '</span>';
      return;
    }
    var short = c.address.slice(0, 6) + '...' + c.address.slice(-4);
    host.innerHTML = '<span class="c-label">' + esc(c.label || 'CONTRACT') + '</span>' +
      '<span class="c-chain">' + esc(c.chain || '') + '</span>' +
      '<a class="c-addr" href="' + esc((c.explorer || '') + c.address) + '" target="_blank" rel="noopener">' +
        esc(short) + '</a>' +
      '<button class="c-copy" data-copy="' + esc(c.address) + '">' + esc(c.copy || 'COPY') + '</button>';
  }

  /* ---------- banda care curge ------------------------------------------ */
  function renderTicker() {
    document.querySelectorAll('[data-ticker]').forEach(function (host) {
      var one = D.ticker.map(function (t) {
        return '<span class="mono">' + esc(t) + '</span>';
      }).join('<i>/</i>');
      /* doua copii identice, ca bucla sa fie continua */
      host.innerHTML =
        '<div class="ticker-row"><div class="ticker-set">' + one + '<i>/</i></div>' +
        '<div class="ticker-set">' + one + '<i>/</i></div></div>';
    });
  }

  /* ---------- blocuri generate ------------------------------------------ */
  var glyphs = {
    ring: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="4.5"/></svg>',
    pick: '<svg viewBox="0 0 40 40"><path d="M7 33 L24 16"/><path d="M12 8 A18 18 0 0 1 33 21 L27 20 A12 12 0 0 0 15 13 Z"/></svg>',
    box: '<svg viewBox="0 0 40 40"><path d="M20 6 L33 13 L33 27 L20 34 L7 27 L7 13 Z"/><path d="M7 13 L20 20 L33 13"/><path d="M20 20 L20 34"/></svg>',
    vote: '<svg viewBox="0 0 40 40"><path d="M6 15 L34 15 L34 33 L6 33 Z"/><path d="M13 15 L13 7 L27 7 L27 15"/><path d="M14 24 L18 28 L27 18"/></svg>',
    truck: '<svg viewBox="0 0 40 40"><path d="M4 12 L23 12 L23 26 L4 26 Z"/><path d="M23 17 L30 17 L35 22 L35 26 L23 26"/><circle cx="12" cy="29" r="3"/><circle cx="29" cy="29" r="3"/></svg>'
  };

  var lists = {

    stats: function (host) {
      host.innerHTML = D.stats.map(function (s) {
        return '' +
          '<div class="stat reveal">' +
            '<div class="stat-value mono" data-odo="' + s.value + '"' +
              (s.key ? ' data-key="' + esc(s.key) + '"' : '') +
              (s.decimals ? ' data-dec="' + s.decimals + '"' : '') +
              (s.suffix ? ' data-suffix="' + esc(s.suffix) + '"' : '') +
              (s.drift ? ' data-drift="' + s.drift + '"' : '') + '></div>' +
            '<div class="stat-label mono">' + esc(s.label) + '</div>' +
          '</div>';
      }).join('');
    },

    classes: function (host) {
      host.innerHTML = D.classes.items.map(function (c) {
        return '' +
          '<article class="agent bracket" data-spot data-tilt>' +
            '<div class="agent-top">' +
              '<span class="agent-code mono">' + esc(c.code) + '</span>' +
              '<span class="agent-glyph">' + (glyphs[c.glyph] || glyphs.ring) + '</span>' +
            '</div>' +
            '<h3>' + esc(c.name) + '</h3>' +
            '<div class="agent-role mono">' + esc(c.role) + '</div>' +
            '<p class="agent-job">' + esc(c.job) + '</p>' +
            '<dl class="agent-meta">' +
              '<dt class="mono">EARNS</dt><dd>' + esc(c.earns) + '</dd>' +
              '<dt class="mono">CONFIG</dt><dd>' + esc(c.config) + '</dd>' +
            '</dl>' +
            '<div class="agent-foot mono"><span class="led"></span>READY TO DEPLOY</div>' +
          '</article>';
      }).join('') + '<div class="rail-end mono"><span>' + esc(D.classes.items.length) +
        ' CLASSES</span><b>ONE WORKFORCE</b></div>';
    },

    traits: function (host) {
      var t = D.traits;
      var maxShare = t.tiers.reduce(function (m, x) { return Math.max(m, x.share); }, 0);

      var segs = '';
      for (var s = 0; s < 20; s += 1) segs += '<i></i>';

      host.innerHTML = '' +
        /* cardul agentului rolat */
        '<article class="roll-card bracket" data-spot>' +
          '<div class="roll-top mono">' +
            '<span>' + esc(t.idLabel) + '</span>' +
            '<b data-roll-id>#0000</b>' +
          '</div>' +
          '<div class="roll-glyph" data-roll-glyph>' + glyphs.ring + '</div>' +
          '<h3 data-roll-class>' + esc(D.classes.items[0].name) + '</h3>' +
          '<div class="roll-tier mono" data-roll-tier>' + esc(t.tiers[t.tiers.length - 1].name) + '</div>' +
          '<dl class="roll-meta mono">' +
            '<dt>' + esc(t.scoreLabel) + '</dt><dd data-roll-score>000</dd>' +
            '<dt>' + esc(t.frameLabel) + '</dt><dd data-roll-frame>' + esc(t.frames[0].name) + '</dd>' +
          '</dl>' +
          '<button class="btn btn-solid" data-roll data-magnet>' + esc(t.rollCta) + '</button>' +
          '<p class="roll-note mono">' + esc(t.rollNote) + '</p>' +
        '</article>' +

        /* valorile rolate + scara de raritate */
        '<div class="roll-side">' +
          '<div class="tstats">' +
            t.stats.map(function (st, i) {
              return '' +
                '<div class="tstat" data-tstat="' + i + '">' +
                  '<div class="tstat-head mono">' +
                    '<span>' + esc(st.key) + '</span>' +
                    '<b data-tstat-val>00</b>' +
                  '</div>' +
                  '<div class="segs" data-segs>' + segs + '</div>' +
                  '<p class="tstat-desc">' + esc(st.desc) + '</p>' +
                '</div>';
            }).join('') +
          '</div>' +

          '<div class="ladder bracket">' +
            '<h4 class="mono">' + esc(t.ladderTitle) + '</h4>' +
            t.tiers.slice().reverse().map(function (x) {
              return '' +
                '<div class="ladder-row" data-tier="' + esc(x.name) + '">' +
                  '<span class="mono">' + esc(x.name) + '</span>' +
                  '<i><b style="width:' + (x.share / maxShare * 100).toFixed(1) + '%"></b></i>' +
                  '<span class="mono val">' + x.share + '%</span>' +
                '</div>';
            }).join('') +
          '</div>' +
        '</div>';
    },

    /* cadranul buclei: gradatii, hexagon inscris, marcaje pe cerc, arcul
       aprins care sare din segment in segment si punctul cu coada */
    loopSvg: function (host) {
      var R = 38, i, a;

      /* varfurile hexagonului = pozitiile celor 6 noduri */
      var pts = [];
      for (i = 0; i < 6; i += 1) {
        a = (-90 + i * 60) * Math.PI / 180;
        pts.push([50 + Math.cos(a) * R, 50 + Math.sin(a) * R]);
      }

      /* gradatii ca pe un cadran de instrument */
      var ticks = '';
      for (i = 0; i < 60; i += 1) {
        a = (i * 6 - 90) * Math.PI / 180;
        var long = i % 5 === 0;
        var r1 = R + 3.5, r2 = R + (long ? 7 : 5);
        ticks += '<line x1="' + (50 + Math.cos(a) * r1).toFixed(2) +
          '" y1="' + (50 + Math.sin(a) * r1).toFixed(2) +
          '" x2="' + (50 + Math.cos(a) * r2).toFixed(2) +
          '" y2="' + (50 + Math.sin(a) * r2).toFixed(2) +
          '" class="' + (long ? 't-long' : 't-short') + '"/>';
      }

      var marks = pts.map(function (p, k) {
        return '<rect class="ring-mark" data-mark="' + k + '" x="' + (p[0] - 1.6).toFixed(2) +
          '" y="' + (p[1] - 1.6).toFixed(2) + '" width="3.2" height="3.2" ' +
          'transform="rotate(45 ' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ')"/>';
      }).join('');

      /* punctul care orbiteaza, plus doua fantome in urma lui */
      function orbit(cls, r, begin) {
        return '<circle class="' + cls + '" r="' + r + '">' +
          '<animateMotion dur="9s" begin="' + begin + '" repeatCount="indefinite">' +
          '<mpath href="#loop-path"></mpath></animateMotion></circle>';
      }

      host.innerHTML = '' +
        '<path id="loop-path" fill="none" d="M50 ' + (50 - R) +
          'a' + R + ' ' + R + ' 0 1 1 0 ' + (R * 2) +
          'a' + R + ' ' + R + ' 0 1 1 0 -' + (R * 2) + '"></path>' +
        '<g class="ring-ticks">' + ticks + '</g>' +
        '<polygon class="ring-hex" points="' +
          pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') + '"/>' +
        '<circle class="ring-track" cx="50" cy="50" r="' + R + '"></circle>' +
        '<circle class="ring-dash" cx="50" cy="50" r="' + R + '"></circle>' +
        /* arc de 60 de grade, centrat sus; JS il roteste pe nodul activ */
        '<path class="ring-arc" data-arc fill="none" d="M' +
          (50 + Math.cos(-120 * Math.PI / 180) * R).toFixed(2) + ',' +
          (50 + Math.sin(-120 * Math.PI / 180) * R).toFixed(2) +
          ' A' + R + ',' + R + ' 0 0 1 ' +
          (50 + Math.cos(-60 * Math.PI / 180) * R).toFixed(2) + ',' +
          (50 + Math.sin(-60 * Math.PI / 180) * R).toFixed(2) + '"/>' +
        '<g class="ring-marks">' + marks + '</g>' +
        orbit('ring-ghost g2', 1.6, '-8.5s') +
        orbit('ring-ghost g1', 1.3, '-8.75s') +
        orbit('ring-dot', 1.1, '0s');
    },

    loopNodes: function (host) {
      host.innerHTML = D.loop.nodes.map(function (n, i) {
        return '' +
          '<div class="loop-node" data-node="' + i + '">' +
            '<span class="mono n">' + esc(n.n) + '</span>' +
            '<span class="l">' + esc(n.label) + '</span>' +
            '<span class="mono s">' + esc(n.sub) + '</span>' +
          '</div>';
      }).join('');
    },

    steps: function (host) {
      host.innerHTML = D.how.steps.map(function (s, i) {
        return '' +
          '<div class="step" data-step>' +
            '<div class="step-num mono">0' + (i + 1) + '</div>' +
            '<h3>' + esc(s.title) + '</h3>' +
            '<p>' + esc(s.body) + '</p>' +
          '</div>';
      }).join('');
    },

    platform: function (host) {
      host.innerHTML = D.platform.cards.map(function (c) {
        return '' +
          '<article class="term bracket reveal" data-spot>' +
            '<div class="term-bar mono"><span class="dots"><i></i><i></i><i></i></span>' +
              esc(c.tag) + '</div>' +
            '<div class="term-body mono" data-type>' +
              c.lines.map(function (l) {
                return '<span class="tline">' + esc(l) + '</span>';
              }).join('') +
            '</div>' +
            '<div class="term-foot">' +
              '<h3>' + esc(c.title) + '</h3>' +
              '<p>' + esc(c.body) + '</p>' +
            '</div>' +
          '</article>';
      }).join('');
    },

    footerPages: function (host) {
      host.innerHTML = D.nav.map(function (l) {
        return '<a href="' + esc(l.href) + '">' + roll(l.label) + '</a>';
      }).join('') + '<a href="#access" data-access-open>' + roll(tokens('{{cta}}')) + '</a>';
    },

    /* fara link mort: ce nu exista inca apare cu eticheta SOON, nu cu '#' */
    footerSocials: function (host) {
      host.innerHTML = D.brand.socials.map(function (s) {
        if (!s.url) {
          return '<span class="link-soon">' + esc(s.label) + '<i>SOON</i></span>';
        }
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + roll(s.label) + '</a>';
      }).join('');
    }
  };

  function renderLists() {
    document.querySelectorAll('[data-list]').forEach(function (host) {
      var fn = lists[host.getAttribute('data-list')];
      if (fn) fn(host);
    });
  }

  /* ---------- sertarul de early access ---------------------------------- */
  function renderAccess() {
    var host = document.querySelector('[data-access]');
    if (!host) return;
    var a = D.access;

    host.innerHTML = '' +
      '<div class="drawer-head">' +
        '<div>' +
          '<h2>' + esc(a.title) + '</h2>' +
          '<p class="mono">' + esc(a.subtitle) + '</p>' +
        '</div>' +
        '<button class="drawer-close" data-access-close aria-label="close">&times;</button>' +
      '</div>' +

      '<form data-access-form>' +
        '<div class="field"><label class="mono">' + esc(a.handle) + '</label>' +
          '<input name="handle" required placeholder="' + esc(a.handlePh) + '"></div>' +
        '<div class="field"><label class="mono">' + esc(a.wallet) + '</label>' +
          '<input name="wallet" required placeholder="' + esc(a.walletPh) + '"></div>' +
        '<div class="field"><label class="mono">' + esc(a.email) + '</label>' +
          '<input type="email" name="email" placeholder="' + esc(a.emailPh) + '"></div>' +
        '<div class="field"><label class="mono">' + esc(a.klass) + '</label><select name="class">' +
          '<option value="" selected disabled>' + esc(a.klassPh) + '</option>' +
          a.klassOptions.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label class="mono">' + esc(a.size) + '</label>' +
          '<div class="chips" data-chips>' +
            a.sizeOptions.map(function (o, i) {
              return '<label class="chip"><input type="radio" name="size" value="' + esc(o) + '"' +
                (i === 0 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<p class="drawer-msg mono" data-access-msg></p>' +
        '<button class="drawer-submit mono" type="submit" data-access-submit>' + esc(a.send) + '</button>' +
      '</form>' +

      /* ecranul de reusita, ascuns pana cand chiar pleaca formularul */
      '<div class="drawer-done" data-access-done>' +
        '<div class="done-mark"><svg viewBox="0 0 24 24"><path d="M4 12.5 L9.5 18 L20 6"/></svg></div>' +
        '<h3>' + esc(a.ok) + '</h3>' +
        '<p>' + esc(a.okSub) + '</p>' +
        '<a class="drawer-mail" data-mail href="#"></a>' +
      '</div>';

    var mail = host.querySelector('[data-mail]');
    mail.textContent = D.brand.email;
    mail.href = 'mailto:' + D.brand.email;
  }

  /* ---------- bucati mici de subsol ------------------------------------- */
  function renderFooter() {
    var by = document.querySelector('[data-footer-by]');
    if (by) by.textContent = D.footer.by + ' © ' + D.brand.year;
    var st = document.querySelector('[data-footer-status]');
    if (st) st.innerHTML = '<span class="led"></span>' + esc(D.brand.status);
  }

  /* ---------- pornire ---------------------------------------------------- */
  renderNav();
  renderSimple();
  renderHud();
  renderFeed();
  renderCountdown();
  renderContract();
  renderTicker();
  renderLists();
  renderAccess();
  renderFooter();

  window.SITE_STATE = { data: D, glyphs: glyphs };
  document.dispatchEvent(new CustomEvent('site:rendered'));
})();
