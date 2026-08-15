import { LOCATIONS } from '../lib/data';

export const CITY_LABELS = {
  amsterdam: [
    { text: 'Jordaan', x: 250, y: 400 },
    { text: 'De Pijp', x: 600, y: 800 },
    { text: 'Oud-West', x: 200, y: 650 },
  ],
  rotterdam: [
    { text: 'Kop van Zuid', x: 600, y: 550 },
    { text: 'Kralingen', x: 800, y: 300 },
    { text: 'Delfshaven', x: 300, y: 450 },
  ],
  utrecht: [
    { text: 'Wittevrouwen', x: 650, y: 350 },
    { text: 'Lombok', x: 250, y: 500 },
    { text: 'Oudwijk', x: 700, y: 650 },
  ],
  denhaag: [
    { text: 'Scheveningen', x: 350, y: 250 },
    { text: 'Statenkwartier', x: 450, y: 450 },
    { text: 'Schilderswijk', x: 650, y: 700 },
  ],
  eindhoven: [
    { text: 'Strijp-S', x: 350, y: 400 },
    { text: 'Woensel', x: 600, y: 250 },
    { text: 'Stratum', x: 650, y: 750 },
  ],
} as const;

export type MapType = keyof typeof CITY_LABELS;

export function SchematicMap({
  locationId,
  selectedNeighborhood,
}: {
  locationId: string;
  selectedNeighborhood?: string | null;
}) {
  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc) return null;
  const cityLabels = CITY_LABELS[loc.mapType];

  return (
    <div
      className="absolute inset-0 bg-accent/30 z-0 overflow-hidden border-l border-border pointer-events-none"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full opacity-60"
      >
        <defs>
          <pattern id="city-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="currentColor"
              className="text-secondary/5"
              strokeWidth="1"
            />
            <path
              d="M 25 0 L 25 50 M 0 25 L 50 25"
              fill="none"
              stroke="currentColor"
              className="text-secondary/5"
              strokeWidth="0.5"
            />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="12" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="1000" height="1000" fill="url(#city-grid)" />

        {loc.mapType === 'amsterdam' && (
          <g
            fill="none"
            stroke="currentColor"
            className="text-secondary/20"
            strokeWidth="16"
            strokeLinecap="round"
            filter="url(#glow)"
          >
            <path d="M 300,1200 A 600,600 0 0,1 900,-100" />
            <path d="M 100,1200 A 800,800 0 0,1 1100,-100" />
            <path d="M -100,1200 A 1000,1000 0 0,1 1300,-100" />
            <path
              d="M 500,1200 Q 550,800 900,400"
              strokeWidth="24"
              className="text-secondary/25"
            />
          </g>
        )}
        {loc.mapType === 'rotterdam' && (
          <g
            fill="none"
            stroke="currentColor"
            className="text-secondary/20"
            strokeWidth="36"
            filter="url(#glow)"
          >
            <path d="M -200,800 Q 400,700 600,400 T 1300,200" className="text-secondary/25" />
            <path d="M 600,400 Q 700,600 1300,700" strokeWidth="20" />
          </g>
        )}
        {loc.mapType === 'utrecht' && (
          <g
            fill="none"
            stroke="currentColor"
            className="text-secondary/20"
            strokeWidth="20"
            filter="url(#glow)"
          >
            <path d="M 400,-200 Q 500,500 300,800 T 600,1300" className="text-secondary/25" />
            <path
              d="M 200,200 Q 800,200 800,800 Q 200,800 200,200"
              strokeWidth="12"
              strokeDasharray="40 20"
            />
          </g>
        )}
        {loc.mapType === 'denhaag' && (
          <g>
            <path
              d="M 300,-200 Q 200,500 400,1300"
              fill="none"
              stroke="currentColor"
              className="text-secondary/20"
              strokeWidth="80"
              filter="url(#glow)"
            />
            <path
              d="M -200,-200 L 300,-200 Q 200,500 400,1300 L -200,1300 Z"
              fill="currentColor"
              className="text-secondary/5"
            />
          </g>
        )}
        {loc.mapType === 'eindhoven' && (
          <g fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="16">
            <circle cx="500" cy="500" r="350" strokeDasharray="50 30" filter="url(#glow)" />
            <path
              d="M 500 0 L 500 1000 M 0 500 L 1000 500"
              strokeWidth="8"
              strokeDasharray="20 20"
            />
            <path
              d="M 150 150 L 850 850 M 150 850 L 850 150"
              strokeWidth="6"
              className="text-secondary/15"
            />
          </g>
        )}

        {cityLabels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            fill="currentColor"
            className="text-secondary font-extrabold text-5xl uppercase tracking-[0.2em] pointer-events-none"
            style={{
              opacity: selectedNeighborhood === lbl.text ? 0.45 : 0.15,
              fill:
                selectedNeighborhood === lbl.text ? 'hsl(var(--primary))' : undefined,
            }}
          >
            {lbl.text}
          </text>
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}
