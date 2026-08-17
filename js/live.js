/* =========================================================================
   Date reale.

   Doua surse, amandoua optionale, configurate in js/content.js -> SITE.live:

   1. `endpoint` - un URL propriu care intoarce JSON-ul de mai jos. Cat timp e
      gol, pagina ramane pe cifrele scrise in content.js si nu iese nicio
      cerere catre el.

        {
          "stats": { "jobs": 128407, "paid": 1942.6, "agents": 3184 },
          "feed":  ["RINGER #0204 · CLOCK IN · +0.412 ETH", "..."],
          "meta":  "POT 68% FULL · NEXT CLOCK IN ~14 MIN"
        }

      Cheile din `stats` sunt cele din `SITE.stats[].key`. Orice camp lipsa e
      ignorat, deci poti intoarce doar ce ai.

   2. `ethPrice` - pretul ETH/USD de la Coinbase. Public, fara cheie, cu CORS
      deschis, deci merge dintr-un site static, fara backend.

   Daca o cerere pica, pagina ramane pe ce avea. Nimic nu se strica.
   ========================================================================= */

(function () {
  'use strict';

  var CFG = (window.SITE && window.SITE.live) || {};

  /* ---------- cifrele din banda ----------------------------------------- */
  function odoByKey(key) {
    var list = (window.SITE_STATE && window.SITE_STATE.odo) || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].node.getAttribute('data-key') === key) return list[i];
    }
    return null;
  }

  function applyStats(stats) {
    if (!stats) return;
    Object.keys(stats).forEach(function (key) {
      var o = odoByKey(key);
      var v = parseFloat(stats[key]);
      if (!o || isNaN(v)) return;
      o.drift = 0;              // cifra vine de la sursa, nu o mai inventam
      o.setTarget(v);
    });
  }

  /* ---------- feed-ul din hero ------------------------------------------ */
  function applyFeed(lines) {
    if (!Array.isArray(lines) || !lines.length) return;
    var host = document.querySelector('[data-feed-list]');
    if (!host) return;
    host.innerHTML = lines.slice(0, 12).map(function (l) {
      return '<li class="mono">' + String(l)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</li>';
    }).join('');
    var count = document.querySelector('[data-feed-count]');
    if (count) count.textContent = ('0' + Math.min(99, lines.length)).slice(-2);
  }

  /* ---------- randul de sub hero ---------------------------------------- */
  function applyMeta(text) {
    if (!text) return;
    var el = document.querySelector('[data-t="hero.meta"]');
    if (el) el.textContent = text;
  }

  /* ---------- sursa proprie --------------------------------------------- */
  function pullOwn() {
    if (!CFG.endpoint) return;
    fetch(CFG.endpoint, { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        applyStats(d.stats);
        applyFeed(d.feed);
        applyMeta(d.meta);
      })
      .catch(function () { /* ramanem pe ce era in pagina */ });
  }

  /* ---------- pretul ETH ------------------------------------------------- */
  var lastEth = null;

  function pullEth() {
    var chip = document.querySelector('[data-eth]');
    if (!chip || !CFG.ethPrice) return;

    fetch(CFG.ethUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var v = parseFloat(d && d.data && d.data.amount);
        if (isNaN(v)) throw new Error('no amount');

        var dir = lastEth === null ? 0 : (v > lastEth ? 1 : (v < lastEth ? -1 : 0));
        lastEth = v;

        chip.innerHTML = '<i class="dot"></i>ETH $' +
          v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        chip.classList.add('is-on');
        chip.classList.toggle('is-up', dir > 0);
        chip.classList.toggle('is-down', dir < 0);
      })
      .catch(function () {
        chip.classList.remove('is-on');   // fara pret, chipul nu se vede
      });
  }

  /* ---------- pornire ---------------------------------------------------- */
  function boot() {
    if (CFG.endpoint) {
      pullOwn();
      setInterval(pullOwn, Math.max(5000, CFG.refreshMs || 30000));
    }
    if (CFG.ethPrice) {
      pullEth();
      setInterval(pullEth, Math.max(15000, CFG.ethRefreshMs || 60000));
    }
  }

  if (window.SITE_STATE) boot();
  else document.addEventListener('site:rendered', boot);
})();
