import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Holding } from "./model";
import { FLOW_CYCLE_MS, RELEASE_MS, vaultReaction } from "./flowTiming";

// Illustrative brand accents; unknown basket assets retain the vault accent.
const stockColors: Record<string, string> = {
  NVDA: "#76b900",
  AAPL: "#d5d9df",
  TSLA: "#ff5264",
  GOOGL: "#4285f4",
  AMZN: "#ff9900",
  QQQ: "#0057b8",
  NFLX: "#ff4054",
};
function stockStyle(symbol: string): CSSProperties {
  return {
    "--stock-color":
      stockColors[symbol.replace(/^d(?=[A-Z])/, "").toUpperCase()] ?? "#c4ee91",
  } as CSSProperties;
}

export function Diagram({
  holdings,
  reserve,
  motion,
  onMotion,
  syncing = false,
}: {
  holdings: Holding[];
  reserve: number;
  motion: boolean;
  onMotion: () => void;
  syncing?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const m = matchMedia("(max-width: 650px)");
    const update = () => setSmall(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  const count = holdings.length;
  const row = (i: number) =>
    small ? 330 + i * 57 : 125 + i * (count > 1 ? 200 / (count - 1) : 0);
  const paths = holdings.map((_, i) =>
    small
      ? `M 180 220 L 180 ${row(i) - 15} Q 180 ${row(i)} 200 ${row(i)} L 221 ${row(i)}`
      : Math.abs(row(i) - 225) < 2
        ? "M 330 225 H 432"
        : `M 330 ${225 + (i - (count - 1) / 2) * 3} H ${366 + i * 3} Q ${380 + i * 3} ${225 + (i - (count - 1) / 2) * 3} ${380 + i * 3} ${225 + (row(i) < 225 ? -16 : 16)} V ${row(i) + (row(i) < 225 ? 12 : -12)} Q ${380 + i * 3} ${row(i)} ${396 + i * 3} ${row(i)} H 432`,
  );
  const deposit = small ? "M 180 49 L 180 135" : "M 52 225 L 180 225";
  const reserveX = small ? 75 : 255;
  const reserveY = small ? row(count - 1) + 80 : 395;
  const reservePath = small
    ? `M 133 220 L 75 260 L 75 ${reserveY}`
    : `M 255 323 L 255 ${reserveY}`;
  useEffect(() => {
    const el = root.current!;
    const svgPaths = [...el.querySelectorAll<SVGPathElement>(".draw-path")];
    const particles = [...el.querySelectorAll<SVGGElement>(".traveler")];
    const labels = [...el.querySelectorAll<HTMLElement>("[data-weight]")];
    const lengths = svgPaths.map((p) => p.getTotalLength());
    const cube = el.querySelector<HTMLElement>(".cube")!;
    let frame = 0,
      elapsed = 0,
      last = 0,
      visible = true,
      disposed = false;
    function finish() {
      cube.style.transform = "rotateX(-30deg) rotateY(45deg)";
      el.style.setProperty("--vault-charge", "0");
      svgPaths.forEach((p) => (p.style.strokeDashoffset = "0"));
      labels.forEach(
        (p, i) =>
          (p.textContent =
            holdings[i].weight === null
              ? "—"
              : `${holdings[i].weight! / 100}%`),
      );
      particles.forEach((p) => (p.style.opacity = "0"));
    }
    svgPaths.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths[i]}`;
      p.style.strokeDashoffset = motion ? `${lengths[i]}` : "0";
    });
    function tick(time: number) {
      if (disposed) return;
      if (last) elapsed += Math.min(time - last, 60);
      last = time;
      svgPaths.forEach(
        (p, i) =>
          (p.style.strokeDashoffset = String(
            lengths[i] *
              (1 - Math.min(1, Math.max(0, (elapsed - i * 140) / 800))),
          )),
      );
      labels.forEach(
        (p, i) =>
          (p.textContent =
            holdings[i].weight === null
              ? "—"
              : `${Math.round((holdings[i].weight! / 100) * Math.min(1, Math.max(0, (elapsed - 1800) / 700)))}%`),
      );
      const flowTime = elapsed - 2600;
      const cycle = flowTime % FLOW_CYCLE_MS;
      const reaction = vaultReaction(flowTime);
      cube.style.transform = `rotateX(-30deg) rotateY(${45 + reaction.turn}deg)`;
      el.style.setProperty("--vault-charge", String(reaction.charge));
      particles.forEach((p, i) => {
        const start =
          i === 0
            ? 0
            : i === particles.length - 1
              ? RELEASE_MS + 100
              : RELEASE_MS;
        const duration = i === 0 ? 1500 : 2000;
        const progress = (cycle - start) / duration;
        const path = svgPaths[i];
        if (!path) return;
        p.style.opacity =
          cycle >= 0 && progress >= 0 && progress <= 1 ? "1" : "0";
        const point = path.getPointAtLength(
          Math.max(0, Math.min(1, progress)) * lengths[i],
        );
        p.setAttribute("transform", `translate(${point.x} ${point.y})`);
      });
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      last = 0;
      el.classList.toggle(
        "animation-paused",
        !motion || !visible || document.hidden,
      );
      if (motion && visible && !document.hidden)
        frame = requestAnimationFrame(tick);
      else if (!motion) finish();
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motion, small, holdings.map((h) => h.weight).join(",")]);
  return (
    <div
      className={`flow-diagram ${small ? "vertical" : ""}`}
      ref={root}
      onPointerMove={(e) => {
        if (!motion || e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        const cube = e.currentTarget.querySelector<HTMLElement>(".cube-tilt")!;
        cube.style.setProperty(
          "--tilt-x",
          `${(-(e.clientY - r.top - r.height / 2) / r.height) * 12}deg`,
        );
        cube.style.setProperty(
          "--tilt-y",
          `${((e.clientX - r.left - r.width / 2) / r.width) * 12}deg`,
        );
      }}
      onPointerLeave={() => {
        const c = root.current?.querySelector<HTMLElement>(".cube-tilt");
        c?.style.setProperty("--tilt-x", "0deg");
        c?.style.setProperty("--tilt-y", "0deg");
      }}
    >
      <div className="flow-heading">
        <span className="micro">Illustrative allocation flow</span>
        {syncing && (
          <span className="flow-sync micro" role="status">
            Syncing live data
          </span>
        )}
        <button
          className="text-button micro"
          onClick={onMotion}
          aria-pressed={!motion}
        >
          Motion {motion ? "on" : "off"}
        </button>
      </div>
      <div
        className="flow-canvas"
        style={
          small ? { aspectRatio: `360 / ${row(count - 1) + 130}` } : undefined
        }
      >
        <svg
          className="flow-svg"
          viewBox={small ? `0 0 360 ${row(count - 1) + 130}` : "0 0 650 470"}
          aria-hidden="true"
        >
          <path className="draw-path" d={deposit} />
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              style={stockStyle(holdings[i].symbol)}
              className={`draw-path allocation-line ${active === i ? "selected" : ""} ${active !== null && active !== i ? "dimmed" : ""}`}
            />
          ))}
          <g
            className="reserve-platform"
            transform={`translate(${reserveX} ${reserveY})`}
          >
            <path
              className="platform-outer"
              d="M 0 -39 L 82 0 L 0 39 L -82 0 Z"
            />
            <path
              className="platform-middle"
              d="M 0 -27 L 57 0 L 0 27 L -57 0 Z"
            />
            <path
              className="platform-inner"
              d="M 0 -15 L 32 0 L 0 15 L -32 0 Z"
            />
          </g>
          <path className="draw-path reserve-line" d={reservePath} />
          <path
            className="reserve-arrow"
            d={`M ${reserveX - 3} ${reserveY - 16} l 3 4 l 3 -4`}
          />
          <circle className="reserve-core" cx={reserveX} cy={reserveY} r="3" />
          {[deposit, ...paths, reservePath].map((_, i) => (
            <g
              key={i}
              style={
                i > 0 && i <= count
                  ? stockStyle(holdings[i - 1].symbol)
                  : undefined
              }
              className={`traveler ${active !== null && i > 0 && i <= count && active !== i - 1 ? "dimmed" : ""}`}
            >
              <circle r={i === 0 ? 12 : 4} />
              {i === 0 && (
                <text textAnchor="middle" y="4">
                  $
                </text>
              )}
            </g>
          ))}
        </svg>
        <div className="deposit-node">
          <span className="micro">User deposit</span>
          <span className="muted">USDG</span>
          <div className="dollar">$</div>
        </div>
        <div className="vault-node">
          <span className="micro">ERC-4626 vault</span>
          <div className="cube-tilt">
            <div className="cube-spin">
              <div className="cube">
                <i className="face front" />
                <i className="face back" />
                <i className="face left" />
                <i className="face right" />
                <i className="face top" />
                <i className="face bottom" />
                <i className="vault-shelf upper" />
                <i className="vault-shelf lower" />
                <div className="inner-core">
                  <i className="face front" />
                  <i className="face back" />
                  <i className="face left" />
                  <i className="face right" />
                  <i className="face top" />
                  <i className="face bottom" />
                </div>
              </div>
            </div>
          </div>
          <div className="cube-label">
            MAG7<small>INDEX VAULT</small>
          </div>
        </div>
        <div className="allocation-title micro">Basket targets</div>
        {holdings.map((h, i) => (
          <button
            className={`stock-node ${active === i ? "selected" : ""} ${active !== null && active !== i ? "dimmed" : ""}`}
            style={{
              ...stockStyle(h.symbol),
              top: small
                ? `${(row(i) / (row(count - 1) + 130)) * 100}%`
                : `${(row(i) / 470) * 100}%`,
            }}
            key={h.address}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${h.symbol}: ${h.weight === null ? "unavailable" : h.weight / 100 + " percent"} basket target`}
          >
            <span data-weight>
              {h.weight === null ? "—" : h.weight / 100 + "%"}
            </span>
            <i />
            <strong>{h.symbol.replace(/^d(?=[A-Z])/, "")}</strong>
            <small>Target</small>
          </button>
        ))}
        <div
          className="reserve-node"
          style={{
            top: `${(reserveY / (small ? row(count - 1) + 130 : 470)) * 100}%`,
          }}
        >
          <div>
            <span className="micro">USDG reserve</span>
            <strong className="reserve-amount">
              ≥{reserve / 100}% <span>after rebalance</span>
            </strong>
            <p>Held as idle USDG for redemptions.</p>
          </div>
        </div>
      </div>
      <p className="flow-caption">
        Deposits mint vault shares. The keeper subsequently allocates the
        invested basket.
      </p>
    </div>
  );
}
