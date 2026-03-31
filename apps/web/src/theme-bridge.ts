type Rgb = { r: number; g: number; b: number };

const DEFAULTS = {
  background: "#222222",
  foreground: "#ffffff",
  card: "#2a2a2a",
  popover: "#1c1421",
  primary: "#fb90b0",
  primaryForeground: "#1a1320",
  mutedForeground: "#7a6a85",
  accent: "#a2e3f6",
  input: "#1c1c1c",
  destructive: "#ef4444",
  chart3: "#22d3ee",
  chart4: "#2dd4bf",
  chart5: "#818cf8",
  sidebarBackground: "#222222",
} as const;

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseRgb(color: string): Rgb | null {
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return null;

  return {
    r: Math.round(Number(match[1])),
    g: Math.round(Number(match[2])),
    b: Math.round(Number(match[3])),
  };
}

function withAlpha(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function resolveColor(rawValue: string, fallback: string): string {
  const raw = rawValue.trim();
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.appendChild(probe);

  const candidates = raw
    ? [raw, `hsl(${raw})`, `oklch(${raw})`, `rgb(${raw})`]
    : [];

  for (const candidate of candidates) {
    probe.style.color = "";
    probe.style.color = candidate;
    const parsed = parseRgb(getComputedStyle(probe).color);
    if (parsed) {
      probe.remove();
      return rgbToHex(parsed);
    }
  }

  probe.remove();
  return fallback;
}

function readThemeColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return resolveColor(styles.getPropertyValue(name), fallback);
}

function applyBridge(): void {
  const root = document.documentElement;
  const styles = getComputedStyle(root);

  const background = readThemeColor(styles, "--background", DEFAULTS.background);
  const foreground = readThemeColor(styles, "--foreground", DEFAULTS.foreground);
  const card = readThemeColor(styles, "--card", DEFAULTS.card);
  const popover = readThemeColor(styles, "--popover", DEFAULTS.popover);
  const primary = readThemeColor(styles, "--primary", DEFAULTS.primary);
  const primaryForeground = readThemeColor(styles, "--primary-foreground", DEFAULTS.primaryForeground);
  const mutedForeground = readThemeColor(styles, "--muted-foreground", DEFAULTS.mutedForeground);
  const accent = readThemeColor(styles, "--accent", DEFAULTS.accent);
  const input = readThemeColor(styles, "--input", DEFAULTS.input);
  const destructive = readThemeColor(styles, "--destructive", DEFAULTS.destructive);
  const chart3 = readThemeColor(styles, "--chart-3", DEFAULTS.chart3);
  const chart4 = readThemeColor(styles, "--chart-4", DEFAULTS.chart4);
  const chart5 = readThemeColor(styles, "--chart-5", DEFAULTS.chart5);
  const sidebarBackground = readThemeColor(styles, "--sidebar-background", DEFAULTS.sidebarBackground);

  const backgroundRgb = hexToRgb(background);
  const foregroundRgb = hexToRgb(foreground);
  const cardRgb = hexToRgb(card);
  const primaryRgb = hexToRgb(primary);
  const mutedRgb = hexToRgb(mutedForeground);
  const accentRgb = hexToRgb(accent);
  const destructiveRgb = hexToRgb(destructive);
  const chart3Rgb = hexToRgb(chart3);
  const chart4Rgb = hexToRgb(chart4);
  const chart5Rgb = hexToRgb(chart5);

  root.style.setProperty("--bg", background);
  root.style.setProperty("--bg-sidebar", sidebarBackground);
  root.style.setProperty("--bg-panel", background);
  root.style.setProperty("--bg-card", card);
  root.style.setProperty("--bg-input", input);
  root.style.setProperty("--text", foreground);
  root.style.setProperty("--text-dim", foreground);
  root.style.setProperty("--text-muted", mutedForeground);
  root.style.setProperty("--text-subtle", mutedForeground);
  root.style.setProperty("--pink", primary);
  root.style.setProperty("--pink-dim", withAlpha(primaryRgb, 0.18));
  root.style.setProperty("--pink-border", withAlpha(primaryRgb, 0.45));
  root.style.setProperty("--blue-dot", accent);
  root.style.setProperty("--blue-dot-soft", withAlpha(accentRgb, 0.5));
  root.style.setProperty("--blue-dot-border-soft", withAlpha(accentRgb, 0.4));
  root.style.setProperty("--blue-dot-line-soft", withAlpha(accentRgb, 0.25));
  root.style.setProperty("--blue-dot-line-strong", withAlpha(accentRgb, 0.7));
  root.style.setProperty("--surface-hover", withAlpha(foregroundRgb, 0.04));
  root.style.setProperty("--surface-hover-strong", withAlpha(primaryRgb, 0.12));
  root.style.setProperty("--shell-border", withAlpha(foregroundRgb, 0.06));
  root.style.setProperty("--panel-overlay", withAlpha(cardRgb, 0.97));
  root.style.setProperty("--panel-border", withAlpha(primaryRgb, 0.25));
  root.style.setProperty("--panel-shadow", "0 8px 28px rgba(0,0,0,0.55)");
  root.style.setProperty("--placeholder", mutedForeground);
  root.style.setProperty("--soft-panel", withAlpha(foregroundRgb, 0.025));
  root.style.setProperty("--soft-card", withAlpha(backgroundRgb, 0.35));
  root.style.setProperty("--soft-card-alt", withAlpha(backgroundRgb, 0.25));
  root.style.setProperty("--danger", destructive);
  root.style.setProperty("--danger-soft", withAlpha(destructiveRgb, 0.12));
  root.style.setProperty("--danger-border", withAlpha(destructiveRgb, 0.3));
  root.style.setProperty("--prompt-border", withAlpha(primaryRgb, 0.35));
  root.style.setProperty("--scrollbar-thumb", withAlpha(primaryRgb, 0.3));
  root.style.setProperty("--scrollbar-thumb-hover", withAlpha(primaryRgb, 0.5));
  root.style.setProperty("--bubble-glow", `radial-gradient(circle, ${withAlpha(accentRgb, 0.1)} 0%, transparent 70%)`);
  root.style.setProperty("--bubble-shadow", `drop-shadow(0 10px 28px ${withAlpha(accentRgb, 0.32)})`);
  root.style.setProperty("--sql-accent", accent);
  root.style.setProperty("--sql-block-bg", withAlpha(backgroundRgb, 0.35));
  root.style.setProperty("--planner-block-bg", withAlpha(backgroundRgb, 0.25));
  root.style.setProperty("--skeleton-accent", primary);
  root.style.setProperty("--mode-idle", "#9a8aaa");

  root.style.setProperty("--graph-bg", "#04070f");
  root.style.setProperty("--graph-surface", "#080d1a");
  root.style.setProperty("--graph-card", background);
  root.style.setProperty("--graph-border", "#0f1c30");
  root.style.setProperty("--graph-border-hi", "#172540");
  root.style.setProperty("--graph-grid", "#808080");
  root.style.setProperty("--graph-cyan", chart3);
  root.style.setProperty("--graph-cyan-rgb", `${chart3Rgb.r}, ${chart3Rgb.g}, ${chart3Rgb.b}`);
  root.style.setProperty("--graph-teal", chart4);
  root.style.setProperty("--graph-teal-rgb", `${chart4Rgb.r}, ${chart4Rgb.g}, ${chart4Rgb.b}`);
  root.style.setProperty("--graph-purple", chart5);
  root.style.setProperty("--graph-purple-rgb", `${chart5Rgb.r}, ${chart5Rgb.g}, ${chart5Rgb.b}`);
  root.style.setProperty("--graph-indigo", chart5);
  root.style.setProperty("--graph-text", "#c8d8f0");
  root.style.setProperty("--graph-text-mid", mutedForeground);
  root.style.setProperty("--graph-text-dim", "#2a3a52");
  root.style.setProperty("--graph-aurora-1", `rgba(${chart3Rgb.r}, ${chart3Rgb.g}, ${chart3Rgb.b}, 0.07)`);
  root.style.setProperty("--graph-aurora-2", `rgba(${chart5Rgb.r}, ${chart5Rgb.g}, ${chart5Rgb.b}, 0.06)`);
  root.style.setProperty("--graph-target", primary);
  root.style.setProperty("--graph-axis", foreground);
  root.style.setProperty("--graph-hover", accent);
  root.style.setProperty("--graph-safe-zone", `rgba(${chart4Rgb.r}, ${chart4Rgb.g}, ${chart4Rgb.b}, 0.04)`);
  root.style.setProperty("--graph-unsafe-zone", `rgba(${chart5Rgb.r}, ${chart5Rgb.g}, ${chart5Rgb.b}, 0.025)`);
  root.style.setProperty("--bubble-fill", accent);
  root.style.setProperty("--bubble-eye", background);
  root.style.setProperty("--bubble-primary-foreground", primaryForeground);
}

export function installThemeBridge(): void {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      applyBridge();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  observer.observe(document.head, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
}
