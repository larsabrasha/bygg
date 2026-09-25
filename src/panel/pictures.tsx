/** Små bilder till de tomma lägena i flikarna (se EmptyState). */

/** En skiva sedd snett ovanifrån: ovansidan i accentfärg, kanterna runt om. dy flyttar den nedåt. */
function Board({ dy = 0, soft = true }: { dy?: number; soft?: boolean }) {
  return (
    <g transform={`translate(0 ${dy})`}>
      {/* Kanterna (tjockleken) först, fyllda, så att en skiva under i en trave döljs. */}
      <path
        d="M14 46 V55 L60 77 L106 55 V46 L60 68 Z M60 68 V77"
        className="fill-panel stroke-line"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 46 L60 24 L106 46 L60 68 Z"
        className={soft ? 'fill-accent-soft stroke-accent-line' : 'fill-panel stroke-line'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  )
}

/** Egenskaper: skivan med pilen för push/pull och en pekare. */
export function PushPullPicture() {
  return (
    <>
      <Board />
      <path d="M60 46 V14" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M53 18 L60 8 L67 18 Z" className="fill-accent" />
      <path
        d="M78 44 L78 62 L83 57 L87 65 L90 63.5 L86 55.5 L93 55.5 Z"
        className="fill-panel stroke-ink"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </>
  )
}

/** Parametrar: skivan med en måttlinje längs kanten och ett namn på måttet. */
export function ParamPicture() {
  return (
    <>
      <Board dy={6} />
      {/* Måttlinjen längs vänstra kanten, med ändstreck. */}
      <path
        d="M10 40 L56 18 M8 36 L12 44 M54 14 L58 22"
        className="stroke-accent"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="12" y="6" width="42" height="15" rx="4" className="fill-accent" transform="rotate(-25.5 33 13.5)" />
      <text
        x="33"
        y="17.5"
        textAnchor="middle"
        transform="rotate(-25.5 33 13.5)"
        className="fill-on-accent font-sans text-[9px] font-semibold"
      >
        bredd
      </text>
    </>
  )
}

/** Kaplistan: tre skivor i en trave, och en lista bredvid. */
export function CutListPicture() {
  return (
    <>
      <g transform="translate(-6 0) scale(0.8)">
        <Board dy={26} soft={false} />
        <Board dy={14} soft={false} />
        <Board dy={2} />
      </g>
      <rect x="84" y="14" width="30" height="40" rx="4" className="fill-panel stroke-line" strokeWidth="1.5" />
      <path
        d="M90 24 H108 M90 32 H108 M90 40 H102"
        className="stroke-accent-line"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  )
}
