const integerFormatter = new Intl.NumberFormat("en-US");

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatFractionAsPercent(value: number, digits = 1): string {
  return formatPercent(value * 100, digits);
}

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(2)} s`;
  }

  return `${seconds.toFixed(1)} s`;
}
