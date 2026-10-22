export type DemoStage = {
  name: string;
  description: string;
  bps: number;
  pour: boolean;
};

/** Single source for the Lekki duplex stage split. Percentages are basis points. */
export const DEMO_STAGES: readonly DemoStage[] = [
  {
    name: "Site clearing & setting out",
    description: "Clear the plot and set out the building lines.",
    bps: 300,
    pour: false,
  },
  {
    name: "Excavation & foundation",
    description: "Strip footing excavation, blinding, and foundation concrete.",
    bps: 1200,
    pour: true,
  },
  {
    name: "Substructure",
    description: "Blockwork to DPC and oversite concrete.",
    bps: 1000,
    pour: true,
  },
  {
    name: "Ground floor columns & blockwork",
    description: "Ground floor columns, blockwork, and lintels.",
    bps: 1200,
    pour: false,
  },
  {
    name: "First floor slab",
    description: "Formwork, rebar, and the first floor pour.",
    bps: 1500,
    pour: true,
  },
  {
    name: "First floor columns & blockwork",
    description: "First floor columns and blockwork.",
    bps: 1000,
    pour: false,
  },
  {
    name: "Roof structure & covering",
    description: "Long-span aluminium roof structure and covering.",
    bps: 1000,
    pour: false,
  },
  {
    name: "Plastering, screeding & MEP first fix",
    description: "Internal plaster, screed, and first-fix services.",
    bps: 1000,
    pour: false,
  },
  {
    name: "Windows, doors, tiling & finishes",
    description: "Windows, doors, tiling, and finishes.",
    bps: 1300,
    pour: false,
  },
  {
    name: "External works, testing & handover",
    description: "External works, testing, and handover.",
    bps: 500,
    pour: false,
  },
] as const;

export const DEMO_CONTRACT_NAIRA = 45_000_000n;
export const DEMO_FX_NAIRA_PER_USDC = 1_500n;
export const DEMO_RETENTION_BPS = 500;
export const DEMO_MOBILISATION_BPS = 1_000;
export const DEMO_DEFECTS_DAYS = 180;
export const DEMO_CAP_NAIRA = 5_000_000n;
export const DEMO_GEOFENCE_M = 150;
