/* =========================================================================
   STONK AGENTS - motorul paginii.
   Fara biblioteci. Continutul vine din js/content.js, HTML-ul nu contine texte.

   Sectiuni:
     1. Unelte
     2. Legarea continutului
     3. Bara de sus si meniu
     4. Graficul din hero
     5. Efecte de pointer (cursor, lumina, magnet, inclinare)
     6. Aparitia la scroll si contoarele
     7. Banda, feedul, clasele, pasii
     8. Numaratoarea si contractul
     9. Formularul
    10. Date reale
   ========================================================================= */
(() => {
  'use strict'

  const S = window.SITE
  if (!S) return

  /* ---------- 1. Unelte ---------- */
  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  /** ia o valoare din SITE dupa cale: "hero.titleTop" */
  const pick = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S)

  /* statusul lansarii decide textul butoanelor si eticheta */
  const L = S.launch || {}
  const statusLabel = (L.label && L.label[L.status]) || ''
  const ctaText = (L.cta && L.cta[L.status]) || ''
  const fill = (s) => String(s).replace(/\{\{cta\}\}/g, ctaText).replace(/\{\{status\}\}/g, statusLabel)

  /** scrie text, dar transforma [[bucata]] in verde */
  const write = (node, raw) => {
    const s = fill(raw ?? '')
    node.textContent = ''
    for (const part of s.split(/(\[\[[^\]]*\]\])/g)) {
      if (!part) continue
      if (part.startsWith('[[')) node.appendChild(el('em', 'hl', part.slice(2, -2)))
      else node.appendChild(document.createTextNode(part))
    }
  }

  /* ---------- 2. Legarea continutului ---------- */
  $$('[data-t]').forEach((n) => write(n, pick(n.dataset.t)))
  $$('[data-ph]').forEach((n) => (n.placeholder = fill(pick(n.dataset.ph) || '')))
  const brandNode = $('[data-brand]')
  if (brandNode) brandNode.textContent = S.brand.name

  /* ---------- 3. Bara de sus si meniu ---------- */
  const nav = $('[data-nav-bar]')
  const links = $('[data-nav]')
  const menu = $('[data-menu]')
  const burger = $('[data-burger]')

  ;(S.nav || []).forEach((item) => {
    const a = el('a', null, item.label)
    a.href = item.href
    links.appendChild(a)
    const b = a.cloneNode(true)
    menu.appendChild(b)
  })
  burger?.addEventListener('click', () => {
    menu.classList.toggle('on')
    burger.classList.toggle('on')
  })
  menu?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      menu.classList.remove('on')
      burger.classList.remove('on')
    }
  })

  /* linkul activ, dupa sectiunea de pe ecran */
  const sections = (S.nav || []).map((i) => $(i.href)).filter(Boolean)
  const navLinks = $$('a', links)

  /* ---------- 4. Graficul din hero ---------- */
  /* Semnatura vizuala: o linie care se deseneaza singura, cu umplere in
     degrade si o bila care pulseaza in varf. Datele sunt o plimbare aleatoare
     cu samanta fixa, ca sa arate la fel la fiecare incarcare. */
  const chart = $('[data-chart]')
  if (chart && !reduced) {
    const ctx = chart.getContext('2d')
    let w = 0
    let h = 0
    let dpr = 1
    const pts = []
    let seed = 1337
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2)
      w = chart.clientWidth
      h = chart.clientHeight
      chart.width = w * dpr
      chart.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    addEventListener('resize', resize)

    let v = 0.42
    for (let i = 0; i < 140; i++) {
      v = clamp(v + (rand() - 0.46) * 0.055, 0.08, 0.92)
      pts.push(v)
    }

    let t = 0
    const draw = () => {
      if (w === 0) return
      ctx.clearRect(0, 0, w, h)

      /* linii orizontale rare, ca la un grafic de bursa */
      ctx.strokeStyle = 'rgba(255,255,255,.05)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      const span = 90
      const start = t % (pts.length - span)
      const step = w / (span - 1)
      const yOf = (p) => h - p * h * 0.82 - h * 0.06

      ctx.beginPath()
      for (let i = 0; i < span; i++) {
        const p = pts[Math.floor(start) + i]
        const x = i * step
        const y = yOf(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      /* umplerea sub linie */
      const fillPath = new Path2D()
      fillPath.moveTo(0, h)
      for (let i = 0; i < span; i++) {
        fillPath.lineTo(i * step, yOf(pts[Math.floor(start) + i]))
      }
      fillPath.lineTo(w, h)
      fillPath.closePath()
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(0,200,5,.28)')
      grad.addColorStop(1, 'rgba(0,200,5,0)')
      ctx.fillStyle = grad
      ctx.fill(fillPath)

      ctx.strokeStyle = '#00c805'
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(0,200,5,.85)'
      ctx.shadowBlur = 16
      ctx.stroke()
      ctx.shadowBlur = 0

      /* bila din varf */
      const lastY = yOf(pts[Math.floor(start) + span - 1])
      ctx.beginPath()
      ctx.arc(w - 1, lastY, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#00ff2b'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(w - 1, lastY, 9 + Math.sin(t * 0.12) * 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,255,43,.28)'
      ctx.lineWidth = 1
      ctx.stroke()

      t += 0.08
      raf = requestAnimationFrame(draw)
    }
    let raf = requestAnimationFrame(draw)
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(draw)
    })
  }

  /* ---------- 5. Efecte de pointer ---------- */
  const cursor = $('[data-cursor]')
  const spot = $('[data-spot]')
  let mx = innerWidth / 2
  let my = innerHeight / 2

  addEventListener('pointermove', (e) => {
    mx = e.clientX
    my = e.clientY
    if (cursor) {
      cursor.style.transform = `translate(${mx}px, ${my}px)`
      cursor.classList.add('on')
    }
    if (spot) {
      spot.style.setProperty('--mx', `${mx}px`)
      spot.style.setProperty('--my', `${my}px`)
    }
  })
  $$('a, button, [data-magnet]').forEach((n) => {
    n.addEventListener('pointerenter', () => cursor?.classList.add('hot'))
    n.addEventListener('pointerleave', () => cursor?.classList.remove('hot'))
  })

  /* butoane magnetice */
  if (!reduced) {
    $$('[data-magnet]').forEach((n) => {
      n.addEventListener('pointermove', (e) => {
        const r = n.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.22
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.28
        n.style.transform = `translate(${dx}px, ${dy}px)`
      })
      n.addEventListener('pointerleave', () => (n.style.transform = ''))
    })
  }

  /* cardul din hero se inclina spre cursor */
  const tilt = $('[data-tilt]')
  if (tilt && !reduced) {
    tilt.addEventListener('pointermove', (e) => {
      const r = tilt.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      tilt.style.transform = `perspective(800px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg)`
    })
    tilt.addEventListener('pointerleave', () => (tilt.style.transform = ''))
  }

  /* ---------- 6. Aparitia la scroll si contoarele ---------- */
  const seen = new WeakSet()
  const show = (n) => {
    if (seen.has(n)) return
    seen.add(n)
    n.classList.add('in')
    if (n.dataset.odo) runOdo(n)
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && show(e.target)),
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
  )
  const watch = (n) => io.observe(n)

  /* plasa de siguranta: intr-un tab ascuns observatorul nu porneste, iar la
     revenire pagina ar ramane goala. Verificam si manual ce e pe ecran. */
  const sweep = () => {
    $$('[data-reveal], .step, [data-odo]').forEach((n) => {
      const r = n.getBoundingClientRect()
      if (r.top < innerHeight * 0.92 && r.bottom > 0) show(n)
    })
  }

  const runOdo = (n) => {
    const target = Number(n.dataset.odo)
    const suffix = n.dataset.suffix || ''
    if (!Number.isFinite(target)) return
    /* Intr-un tab de fundal rAF nu ruleaza, deci contorul ar ramane pe zero
       pana cand omul se uita la pagina. Cine deschide linkul intr-un tab nou
       si revine peste un minut ar vedea trei zerouri. Punem cifra pe loc si
       animam doar cand pagina chiar se vede. */
    if (reduced || document.hidden) {
      n.textContent = target.toLocaleString('en-US') + suffix
      return
    }
    const dur = 1100
    const t0 = performance.now()
    const tick = (now) => {
      const p = clamp((now - t0) / dur, 0, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      n.textContent = Math.round(target * eased).toLocaleString('en-US') + suffix
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /* text care se descifreaza */
  const scramble = (n) => {
    if (reduced) return
    const final = n.textContent
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·'
    let frame = 0
    const total = 26
    const id = setInterval(() => {
      frame++
      n.textContent = final
        .split('')
        .map((c, i) => (c === ' ' ? ' ' : i < (frame / total) * final.length ? c : chars[(Math.random() * chars.length) | 0]))
        .join('')
      if (frame >= total) {
        clearInterval(id)
        n.textContent = final
      }
    }, 28)
    setTimeout(() => {
      clearInterval(id)
      n.textContent = final
    }, 1600)
  }

  /* ---------- 7. Banda, feed, clase, pasi ---------- */
  const tape = $('[data-tape]')
  if (tape) {
    /* de doua ori aceeasi lista: animatia muta banda cu exact o jumatate,
       deci trecerea nu se vede */
    for (let i = 0; i < 2; i++) {
      ;(S.ticker || []).forEach((t) => tape.appendChild(el('span', null, t)))
    }
  }

  /* feedul din hero, randuri care intra pe rand */
  const feedBox = $('[data-feed]')
  let feed = (S.hero.feed || []).slice()
  let feedIdx = 0
  const pushFeedRow = () => {
    if (!feedBox || feed.length === 0) return
    const item = feed[feedIdx % feed.length]
    feedIdx++
    const row = el('div', 'quote-row')
    const left = el('b', null, Array.isArray(item) ? item[0] : String(item))
    if (Array.isArray(item) && item[1]) left.appendChild(el('u', null, item[1]))
    row.appendChild(left)
    row.appendChild(el('em', null, Array.isArray(item) ? item[2] || '' : ''))
    feedBox.appendChild(row)
    while (feedBox.children.length > 4) feedBox.removeChild(feedBox.firstChild)
  }
  for (let i = 0; i < 4; i++) pushFeedRow()
  if (!reduced) setInterval(pushFeedRow, 2600)

  /* cifrele */
  const statGrid = $('[data-stats]')
  ;(S.stats || []).forEach((s) => {
    const box = el('div', 'stat')
    const b = el('b', null, '0')
    b.dataset.odo = String(s.value)
    if (s.suffix) b.dataset.suffix = s.suffix
    b.dataset.key = s.key
    if (s.live) {
      b.dataset.liveKey = s.live.key
      b.dataset.liveLabel = s.live.label || s.label
      if (s.live.suffix != null) b.dataset.liveSuffix = s.live.suffix
    }
    box.appendChild(b)
    const lab = el('span', null, s.label)
    box.appendChild(lab)
    b.labelNode = lab
    statGrid.appendChild(box)
    watch(b)
  })

  /* clasele, ca sina orizontala */
  const GLYPHS = {
    bell: '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z"/><path d="M10 22h4"/>',
    pick: '<path d="M3 21 14 10"/><path d="M8 6c4-3 9-3 13 1-4-1-7 0-9 2"/><path d="M13 5c-1 3-1 6 1 8"/>',
    box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
    vote: '<path d="M4 20h16"/><path d="M6 16V9l6-5 6 5v7"/><path d="M9 16v-4h6v4"/>',
    truck: '<path d="M2 7h11v9H2z"/><path d="M13 10h4l4 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'
  }
  const track = $('[data-track]')
  ;(S.classes.items || []).forEach((c) => {
    const card = el('article', 'card')
    const top = el('div', 'card-top')
    top.appendChild(el('span', 'card-code', c.code))
    /* Starea reala a fiecarei clase. Trei dintre meserii nu exista inca pe
       lant, iar o pagina care le arata pe toate la fel promite ceva ce nu
       poate livra. Un badge onest arata mai bine decat o promisiune. */
    if (c.status) {
      const st = el('span', 'card-state card-state-' + c.status.toLowerCase(), c.status)
      top.appendChild(st)
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', 'card-glyph')
    svg.innerHTML = GLYPHS[c.glyph] || GLYPHS.box
    top.appendChild(svg)
    card.appendChild(top)
    card.appendChild(el('h3', null, c.name))
    card.appendChild(el('p', 'card-role', c.role))
    card.appendChild(el('p', null, c.job))
    const earns = el('div', 'card-earns')
    earns.appendChild(el('span', null, 'EARNS'))
    earns.appendChild(el('b', null, c.earns))
    card.appendChild(earns)
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--cx', `${e.clientX - r.left}px`)
      card.style.setProperty('--cy', `${e.clientY - r.top}px`)
    })
    track.appendChild(card)
  })

  /* sina: sectiunea creste cat trackul, iar scrollul vertical il trage lateral */
  const rail = $('[data-rail]')
  const railBar = $('[data-rail-bar]')
  const layoutRail = () => {
    if (!rail || !track) return
    if (innerWidth <= 900) {
      rail.style.height = ''
      track.style.transform = ''
      return
    }
    const dist = Math.max(0, track.scrollWidth - innerWidth + 40)
    rail.style.height = `${innerHeight + dist}px`
  }
  const moveRail = () => {
    if (!rail || !track || innerWidth <= 900) return
    const r = rail.getBoundingClientRect()
    const dist = Math.max(0, track.scrollWidth - innerWidth + 40)
    const p = clamp(-r.top / (rail.offsetHeight - innerHeight || 1), 0, 1)
    track.style.transform = `translate3d(${-p * dist}px,0,0)`
    if (railBar) railBar.style.transform = `scaleX(${0.22 + p * 0.78})`
  }

  /* pasii */
  const steps = $('[data-steps]')
  ;(S.loop.steps || []).forEach((s) => {
    const li = el('li', 'step')
    li.appendChild(el('span', 'step-n', s.n))
    li.appendChild(el('h3', null, s.title))
    li.appendChild(el('p', null, s.body))
    steps.appendChild(li)
    watch(li)
  })

  /* ---------- 8. Numaratoarea si contractul ---------- */
  const labelNode = $('[data-launch-label]')
  if (labelNode) labelNode.textContent = statusLabel

  const countBox = $('[data-count]')
  const countLabel = $('[data-count-label]')
  const units = L.units || ['DAYS', 'HRS', 'MIN', 'SEC']
  const cells = units.map((u) => {
    const c = el('div', 'count-cell')
    const b = el('b', null, '00')
    c.appendChild(b)
    c.appendChild(el('span', null, u))
    countBox?.appendChild(c)
    return b
  })
  const target = L.date ? new Date(L.date).getTime() : 0
  const tickCount = () => {
    if (!countBox) return
    const left = target - Date.now()
    if (!target || left <= 0) {
      countBox.style.display = 'none'
      if (countLabel) countLabel.textContent = L.liveLabel || ''
      return
    }
    if (countLabel) countLabel.textContent = L.countdownLabel || ''
    const s = Math.floor(left / 1000)
    const vals = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60]
    cells.forEach((c, i) => (c.textContent = String(vals[i]).padStart(2, '0')))
  }
  tickCount()
  setInterval(tickCount, 1000)

  const contract = $('[data-contract]')
  if (contract) {
    const c = L.contract || {}
    contract.textContent = ''
    contract.appendChild(document.createTextNode(`${c.label || 'CONTRACT'} · `))
    if (c.address) {
      const a = el('a', null, `${c.address.slice(0, 8)}…${c.address.slice(-6)}`)
      a.href = (c.explorer || '') + c.address
      a.target = '_blank'
      a.rel = 'noopener'
      contract.appendChild(a)
      const btn = el('button', null, c.copy || 'COPY')
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(c.address)
          btn.textContent = c.copied || 'COPIED'
          setTimeout(() => (btn.textContent = c.copy || 'COPY'), 1600)
        } catch {
          /* fara clipboard: lasam adresa la vedere, omul o copiaza singur */
        }
      })
      contract.appendChild(btn)
    } else {
      contract.appendChild(document.createTextNode(c.soon || 'NOT DEPLOYED YET'))
    }
  }

  /* ---------- 9. Formularul ---------- */
  const klass = $('[data-klass]')
  if (klass) {
    const opts = ['', ...(S.classes.items || []).map((c) => c.name), 'Undecided']
    opts.forEach((o, i) => {
      const op = el('option', null, i === 0 ? S.access.klassPh || 'Select' : o)
      op.value = i === 0 ? '' : o
      klass.appendChild(op)
    })
  }

  const form = $('[data-form]')
  const msg = $('[data-msg]')
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('button[type=submit]', form)
    const data = Object.fromEntries(new FormData(form).entries())
    if (!data.wallet) {
      msg.className = 'form-msg mono err'
      msg.textContent = 'WALLET IS REQUIRED.'
      return
    }
    const a = S.access
    btn.disabled = true
    const original = btn.textContent
    btn.textContent = a.sending || 'SENDING'
    msg.className = 'form-msg mono'
    msg.textContent = ''

    const payload = { ...data, source: 'stonk-agents', status: L.status }
    let ok = false
    try {
      if (a.web3formsKey) {
        const r = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ access_key: a.web3formsKey, subject: 'Stonk Agents whitelist', ...payload })
        })
        ok = r.ok && (await r.json()).success === true
      } else if (a.endpoint) {
        const r = await fetch(a.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
        ok = r.ok
      } else {
        /* ultima varianta, si nu e buna: pe telefoanele fara client de mail
           omul apasa si nu se intampla nimic. Nu lansa asa. */
        location.href = `mailto:${S.brand.email}?subject=Whitelist&body=${encodeURIComponent(JSON.stringify(payload, null, 2))}`
        msg.className = 'form-msg mono'
        msg.textContent = a.mailto || ''
        btn.disabled = false
        btn.textContent = original
        return
      }
    } catch {
      ok = false
    }

    btn.disabled = false
    btn.textContent = original
    /* ecranul de reusita apare DOAR daca cererea a reusit */
    if (ok) {
      msg.className = 'form-msg mono ok'
      msg.textContent = a.ok
      form.reset()
    } else {
      msg.className = 'form-msg mono err'
      msg.textContent = a.err
    }
  })

  /* ---------- 10. Date reale ---------- */
  const live = S.live || {}

  /* pretul ETH, public, fara backend */
  const ethNode = $('[data-eth]')
  const loadEth = async () => {
    if (!live.ethPrice || !ethNode) return
    try {
      const r = await fetch(live.ethUrl, { signal: AbortSignal.timeout(8000) })
      const j = await r.json()
      const p = Number(j?.data?.amount)
      if (Number.isFinite(p)) {
        ethNode.hidden = false
        ethNode.textContent = ''
        ethNode.appendChild(document.createTextNode('ETH '))
        ethNode.appendChild(el('b', null, `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`))
      }
    } catch {
      /* daca nu raspunde, nu aratam nimic. Mai bine gol decat gresit. */
    }
  }
  loadEth()
  if (live.ethRefreshMs) setInterval(loadEth, live.ethRefreshMs)

  /* cifrele si feedul de la Courier */
  const loadLive = async () => {
    if (!live.endpoint) return
    try {
      const r = await fetch(live.endpoint, { signal: AbortSignal.timeout(9000) })
      if (!r.ok) return
      const j = await r.json()
      if (j.stats) {
        $$('[data-live-key]').forEach((n) => {
          const v = j.stats[n.dataset.liveKey]
          if (typeof v !== 'number') return
          n.dataset.odo = String(Math.round(v))
          if (n.dataset.liveSuffix != null) n.dataset.suffix = n.dataset.liveSuffix
          if (n.labelNode && n.dataset.liveLabel) n.labelNode.textContent = n.dataset.liveLabel
          seen.delete(n)
          show(n)
        })
      }
      if (Array.isArray(j.feed) && j.feed.length) {
        feed = j.feed
        feedIdx = 0
      }
      const tag = $('[data-t="hero.feedTag"]')
      if (tag && j.feed?.length) tag.textContent = 'LIVE'
    } catch {
      /* ramanem pe cifrele din content.js */
    }
  }
  loadLive()
  if (live.refreshMs) setInterval(loadLive, live.refreshMs)

  /* ---------- subsol ---------- */
  const mail = $('[data-mail]')
  if (mail) {
    mail.textContent = S.brand.email
    mail.href = `mailto:${S.brand.email}`
  }
  const socials = $('[data-socials]')
  ;(S.brand.socials || []).forEach((s) => {
    /* fara url NU punem '#': un subsol de linkuri moarte arata a proiect
       abandonat. Punem eticheta SOON, neclickabila. */
    if (s.url) {
      const a = el('a', null, s.label)
      a.href = s.url
      a.target = '_blank'
      a.rel = 'noopener'
      socials.appendChild(a)
    } else {
      socials.appendChild(el('span', null, s.label))
    }
  })
  const footNote = $('[data-foot-note]')
  if (footNote) footNote.textContent = `${S.brand.name} · ${S.brand.year} · ${S.footer.note}`

  /* ---------- pornire ---------- */
  const progress = $('[data-progress]')
  const onScroll = () => {
    const y = scrollY
    nav?.classList.toggle('stuck', y > 12)
    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight
      progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`
    }
    moveRail()
    let active = -1
    sections.forEach((s, i) => {
      if (s.getBoundingClientRect().top < innerHeight * 0.4) active = i
    })
    navLinks.forEach((a, i) => a.classList.toggle('on', i === active))
  }

  $$('[data-reveal]').forEach(watch)
  $$('.scramble').forEach((n) => scramble(n))
  layoutRail()
  onScroll()
  sweep()

  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', () => {
    layoutRail()
    moveRail()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sweep()
  })
  /* daca fonturile intra tarziu, latimea trackului se schimba */
  document.fonts?.ready.then(() => {
    layoutRail()
    moveRail()
  })

  /* Ancora din adresa se rezolva ABIA dupa ce sina isi ia inaltimea. Altfel
     browserul sare la o pozitie calculata inainte ca sectiunea flotei sa
     creasca, si aterizezi in alta parte a paginii. */
  if (location.hash) {
    const goToHash = () => {
      const t = document.querySelector(location.hash)
      if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' })
    }
    requestAnimationFrame(goToHash)
    setTimeout(goToHash, 260)
    document.fonts?.ready.then(() => setTimeout(goToHash, 60))
  }
})()
