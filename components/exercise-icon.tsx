import type { CatalogExercise } from "@/lib/catalog";

// Original vector pictograms. The pose represents a movement family, not a photograph.
export function movementFamily(e: Pick<CatalogExercise, "name" | "category">) {
  const n = e.name.toLowerCase();
  if (/bike|cycling|bicycl/.test(n)) return "bike";
  if (/leg curl|hamstring curl/.test(n)) return "legcurl";
  if (/lunge|split squat/.test(n)) return "lunge";
  if (/squat|leg press|leg extension/.test(n)) return "squat";
  if (/deadlift|good morning|swing|pull through|windmill|clean|snatch/.test(n))
    return "hinge";
  if (/bench press|floor press|flyes|flye|push.?up|chest press/.test(n))
    return "press";
  if (/pull.?up|chin.?up|pulldown|pull.down/.test(n)) return "pull";
  if (/row|face pull/.test(n)) return "row";
  if (/shoulder press|military|overhead press|arnold|push press/.test(n))
    return "overhead";
  if (/tricep|skullcrusher|dip|pushdown/.test(n)) return "triceps";
  if (/curl|wrist/.test(n)) return "curl";
  if (/raise|lateral|upright/.test(n) && !/calf|leg|knee/.test(n))
    return "raise";
  if (/plank|ab roller|mountain climber/.test(n)) return "plank";
  if (/crunch|sit.up|leg raise|knee raise|abdom|twist|heel touch/.test(n))
    return "core";
  if (/calf|calves/.test(n)) return "calf";
  if (e.category === "stretching" || /stretch|foam|release/.test(n))
    return "stretch";
  if (e.category === "cardio" || /run|walk|jump|skip|bike|bound/.test(n))
    return "cardio";
  return "strength";
}

const poses: Record<
  string,
  { head: [number, number]; body: string; accent: string }
> = {
  bike: {
    head: [137, 34],
    body: "M128 47 104 70 133 94 113 117 M104 70 87 98 110 111 M122 54 151 68 164 59",
    accent: "M104 70 133 94 M104 70 87 98",
  },
  legcurl: {
    head: [66, 88],
    body: "M83 96 127 96 154 97 170 64 M94 97 84 119 65 119 M127 96 149 112 173 88",
    accent: "M154 97 170 64 M149 112 173 88",
  },
  squat: {
    head: [120, 38],
    body: "M120 54 108 86 137 104 122 132 M108 86 84 105 66 132 M116 63 141 73 158 60",
    accent: "M108 86 137 104 M108 86 84 105",
  },
  lunge: {
    head: [121, 32],
    body: "M121 48 117 86 146 101 148 132 M117 86 90 108 63 108 M120 58 99 74 82 64",
    accent: "M117 86 146 101 M117 86 90 108",
  },
  hinge: {
    head: [153, 48],
    body: "M140 56 106 76 92 108 85 132 M106 76 119 107 126 132 M132 62 145 103",
    accent: "M140 56 106 76 M106 76 92 108",
  },
  press: {
    head: [73, 95],
    body: "M90 98 132 98 156 115 164 134 M132 98 142 122 132 134 M101 98 104 63 126 51",
    accent: "M90 98 115 98 M101 98 104 63",
  },
  pull: {
    head: [120, 61],
    body: "M120 77 120 105 104 130 M120 105 140 130 M119 83 94 59 91 29 M121 83 146 59 149 29",
    accent: "M119 83 94 59 M121 83 146 59",
  },
  row: {
    head: [140, 43],
    body: "M129 53 106 84 92 110 84 132 M106 84 125 111 132 132 M123 62 148 82 144 106",
    accent: "M129 53 106 84 M123 62 148 82",
  },
  overhead: {
    head: [120, 50],
    body: "M120 66 120 98 99 132 M120 98 141 132 M119 73 93 57 92 28 M121 73 147 57 148 28",
    accent: "M119 73 93 57 M121 73 147 57",
  },
  curl: {
    head: [117, 32],
    body: "M117 48 117 94 101 132 M117 94 137 132 M117 59 139 85 158 64 M115 60 92 89 77 71",
    accent: "M139 85 158 64 M92 89 77 71",
  },
  raise: {
    head: [120, 34],
    body: "M120 50 120 95 99 132 M120 95 141 132 M119 61 90 63 63 53 M121 61 150 63 177 53",
    accent: "M119 61 90 63 M121 61 150 63",
  },
  triceps: {
    head: [118, 44],
    body: "M118 60 118 98 99 132 M118 98 139 132 M118 67 142 45 126 24 M115 68 94 47 110 24",
    accent: "M118 67 142 45 M115 68 94 47",
  },
  plank: {
    head: [70, 77],
    body: "M84 86 128 100 173 115 184 131 M92 89 85 122 62 122 M128 100 164 127",
    accent: "M84 86 128 100",
  },
  core: {
    head: [88, 64],
    body: "M98 76 120 106 152 106 166 130 M120 106 140 81 171 95 M101 80 118 61 96 49",
    accent: "M98 76 120 106",
  },
  calf: {
    head: [120, 30],
    body: "M120 46 120 90 108 119 116 130 M120 90 138 116 145 128 M120 57 98 76 90 98 M120 57 141 76 150 98",
    accent: "M108 119 116 130 M138 116 145 128",
  },
  stretch: {
    head: [111, 38],
    body: "M116 53 132 90 104 115 74 128 M132 90 160 120 182 128 M121 64 93 58 72 40 M123 64 150 55 162 32",
    accent: "M132 90 104 115 M132 90 160 120",
  },
  cardio: {
    head: [132, 32],
    body: "M126 48 112 82 139 103 161 91 M112 82 91 108 66 117 M120 60 145 69 160 55 M120 60 95 53 82 69",
    accent: "M112 82 139 103 M112 82 91 108",
  },
  strength: {
    head: [120, 32],
    body: "M120 48 120 94 99 132 M120 94 141 132 M120 59 95 81 74 77 M120 59 145 81 166 77",
    accent: "M120 59 95 81 M120 59 145 81",
  },
};

export function ExerciseIcon({
  exercise,
  className = "",
}: {
  exercise: CatalogExercise;
  className?: string;
}) {
  const family = movementFamily(exercise);
  const pose = poses[family];
  const weighted = [
    "barbell",
    "dumbbell",
    "kettlebells",
    "e-z curl bar",
  ].includes(exercise.equipment ?? "");
  return (
    <div
      className={`exercise-pictogram ${className}`}
      data-movement={family}
      aria-hidden="true"
    >
      <svg viewBox="0 0 240 160" fill="none">
        <circle cx="120" cy="80" r="62" fill="currentColor" opacity=".045" />
        <circle
          cx="120"
          cy="80"
          r="47"
          stroke="currentColor"
          opacity=".07"
          strokeDasharray="3 6"
        />
        <path
          d="M48 140H192"
          stroke="currentColor"
          opacity=".15"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {family === "press" && (
          <path
            d="M65 111H142M79 111V135M137 111V135"
            stroke="currentColor"
            opacity=".3"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}
        {family === "pull" && (
          <path
            d="M73 28H167M80 28V15M160 28V15"
            stroke="currentColor"
            opacity=".45"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}
        <path
          d={pose.body}
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={pose.head[0]}
          cy={pose.head[1]}
          r="10"
          fill="currentColor"
        />
        <path
          d={pose.accent}
          stroke="var(--color-teal)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {weighted &&
          ["squat", "hinge", "press", "overhead"].includes(family) && (
            <g
              stroke="var(--color-teal)"
              strokeWidth="4"
              strokeLinecap="round"
              transform={`translate(0 ${family === "hinge" ? 76 : family === "press" ? 24 : 0})`}
            >
              <path d="M73 26H167M82 17V35M91 12V40M149 12V40M158 17V35" />
            </g>
          )}
        {weighted && ["curl", "raise", "strength"].includes(family) && (
          <path
            d="M66 70 78 83M72 64 84 77M158 58 171 71M152 64 165 77"
            stroke="var(--color-teal)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}
