import { useEffect, useMemo, useRef, useState } from "react";

type ConvergencePoint = {
  iteration: number;
  data_scanned_pct: number;
  relative_error: number;
  elapsed_ms: number;
};

type Coord = {
  x: number;
  y: number;
};

type HoveredState = {
  x: number;
  y: number;
  point: ConvergencePoint;
};

const BubbleStraight =
  "data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_23_435)'%3E%3Crect width='18' height='18' rx='9' fill='%23A2E3F6'/%3E%3Cpath d='M15.7116 10.2053C14.8397 11.6982 14.4117 13.7171 15.0835 14.1094C15.7554 14.5017 17.268 12.417 17.4663 10.0292C17.5932 8.50166 17.2817 6.53413 16.6099 6.14179C15.9381 5.74945 16.5835 8.71233 15.7116 10.2053Z' fill='white'/%3E%3Cpath d='M14.8982 4.28341C15.6959 5.16244 15.9448 5.64449 16.1593 5.50724C16.5831 5.23602 15.9867 3.8181 14.91 2.95408C13.8002 2.06346 13.4348 2.33009 13.2739 2.70678C13.1131 3.08346 14.1005 3.40439 14.8982 4.28341Z' fill='white'/%3E%3Cellipse cx='5.17505' cy='8.325' rx='1.125' ry='1.575' fill='%23222222'/%3E%3Cellipse cx='12.825' cy='8.325' rx='1.125' ry='1.575' fill='%23222222'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_23_435'%3E%3Crect width='18' height='18' rx='9' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E";

const W = 640;
const H = 300;
const PAD = { top: 32, right: 36, bottom: 52, left: 56 } as const;
const LERP_SPEED = 0.072;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothPath(coords: Coord[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export default function ConvergenceGraph({
  points,
  targetError,
  targetErrors,
  running,
}: {
  points: ConvergencePoint[];
  targetError: number;
  targetErrors?: number[];
  running: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bubbleTargetRef = useRef<Coord>({ x: PAD.left, y: H - PAD.bottom });
  const bubbleCurrentRef = useRef<Coord>({ x: PAD.left, y: H - PAD.bottom });
  const pathTargetRef = useRef<Coord[]>([]);
  const pathCurrentRef = useRef<Coord[]>([]);

  const [bubblePosition, setBubblePosition] = useState<Coord>(bubbleCurrentRef.current);
  const [pathCoords, setPathCoords] = useState<Coord[]>([]);
  const [hovered, setHovered] = useState<HoveredState | null>(null);

  const targetThresholds = useMemo(() => {
    const source = targetErrors && targetErrors.length > 0 ? targetErrors : [targetError];
    return [...new Set(source.filter((value) => Number.isFinite(value) && value >= 0).map((value) => Number(value.toFixed(2))))].sort(
      (a, b) => a - b,
    );
  }, [targetError, targetErrors]);

  const maxError = useMemo(() => {
    const sourceMax = Math.max(
      ...targetThresholds.map((threshold) => threshold * 1.8),
      ...points.map((point) => point.relative_error),
      10,
    );
    return Math.ceil(sourceMax / 5) * 5;
  }, [points, targetThresholds]);

  const sx = (pct: number): number => PAD.left + (pct / 100) * (W - PAD.left - PAD.right);
  const sy = (err: number): number => {
    const range = H - PAD.top - PAD.bottom;
    return PAD.top + range - (err / maxError) * range;
  };

  const chartCoords = useMemo(
    () =>
      points.map((point) => ({
        x: sx(point.data_scanned_pct),
        y: sy(point.relative_error),
      })),
    [points, maxError],
  );

  useEffect(() => {
    pathTargetRef.current = chartCoords;
    const last = chartCoords[chartCoords.length - 1];
    if (last) {
      bubbleTargetRef.current = last;
    } else {
      const origin = { x: sx(0), y: sy(maxError * 0.7) };
      bubbleTargetRef.current = origin;
      bubbleCurrentRef.current = origin;
      setBubblePosition(origin);
      pathCurrentRef.current = [];
      setPathCoords([]);
    }
  }, [chartCoords, maxError]);

  useEffect(() => {
    function frame() {
      const tx = bubbleTargetRef.current.x;
      const ty = bubbleTargetRef.current.y;
      const cx = bubbleCurrentRef.current.x;
      const cy = bubbleCurrentRef.current.y;
      const nx = lerp(cx, tx, LERP_SPEED);
      const ny = lerp(cy, ty, LERP_SPEED);

      if (Math.abs(nx - cx) > 0.05 || Math.abs(ny - cy) > 0.05) {
        bubbleCurrentRef.current = { x: nx, y: ny };
        setBubblePosition({ x: nx, y: ny });
      }

      const targetCoords = pathTargetRef.current;
      const currentCoords = pathCurrentRef.current;
      if (targetCoords.length > 0) {
        while (currentCoords.length < targetCoords.length) {
          const last = currentCoords[currentCoords.length - 1] ?? targetCoords[0];
          currentCoords.push({ x: last.x, y: last.y });
        }

        let moved = false;
        for (let index = 0; index < targetCoords.length; index += 1) {
          const nextX = lerp(currentCoords[index].x, targetCoords[index].x, LERP_SPEED * 1.4);
          const nextY = lerp(currentCoords[index].y, targetCoords[index].y, LERP_SPEED * 1.4);
          if (
            Math.abs(nextX - currentCoords[index].x) > 0.05 ||
            Math.abs(nextY - currentCoords[index].y) > 0.05
          ) {
            currentCoords[index] = { x: nextX, y: nextY };
            moved = true;
          }
        }

        if (currentCoords.length > targetCoords.length) {
          currentCoords.length = targetCoords.length;
          moved = true;
        }

        if (moved) {
          setPathCoords([...currentCoords]);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!points.length || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * W;
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(sx(points[index].data_scanned_pct) - mouseX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    if (nearestIndex >= 0 && nearestDistance < 36) {
      const point = points[nearestIndex];
      setHovered({
        x: sx(point.data_scanned_pct),
        y: sy(point.relative_error),
        point,
      });
      return;
    }

    setHovered(null);
  }

  const yTicks = [0, maxError * 0.25, maxError * 0.5, maxError * 0.75, maxError];
  const xTicks = [0, 25, 50, 75, 100];
  const smoothedPath = smoothPath(pathCoords);
  const currentPoint = points[points.length - 1] ?? null;
  const targetMilestones = targetThresholds.map((threshold) => ({
    threshold,
    y: sy(threshold),
    metIndex: points.findIndex((point) => point.relative_error <= threshold),
  }));
  const activeTargetThreshold = targetThresholds[targetThresholds.length - 1] ?? targetError;
  const activeTargetY = sy(activeTargetThreshold);
  const targetMet = currentPoint ? targetThresholds.some((threshold) => currentPoint.relative_error <= threshold) : false;
  const metMilestones = targetMilestones.filter((milestone) => milestone.metIndex !== -1).sort((a, b) => b.threshold - a.threshold);
  const areaPath =
    pathCoords.length >= 2
      ? `${smoothedPath} L ${pathCoords[pathCoords.length - 1].x} ${H - PAD.bottom} L ${pathCoords[0].x} ${H - PAD.bottom} Z`
      : "";
  const formatThreshold = (value: number): string => (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1));

  return (
    <div style={{ width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <filter id="bubble-line-glow" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="bubble-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bubble-area-fill-soft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A2E3F6" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#A2E3F6" stopOpacity="0" />
          </linearGradient>
          <clipPath id="bubble-graph-clip">
            <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} />
          </clipPath>
        </defs>

        {yTicks.map((tick) => (
          <line
            key={`y-${tick}`}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={sy(tick)}
            y2={sy(tick)}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1"
          />
        ))}
        {xTicks.map((tick) => (
          <line
            key={`x-${tick}`}
            x1={sx(tick)}
            x2={sx(tick)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1"
          />
        ))}

        {yTicks.map((tick) => (
          <text key={`yl-${tick}`} x={PAD.left - 10} y={sy(tick) + 4} textAnchor="end" fill="#ffffff" fontSize="10" fontFamily="Aldrich">
            {tick.toFixed(0)}%
          </text>
        ))}
        {xTicks.map((tick) => (
          <text key={`xl-${tick}`} x={sx(tick)} y={H - PAD.bottom + 18} textAnchor="middle" fill="#ffffff" fontSize="10" fontFamily="Aldrich">
            {tick}%
          </text>
        ))}

        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#ffffff" fontSize="10" fontFamily="Aldrich">
          Data Scanned (%)
        </text>
        <text
          x={14}
          y={H / 2}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="10"
          fontFamily="Aldrich"
          transform={`rotate(-90,14,${H / 2})`}
        >
          Error (%)
        </text>

        <g clipPath="url(#bubble-graph-clip)">
          {targetMilestones.map((milestone, index) => (
            <g key={`target-${milestone.threshold}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={milestone.y}
                y2={milestone.y}
                stroke="#FB90B0"
                strokeWidth="1"
                strokeDasharray="5,5"
                opacity={1 - index * 0.16}
              />
              <text
                x={W - PAD.right - 4}
                y={milestone.y - 6}
                textAnchor="end"
                fill="#FB90B0"
                fontSize="9"
                fontFamily="Aldrich"
                opacity={1 - index * 0.16}
              >
                {formatThreshold(milestone.threshold)}% target
              </text>
            </g>
          ))}

          <rect
            x={PAD.left}
            y={activeTargetY}
            width={W - PAD.left - PAD.right}
            height={H - PAD.bottom - activeTargetY}
            fill={targetMet ? "rgba(162,227,246,0.06)" : "rgba(251,144,176,0.02)"}
          />

          {areaPath && <path d={areaPath} fill="url(#bubble-area-fill-soft)" />}
          {areaPath && <path d={areaPath} fill="url(#bubble-area-fill)" />}

          {smoothedPath && (
            <path
              d={smoothedPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.55"
              filter="url(#bubble-line-glow)"
            />
          )}
          {smoothedPath && (
            <path
              d={smoothedPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((point, index) => {
            if (index === points.length - 1) return null;
            const opacity = 0.1 + (index / Math.max(points.length, 1)) * 0.2;
            const color = targetMet ? `rgba(162,227,246,${opacity})` : `rgba(251,144,176,${opacity})`;
            return <circle key={point.iteration} cx={sx(point.data_scanned_pct)} cy={sy(point.relative_error)} r="1.8" fill={color} />;
          })}

          {hovered && hovered.point !== currentPoint && (
            <g>
              <line x1={hovered.x} x2={hovered.x} y1={hovered.y} y2={H - PAD.bottom} stroke="#A2E3F6" strokeWidth="1" strokeDasharray="3,3" />
            </g>
          )}
        </g>

        {metMilestones.map((milestone, index) => (
          <g key={`target-met-${milestone.threshold}`}>
            <line
              x1={sx(points[milestone.metIndex].data_scanned_pct)}
              x2={sx(points[milestone.metIndex].data_scanned_pct)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#A2E3F6"
              strokeWidth="1"
              strokeDasharray="3,4"
              opacity={1 - index * 0.14}
            />
            <text
              x={sx(points[milestone.metIndex].data_scanned_pct)}
              y={PAD.top - 8 - index * 10}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontFamily="Aldrich"
              opacity={1 - index * 0.14}
            >
              {formatThreshold(milestone.threshold)}% MET
            </text>
          </g>
        ))}

        {hovered && hovered.point !== currentPoint && (
          <g>
            <circle cx={hovered.x} cy={hovered.y} r="4" fill="#1b1520" stroke="#A2E3F6" strokeWidth="1.5" />
            <g transform={`translate(${Math.min(hovered.x + 14, W - PAD.right - 138)},${Math.max(hovered.y - 62, PAD.top)})`}>
              <rect rx="8" ry="8" width="134" height="56" fill="#1b1520" stroke="rgba(251,144,176,0.22)" strokeWidth="1" opacity="0.97" />
              <text x="11" y="17" fill="#7a6a85" fontSize="9" fontFamily="Aldrich">
                ITER {hovered.point.iteration}
              </text>
              <text x="11" y="31" fill="#ffffff" fontSize="11" fontFamily="Aldrich">
                Error: {hovered.point.relative_error.toFixed(1)}%
              </text>
              <text x="11" y="46" fill="#A2E3F6" fontSize="9" fontFamily="Aldrich">
                {hovered.point.elapsed_ms}ms | {hovered.point.data_scanned_pct.toFixed(1)}% scanned
              </text>
            </g>
          </g>
        )}

        {points.length > 0 && (
          <g style={{ pointerEvents: "none" }}>
            <image
              href={BubbleStraight}
              x={bubblePosition.x - 20}
              y={bubblePosition.y - 20}
              width={40}
              height={40}
              preserveAspectRatio="xMidYMid meet"
            />
            <text
              x={bubblePosition.x}
              y={bubblePosition.y - 30}
              textAnchor="middle"
              fill={targetMet ? "#A2E3F6" : "#FB90B0"}
              fontSize="11"
              fontFamily="Aldrich"
            >
              {currentPoint?.relative_error.toFixed(1)}%
            </text>
            {running && (
              <text x={bubblePosition.x} y={bubblePosition.y + 30} textAnchor="middle" fill="#ffffff" fontSize="9" fontFamily="Aldrich">
                scanning...
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
