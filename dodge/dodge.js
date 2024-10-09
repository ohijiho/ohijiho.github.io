function makeVelocity(speed, angle) {
  return { vx: speed * Math.cos(angle), vy: speed * Math.sin(angle) };
}
//
// Standard Normal variate using Box-Muller transform.
function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random(); // Converting [0,1) to (0,1]
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  // Transform to the desired mean and standard deviation:
  return z * stdev + mean;
}

class Game {
  constructor(tickRate) {
    this.#canvas = document.createElement("canvas");
    this.#units = {
      next: null,
      tail: null,
      nextId: 0n,
    };
    this.#units.tail = this.#units;
    this.#stats = {
      score: 0,
      bulletCount: 0,
      tick: 0,
      survivedTicks: 0,
      totalTickTime: 0,
      totalRedrawCount: 0,
      totalRedrawTime: 0,
      avgTickTime: 0,
      avgRedrawTime: 0,
    };

    this.#templates = {
      player: {
        type: "player",
        r: 0.1,
        mass: 1,
        fillStyle: "yellow",
        collisionToBounds: "repulsion",
        checkCollision: true,
      },
      bullet: {
        type: "bullet",
        r: 0.02,
        mass: 0.1,
        fillStyle: "red",
        collisionToBounds: "pass",
        checkCollision: true,
      },
      largeBullet: {
        type: "bullet",
        r: 0.1,
        mass: 3,
        fillStyle: "red",
        collisionToBounds: "pass",
        checkCollision: true,
      },
      giantBullet: {
        type: "bullet",
        r: 0.5,
        mass: 100,
        fillStyle: "hotpink",
        collisionToBounds: "pass",
        checkCollision: true,
      },
    };

    this.#player = this.createUnit(this.#templates.player, 0, 0);

    const innerBounds = {
      left: -4,
      right: 4,
      top: 3,
      bottom: -3,
    };
    const outerRadius =
      ((innerBounds.right - innerBounds.left) ** 2 +
        (innerBounds.top - innerBounds.bottom) ** 2) **
        0.5 /
        2 +
      1;

    this.#world = {
      innerBounds,
      outerBounds: {
        left: -outerRadius,
        right: outerRadius,
        top: outerRadius,
        bottom: -outerRadius,
      },
      visibleRegion: {
        center: { x: 0, y: 0 },
        minWidth: 8,
        minHeight: 6,
      },
    };
    this.#config = {
      background: "black",
      text: "white",
      grid: false,
      binSize: 1,
      spawnRate: 12 / tickRate,
      spawnTable: [
        [0.9, this.#templates.bullet],
        [0.09, this.#templates.largeBullet],
        [0.01, this.#templates.giantBullet],
      ],
      lnSpawnRateGrowth: 0.012 / tickRate,
      bulletSpeed: 0.9 / tickRate,
      lnBulletSpeedGrowth: 0.01 / tickRate,
      bulletSpeedDeviationBase: 1.5,
      playerMaxSpeed: 2.5 / tickRate,
      tickRate,

      avgStatsRecencyWeight: 1 / 120,
    };
  }

  #config;
  #canvas;
  #units;
  #player;
  #stats;
  #templates;
  #world;
  #inputState;

  tick() {
    // if (this.#player.removed) return;

    const t0 = new Date().getTime();

    const bounds = this.#world.innerBounds;
    const ob = this.#world.outerBounds;
    for (let u = this.#units.next; u !== null; u = u.next) {
      u.x += u.vx;
      u.y += u.vy;

      const r = u.r;

      if (
        u.x - r < bounds.left ||
        u.x + r > bounds.right ||
        u.y - r < bounds.bottom ||
        u.y + r > bounds.top
      ) {
        if (u.removed) continue;
        switch (u.template.collisionToBounds) {
          case "repulsion":
            u.x = Math.max(u.x, bounds.left + r);
            u.x = Math.min(u.x, bounds.right - r);
            u.y = Math.max(u.y, bounds.bottom + r);
            u.y = Math.min(u.y, bounds.top - r);
            break;
          case "destroy":
            u.removed = true;
            break;
          case "pass":
            break;
          default:
            console.warn(
              `invalid collision handling: ${u.template.collisionToBounds}`,
            );
            break;
        }
      }

      if (u.x < ob.left || u.x > ob.right || u.y < ob.bottom || u.y > ob.top)
        u.removed = true;
    }

    this.#doCollision();

    for (
      let i = 0,
        n =
          this.#config.spawnRate *
            Math.exp(this.#config.lnSpawnRateGrowth * this.#stats.tick) -
          Math.random();
      i < n;
      i++
    ) {
      const bounds = this.#world.innerBounds;
      const center = {
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2,
      };

      let p = Math.random();
      let tmp;
      for (const [prob, t] of this.#config.spawnTable) {
        if (p < prob) {
          tmp = t;
          break;
        }
        p -= prob;
      }

      const dist =
        tmp.r +
        ((bounds.right - bounds.left) ** 2 +
          (bounds.top - bounds.bottom) ** 2) **
          0.5 /
          2;
      const th = Math.random() * 2 * Math.PI;
      this.createUnit(
        tmp,
        center.x + dist * Math.cos(th),
        center.y + dist * Math.sin(th),
        {
          ...makeVelocity(
            this.#config.bulletSpeed *
              Math.exp(this.#config.lnBulletSpeedGrowth * this.#stats.tick) *
              this.#config.bulletSpeedDeviationBase ** gaussianRandom(),
            th + Math.PI + gaussianRandom(),
          ),
        },
      );
      if (!this.#player.removed) this.#stats.score++;
    }

    for (let u = this.#units; ; ) {
      if (u.next === null) {
        this.#units.tail = u;
        break;
      }
      if (u.next.removed) u.next = u.next.next;
      else u = u.next;
    }

    {
      let n = 0;
      for (let u = this.#units.next; u !== null; u = u.next) {
        if (u.type == "bullet") n++;
      }
      this.#stats.bulletCount = n;
    }
    this.#stats.tick++;
    if (!this.#player.removed) this.#stats.survivedTicks++;

    const time = new Date().getTime() - t0;
    this.#stats.totalTickTime += time;
    const w = Math.max(
      1 / this.#stats.tick,
      this.#config.avgStatsRecencyWeight,
    );
    this.#stats.avgTickTime = this.#stats.avgTickTime * (1 - w) + time * w;
  }

  #doCollision() {
    this.#doCollisionBinAlgorithm();
  }

  #binsBuffer = [];
  #doCollisionBinAlgorithm() {
    const bounds = this.#world.outerBounds;
    const binSize = this.#config.binSize;
    const n = Math.ceil((bounds.right - bounds.left) / binSize);
    const m = Math.ceil((bounds.top - bounds.bottom) / binSize);
    const bins = this.#binsBuffer;
    if (bins.length !== n * m) {
      bins.length = n * m;
    }
    for (let i = 0; i < bins.length; i++) bins[i] = [];

    for (let u = this.#units.next; u !== null; u = u.next) {
      const x = u.x - bounds.left,
        y = u.y - bounds.bottom;
      const r = u.r;
      const i0 = Math.max(0, Math.floor((y - r) / binSize)),
        i1 = Math.min(m - 1, Math.floor((y + r) / binSize));
      const j0 = Math.max(0, Math.floor((x - r) / binSize)),
        j1 = Math.min(n - 1, Math.floor((x + r) / binSize));
      let bi = i0 * n + j0;
      const stride = n - (j1 - j0 + 1);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          bins[bi].push(u);
          bi++;
        }
        bi += stride;
      }
    }

    const tested = new Set();

    for (let bi = 0; bi < bins.length; bi++) {
      const bin = bins[bi];
      for (let i = 0; i < bin.length; i++) {
        const u = bin[i];
        for (let j = i + 1; j < bin.length; j++) {
          const v = bin[j];

          const r = u.r + v.r;
          const x = ((u.x - bounds.left) * v.r + (v.x - bounds.left) * u.r) / r;
          const y =
            ((u.y - bounds.bottom) * v.r + (v.y - bounds.bottom) * u.r) / r;
          if (bi !== Math.floor(y / binSize) * n + Math.floor(x / binSize))
            continue;

          this.#testAndHandleCollision(u, v);

          const key = `${u.id * v.id}_${u.id + v.id}`;
          if (tested.has(key)) console.warn("double collision");
          tested.add(key);
        }
      }
    }
  }

  #doCollisionNaive() {
    for (let u = this.#units.next; u !== null; u = u.next) {
      if (u.removed || !u.template.checkCollision) continue;
      for (let v = u.next; v !== null; v = v.next) {
        if (u.removed || !v.template.checkCollision) continue;

        this.#testAndHandleCollision(u, v);
      }
    }
  }

  #testAndHandleCollision(u, v) {
    const r = u.r + v.r;
    const dsqr = (u.x - v.x) ** 2 + (u.y - v.y) ** 2;
    if (dsqr < r ** 2) {
      if (u.type === v.type) {
        if (u.type === "bullet") {
          const d = [v.x - u.x, v.y - u.y];
          const rv = [v.vx - u.vx, v.vy - u.vy];
          // k0 = m * rv[0] ** 2 + m * rv[1] ** 2
          // k1 = i[0] ** 2 + i[1] ** 2 + m * (rv[0] + i[0] / m) ** 2 + m * (rv[1] + i[1] / m) ** 2
          // k0 = k1
          // i[0] * rv[0] + i[1] * rv[1] + (1 + 1 / m) / 2 * (i[0] ** 2 + i[1] ** 2) = 0
          // i[0] = t * d[0], i[1] = t * d[1], t ≥ 0
          // t * d[0] * rv[0] + t * d[1] * rv[1] + (1 + 1 / m) / 2 * ((t * d[0]) ** 2 + (t * d[1]) ** 2) = 0
          // (1 + 1 / m) / 2 * (d[0] ** 2 + d[1] ** 2) * t + d[0] * rv[0] + d[1] * rv[1] = 0
          const im = u.mass / v.mass;
          const t = ((-(d[0] * rv[0] + d[1] * rv[1]) / dsqr) * 2) / (1 + im);
          if (t > 0) {
            u.vx -= t * d[0];
            u.vy -= t * d[1];
            v.vx += t * d[0] * im;
            v.vy += t * d[1] * im;
          }
        }
      } else {
        const a = [
          [u, v],
          [v, u],
        ];
        for (const [u, v] of a) {
          if (u.type === "player" && v.type === "bullet") {
            u.removed = true;
          }
        }
      }
    }
  }

  redraw() {
    const t0 = new Date().getTime();

    const ctx = this.#canvas.getContext("2d");

    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    ctx.save();

    {
      const { center, minWidth, minHeight } = this.#world.visibleRegion;
      const cw = this.#canvas.width,
        ch = this.#canvas.height;
      const s = Math.min(cw / minWidth, ch / minHeight);
      ctx.setTransform(
        s,
        0,
        0,
        -s,
        0.5 * cw - s * center.x,
        0.5 * ch + s * center.y,
      );
    }

    {
      ctx.beginPath();
      ctx.fillStyle = this.#config.background;
      const b = this.#world.innerBounds;
      ctx.rect(b.left, b.bottom, b.right - b.left, b.top - b.bottom);
      ctx.fill();

      ctx.clip();
    }

    const t = ctx.getTransform();
    const ti = t.inverse();
    const { x: left, y: top } = ti.transformPoint({ x: 0, y: 0 });
    const { x: right, y: bottom } = ti.transformPoint({
      x: this.#canvas.width,
      y: this.#canvas.height,
    });

    if (this.#config.grid) {
      const bounds = this.#world.innerBounds;
      const wx = (t.a ** 2 + t.c ** 2) ** -0.5;
      const wy = (t.b ** 2 + t.d ** 2) ** -0.5;

      ctx.strokeStyle = "black";

      ctx.lineWidth = 1 * wx;
      ctx.beginPath();
      ctx.moveTo(0, bounds.bottom);
      ctx.lineTo(0, bounds.top);
      ctx.stroke();

      ctx.lineWidth = 1 * wy;
      ctx.beginPath();
      ctx.moveTo(bounds.left, 0);
      ctx.lineTo(bounds.right, 0);
      ctx.stroke();

      ctx.lineWidth = 0.5 * wx;
      for (let x = Math.ceil(left); x < right; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x, bounds.bottom);
        ctx.lineTo(x, bounds.top);
        ctx.stroke();
      }
      ctx.lineWidth = 0.5 * wy;
      for (let y = Math.ceil(bottom); y < top; y += 1) {
        ctx.beginPath();
        ctx.moveTo(bounds.left, y);
        ctx.lineTo(bounds.right, y);
        ctx.stroke();
      }
    }

    {
      for (let u = this.#units.next; u !== null; u = u.next) {
        if (
          u.x + u.r < left ||
          u.x - u.r > right ||
          u.y + u.r < bottom ||
          u.y - u.r > top
        )
          continue;
        ctx.beginPath();
        ctx.fillStyle = u.template.fillStyle;
        ctx.arc(u.x, u.y, u.r, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    ctx.restore();

    {
      ctx.beginPath();
      ctx.fillStyle = this.#config.text;
      ctx.font = "20px arial";
      const stats = this.#stats;
      const texts = [
        `Survived Time: ${(stats.survivedTicks / this.#config.tickRate).toFixed(2)}s`,
        `Score: ${stats.score}`,
        `Bullets: ${stats.bulletCount}`,
        `tick: ${stats.tick}`,
        `avg_tick_time: ${stats.avgTickTime.toFixed(3)}ms`,
        `avg_draw_time: ${stats.avgRedrawTime.toFixed(3)}ms`,
      ];
      for (let i = 0; i < texts.length; i++) {
        ctx.fillText(texts[i], 5, 25 * (i + 1));
      }
    }

    this.#stats.totalRedrawCount++;
    const time = new Date().getTime() - t0;
    this.#stats.totalRedrawTime += time;
    const w = Math.max(
      1 / this.#stats.totalRedrawCount,
      this.#config.avgStatsRecencyWeight,
    );
    this.#stats.avgRedrawTime = this.#stats.avgRedrawTime * (1 - w) + time * w;
  }

  createUnit(template, x, y, props) {
    const unit = {
      template,
      type: template.type,
      r: props?.r ?? template.r,
      mass: props?.mass ?? template.mass,
      x,
      y,
      vx: props?.vx ?? 0,
      vy: props?.vy ?? 0,
      removed: false,
      next: null,
      id: this.#units.nextId++,
    };
    this.#units.tail.next = unit;
    this.#units.tail = unit;
    return unit;
  }

  input(type, event) {
    if (type !== "keydown" && type !== "keyup") return;

    if (!this.#inputState) {
      this.#inputState = {
        left: false,
        right: false,
        up: false,
        down: false,
      };
    }
    const s = this.#inputState;

    const down = type == "keydown";

    const key = {
      ArrowLeft: "left",
      ArrowDown: "down",
      ArrowUp: "up",
      ArrowRight: "right",
      KeyA: "left",
      KeyS: "down",
      KeyW: "up",
      KeyD: "right",
      KeyH: "left",
      KeyJ: "down",
      KeyK: "up",
      KeyL: "right",
    }[event.code];

    if (!key) return;

    if (s[key] === down) return;

    s[key] = down;

    const p = this.#player;
    let x = +s.right - +s.left;
    let y = +s.up - +s.down;
    const speed = this.#config.playerMaxSpeed;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    p.vx = x * speed;
    p.vy = y * speed;
  }

  get canvas() {
    return this.#canvas;
  }
}
