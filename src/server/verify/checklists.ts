export type ChecklistItem = { id: string; text: string };

export type StageChecklist = {
  stage: number;
  name: string;
  items: readonly ChecklistItem[];
};

/** Visual yes/no items for the standard stage sequence. The model does not name the stage. */
export const STAGE_CHECKLISTS: readonly StageChecklist[] = [
  {
    stage: 1,
    name: "Site clearing & setting out",
    items: [
      { id: "s1-cleared", text: "The plot is cleared of bush, rubble, or an old structure." },
      { id: "s1-lines", text: "Setting-out pegs, lines, or profile boards are visible." },
      { id: "s1-ground", text: "Bare ground is visible where the building will sit." },
      { id: "s1-no-concrete", text: "No foundation concrete has been cast yet." },
    ],
  },
  {
    stage: 2,
    name: "Excavation & foundation",
    items: [
      { id: "s2-trench", text: "A trench or the shape of the footing is visible." },
      { id: "s2-concrete", text: "A concrete base is visible." },
      { id: "s2-rebar", text: "Rebar or starter bars are visible in the foundation." },
      { id: "s2-formwork", text: "Foundation formwork has been removed." },
    ],
  },
  {
    stage: 3,
    name: "Substructure",
    items: [
      { id: "s3-blocks", text: "Block walls stand in the foundation, below floor level." },
      { id: "s3-oversite", text: "Oversite concrete or a damp-proof course is visible." },
      { id: "s3-trench", text: "The foundation trench is no longer an open hole." },
      { id: "s3-above", text: "Walls above the ground floor are not built yet." },
    ],
  },
  {
    stage: 4,
    name: "Ground floor columns & blockwork",
    items: [
      { id: "s4-walls", text: "Block walls stand above the ground." },
      { id: "s4-openings", text: "Window or door openings are formed in the walls." },
      { id: "s4-bars", text: "Columns or starter bars are visible." },
      { id: "s4-no-slab", text: "No floor slab has been cast across the top of these walls." },
    ],
  },
  {
    stage: 5,
    name: "First floor slab",
    items: [
      { id: "s5-deck", text: "A deck or formwork is visible." },
      { id: "s5-rebar", text: "Reinforcement is visible on the deck." },
      { id: "s5-concrete", text: "Concrete covers the bars, or wet concrete is being poured over them." },
      { id: "s5-below", text: "The storey below the deck is standing." },
    ],
  },
  {
    stage: 6,
    name: "First floor columns & blockwork",
    items: [
      { id: "s6-upper", text: "Block walls stand on an upper floor, above a lower storey." },
      { id: "s6-openings", text: "Openings are formed in those upper walls." },
      { id: "s6-slab", text: "The edge of a slab or the lower storey is visible." },
      { id: "s6-roof", text: "Roof sheets are not fixed over this floor." },
    ],
  },
  {
    stage: 7,
    name: "Roof structure & covering",
    items: [
      { id: "s7-frame", text: "Roof trusses or a roof frame are visible." },
      { id: "s7-sheets", text: "Roof covering sheets are fixed." },
      { id: "s7-walls", text: "The top of the wall is ready for a roof, not an open concrete deck." },
      { id: "s7-not-slab", text: "The covering is a roof, not a floor slab being cast." },
    ],
  },
  {
    stage: 8,
    name: "Plastering, screeding & MEP first fix",
    items: [
      { id: "s8-plaster", text: "Plaster or screed covers a wall or floor." },
      { id: "s8-services", text: "Conduits, pipes, or chases for services are visible." },
      { id: "s8-blocks", text: "Bare block joints are no longer the finished face." },
      { id: "s8-roof", text: "A roof is already on the building." },
    ],
  },
  {
    stage: 9,
    name: "Windows, doors, tiling & finishes",
    items: [
      { id: "s9-frames", text: "Window or door frames are installed." },
      { id: "s9-finish", text: "Tiles, paint, or another finish covers a surface." },
      { id: "s9-not-bare", text: "The face in frame is not bare blockwork." },
      { id: "s9-closed", text: "An opening is closed by a frame, not left as a hole." },
    ],
  },
  {
    stage: 10,
    name: "External works, testing & handover",
    items: [
      { id: "s10-yard", text: "A compound surface, fence, drain, or apron is visible." },
      { id: "s10-shell", text: "The building shell is closed." },
      { id: "s10-outside", text: "The work in frame is outside the structure." },
      { id: "s10-not-dig", text: "The site is not an open excavation." },
    ],
  },
];

export function checklistFor(stage: number): StageChecklist {
  const found = STAGE_CHECKLISTS.find((row) => row.stage === stage);
  if (!found) throw new Error(`No checklist for stage ${stage}.`);
  return found;
}

export function checklistUserMessage(stage: number): string {
  const list = checklistFor(stage);
  const items = list.items.map((item) => `${item.id}: ${item.text}`).join("\n");
  return `Claimed stage ${list.stage}: ${list.name}. Answer every checklist item. Do not name the stage. Do not give a confidence number.\n${items}`;
}
