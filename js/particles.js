/* =========================================================================
   Holograma de puncte (canvas 2D)
   - fiecare forma e esantionata pe o GRILA fixa, nu aleator: punctele cad in
     celule, deci forma se citeste clar, ca un afisaj cu LED-uri
   - punctele sunt patrate mici si nete, nu pete blurate
   - o banda de scanare trece peste forma si aprinde randurile
   - la schimbarea formei punctele se muta pe rand, nu se imprastie in ceata

   Fara nicio dependinta externa. Constantele de sus (GRID, PALETTE, SHAPES)
   sunt tot ce trebuie sa atingi ca sa schimbi aspectul.
   ========================================================================= */

(function () {
  'use strict';

  var SAMPLE = 240;                 // rezolutia desenului din care esantionam
  var GRID = 4;                     // pasul grilei in pixeli de esantionare
  var PALETTE = {
    dot: '198,255,61',              // limeul punctelor
    hot: '236,255,215'              // punctele aprinse de banda de scanare
  };

  /* ---------------- desenele formelor (alb pe negru) ------------------- */
  function hexPath(c, s, r) {
    var h = s / 2;
    c.beginPath();
    for (var i = 0; i < 6; i += 1) {
      var a = Math.PI / 180 * (60 * i - 90);
      var x = h + Math.cos(a) * r;
      var y = h + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  }

  var SHAPES = {
    /* carcasa agentului: hexagon dublu cu miez plin */
    hex: function (c, s) {
      c.lineWidth = s * 0.055;
      hexPath(c, s, s * 0.44);
      c.stroke();
      c.lineWidth = s * 0.035;
      hexPath(c, s, s * 0.24);
      c.stroke();
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.055, 0, 6.283);
      c.fill();
    },

    /* cub izometric: unitatea de calcul */
    cube: function (c, s) {
      var h = s / 2, w = s * 0.40, d = s * 0.22;
      c.lineWidth = s * 0.045;
      c.beginPath();
      c.moveTo(h, h - d * 2);
      c.lineTo(h + w, h - d);
      c.lineTo(h + w, h + d);
      c.lineTo(h, h + d * 2);
      c.lineTo(h - w, h + d);
      c.lineTo(h - w, h - d);
      c.closePath();
      c.moveTo(h - w, h - d); c.lineTo(h, h); c.lineTo(h + w, h - d);
      c.moveTo(h, h); c.lineTo(h, h + d * 2);
      c.stroke();
    },

    /* inel taiat, cu marcaje: rotita care se invarte */
    ring: function (c, s) {
      var h = s / 2, i;
      c.lineWidth = s * 0.09;
      c.beginPath();
      c.arc(h, h, s * 0.38, -0.4, Math.PI * 2 - 0.4);
      c.stroke();
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.arc(h, h, s * 0.18, 0.9, Math.PI * 2 + 0.4);
      c.stroke();
      c.lineWidth = s * 0.035;
      for (i = 0; i < 8; i += 1) {
        var a = i * Math.PI / 4;
        c.beginPath();
        c.moveTo(h + Math.cos(a) * s * 0.24, h + Math.sin(a) * s * 0.24);
        c.lineTo(h + Math.cos(a) * s * 0.31, h + Math.sin(a) * s * 0.31);
        c.stroke();
      }
    },

    /* fulger: executia */
    bolt: function (c, s) {
      c.beginPath();
      c.moveTo(s * 0.58, s * 0.04);
      c.lineTo(s * 0.26, s * 0.56);
      c.lineTo(s * 0.46, s * 0.56);
      c.lineTo(s * 0.40, s * 0.98);
      c.lineTo(s * 0.74, s * 0.44);
      c.lineTo(s * 0.53, s * 0.44);
      c.closePath();
      c.fill();
    },

    /* lumanari: randamentul */
    candles: function (c, s) {
      var bars = [
        [0.14, 0.56, 0.26],
        [0.33, 0.42, 0.36],
        [0.52, 0.48, 0.22],
        [0.71, 0.18, 0.54]
      ];
      var w = s * 0.11;
      bars.forEach(function (b) {
        var x = s * b[0], top = s * b[1], hgt = s * b[2];
        c.fillRect(x, top, w, hgt);
        c.fillRect(x + w * 0.38, top - s * 0.11, w * 0.24, hgt + s * 0.22);
      });
    },

    /* grila: reteaua de agenti */
    grid: function (c, s) {
      c.lineWidth = s * 0.014;
      for (var i = 1; i < 7; i += 1) {
        c.beginPath();
        c.moveTo(s * 0.10, s * i / 7); c.lineTo(s * 0.90, s * i / 7);
        c.moveTo(s * i / 7, s * 0.10); c.lineTo(s * i / 7, s * 0.90);
        c.stroke();
      }
      c.lineWidth = s * 0.02;
      c.strokeRect(s * 0.10, s * 0.10, s * 0.80, s * 0.80);
    }
  };

  /* forma dintr-o litera, cu fontul de titlu al site-ului */
  function letterShape(ch) {
    return function (c, s) {
      c.font = '900 ' + s * 1.0 + 'px "Archivo", Helvetica, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(ch, s / 2, s * 0.52);
    };
  }

  /* ---------------- esantionare: desen -> celule de grila -------------- */
  var cache = {};

  function sampleCells(key, draw) {
    if (cache[key]) return cache[key];

    var cv = document.createElement('canvas');
    cv.width = cv.height = SAMPLE;
    var c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    draw(c, SAMPLE);

    var data = c.getImageData(0, 0, SAMPLE, SAMPLE).data;
    var cells = [];
    var n = Math.floor(SAMPLE / GRID);

    for (var gy = 0; gy < n; gy += 1) {
      for (var gx = 0; gx < n; gx += 1) {
        /* celula e aprinsa daca are destui pixeli desenati in ea */
        var hit = 0;
        for (var y = 0; y < GRID; y += 1) {
          for (var x = 0; x < GRID; x += 1) {
            var px = gx * GRID + x, py = gy * GRID + y;
            if (data[(py * SAMPLE + px) * 4 + 3] > 100) hit += 1;
          }
        }
        if (hit >= GRID * GRID * 0.35) {
          cells.push([(gx + 0.5) / n - 0.5, (gy + 0.5) / n - 0.5]);
        }
      }
    }
    if (!cells.length) cells.push([0, 0]);

    cache[key] = cells;
    return cells;
  }

  /* pozitiile pentru un numar fix de particule, plecand de la celule */
  function buildStop(cells, count) {
    var pos = new Float32Array(count * 2);
    var on = new Float32Array(count);
    var len = cells.length;

    for (var i = 0; i < count; i += 1) {
      var idx, live;
      if (len >= count) {
        /* forma are mai multe celule decat particule: luam din toata forma,
           nu doar primele randuri */
        idx = Math.floor(i * len / count);
        live = 1;
      } else {
        idx = i % len;
        live = i < len ? 1 : 0;
      }
      pos[i * 2] = cells[idx][0];
      pos[i * 2 + 1] = cells[idx][1];
      on[i] = live;
    }
    return { pos: pos, on: on };
  }

  /* generator pseudo-aleator cu samanta: acelasi rezultat la fiecare
     incarcare a paginii */
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* halou mic, doar pentru punctele aprinse */
  function makeGlow(size) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(' + PALETTE.dot + ',0.55)');
    g.addColorStop(0.45, 'rgba(' + PALETTE.dot + ',0.14)');
    g.addColorStop(1, 'rgba(' + PALETTE.dot + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    return cv;
  }

  /* ===================================================================== */
  function Field(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.stops = this.opts.stops || [{ at: 0, shape: 'hex', scale: 0.5 }];
    this.count = window.matchMedia('(max-width: 900px)').matches ? 1500 : 2900;

    this.glow = makeGlow(26);

    this.rand = new Float32Array(this.count * 3);
    var rnd = seeded(9137);
    for (var i = 0; i < this.count; i += 1) {
      this.rand[i * 3] = rnd();                       // intarziere la morfare
      this.rand[i * 3 + 1] = rnd() < 0.14 ? 1 : 0;    // punct cu halou
      this.rand[i * 3 + 2] = 0.55 + rnd() * 0.45;     // luminozitate proprie
    }

    this.stars = [];
    var srnd = seeded(4242);
    for (var j = 0; j < 150; j += 1) {
      this.stars.push({ x: srnd(), y: srnd(), a: srnd() * 0.3 + 0.06, p: srnd() * 6.28 });
    }

    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.progress = 0;
    this.time = 0;
    this.prepare();
    this.bind();
    this.loop();
  }

  Field.prototype.prepare = function () {
    var self = this;
    this.stops.forEach(function (st) {
      var draw = st.letter ? letterShape(st.letter) : SHAPES[st.shape] || SHAPES.hex;
      var cells = sampleCells(st.letter ? 'L' + st.letter : st.shape, draw);
      var built = buildStop(cells, self.count);
      st.pos = built.pos;
      st.on = built.on;
    });
  };

  Field.prototype.bind = function () {
    var self = this;
    this.resize = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      self.w = self.cv.clientWidth;
      self.h = self.cv.clientHeight;
      self.cv.width = self.w * dpr;
      self.cv.height = self.h * dpr;
      self.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    this.resize();
    window.addEventListener('resize', this.resize);

    window.addEventListener('pointermove', function (e) {
      self.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      self.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    // fontul schimba forma literei, asa ca reesantionam cand e gata
    if (document.fonts && document.fonts.load) {
      document.fonts.load('900 120px "Archivo"')
        .then(function () { return document.fonts.ready; })
        .then(function () {
          cache = {};
          self.prepare();
        });
    }
  };

  /* progresul de scroll (0..1) pe toata inaltimea documentului */
  Field.prototype.readScroll = function () {
    var max = document.body.scrollHeight - window.innerHeight;
    this.progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };

  Field.prototype.loop = function () {
    var self = this;
    function frame() {
      self.readScroll();
      self.draw();
      requestAnimationFrame(frame);
    }
    frame();
  };

  Field.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, i;
    this.time += 0.006;
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.05;

    ctx.clearRect(0, 0, w, h);
    this.drawStars();

    /* intre ce doua etape suntem */
    var stops = this.stops, a = stops[0], b = stops[0], t = 0;
    for (i = 0; i < stops.length - 1; i += 1) {
      if (this.progress >= stops[i].at && this.progress <= stops[i + 1].at) {
        a = stops[i];
        b = stops[i + 1];
        t = (this.progress - a.at) / Math.max(0.0001, b.at - a.at);
        break;
      }
      if (this.progress > stops[i + 1].at) { a = b = stops[i + 1]; t = 0; }
    }

    var ease = t * t * (3 - 2 * t);
    var base = Math.min(w, h);
    var scale = (a.scale + (b.scale - a.scale) * ease) * base;
    var ox = w * (0.5 + ((a.x || 0) + (((b.x || 0) - (a.x || 0)) * ease)));
    var oy = h * (0.5 + ((a.y || 0) + (((b.y || 0) - (a.y || 0)) * ease)));
    var opacity = (a.opacity === undefined ? 1 : a.opacity);
    opacity += ((b.opacity === undefined ? 1 : b.opacity) - opacity) * ease;
    if (opacity <= 0.01) return;

    /* in timpul mutarii punctele se sting putin, ca sa nu para murdarie */
    var transit = a.pos === b.pos ? 1 : 1 - 0.45 * Math.sin(Math.PI * t);

    /* leganare in loc de rotatie completa, ca forma sa ramana recognoscibila */
    var rot = Math.sin(this.time * 0.38) * 0.26 + this.mouse.x * 0.26;
    var cos = Math.cos(rot), sin = Math.sin(rot);

    /* banda de scanare care urca peste forma */
    var band = ((this.time * 0.11) % 1.5) - 0.75;

    var dot = 'rgba(' + PALETTE.dot + ',';
    var hot = 'rgba(' + PALETTE.hot + ',';
    var size = Math.max(1.4, scale * 0.0075);
    var half = size / 2;

    for (i = 0; i < this.count; i += 1) {
      var i2 = i * 2, i3 = i * 3;
      var d = this.rand[i3];
      var lt = Math.min(1, Math.max(0, (ease - d * 0.4) / 0.6));
      lt = lt * lt * (3 - 2 * lt);

      var live = a.on[i] + (b.on[i] - a.on[i]) * lt;
      if (live < 0.05) continue;

      var x = a.pos[i2] + (b.pos[i2] - a.pos[i2]) * lt;
      var y = a.pos[i2 + 1] + (b.pos[i2 + 1] - a.pos[i2 + 1]) * lt;

      /* val fin de adancime: holograma respira, dar raman puncte pe grila */
      var z = Math.sin(x * 6.5 + this.time * 1.3) * 0.05 + Math.cos(y * 5 - this.time) * 0.03;

      var rx = x * cos - z * sin;
      var rz = x * sin + z * cos;
      var persp = 1 / (1 + rz * 0.5);

      var sx = ox + rx * scale * persp + this.mouse.x * 12 * persp;
      var sy = oy + y * scale * persp + this.mouse.y * 9 * persp;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      /* cat de aproape e punctul de banda de scanare */
      var near = 1 - Math.min(1, Math.abs(y - band) / 0.07);
      var alpha = opacity * transit * live * this.rand[i3 + 2] * (0.42 + persp * 0.3);

      if (near > 0) {
        ctx.fillStyle = hot + Math.min(1, alpha + near * 0.75).toFixed(3) + ')';
        var g = size * (1 + near);
        ctx.fillRect(sx - g / 2, sy - g / 2, g, g);
      } else {
        ctx.fillStyle = dot + Math.min(1, alpha).toFixed(3) + ')';
        ctx.fillRect(sx - half, sy - half, size, size);
      }

      if (this.rand[i3 + 1]) {
        ctx.globalAlpha = Math.min(1, alpha * 0.9);
        ctx.drawImage(this.glow, sx - 13, sy - 13, 26, 26);
        ctx.globalAlpha = 1;
      }
    }
  };

  Field.prototype.drawStars = function () {
    var ctx = this.ctx, w = this.w, h = this.h, t = this.time;
    for (var i = 0; i < this.stars.length; i += 1) {
      var s = this.stars[i];
      var y = (s.y + this.progress * 0.1) % 1;
      ctx.fillStyle = 'rgba(198,255,61,' + (s.a * (0.5 + 0.5 * Math.sin(t * 2 + s.p))).toFixed(3) + ')';
      ctx.fillRect(s.x * w + this.mouse.x * 5, y * h + this.mouse.y * 5, 1, 1);
    }
  };

  window.ParticleField = Field;
})();
