import { rowFromValues, type GridRow } from "../../../src/server/intake/interpret.js";

/** Blank rows are included so the row numbers match the spreadsheets. */
function sheet(name: string, lines: (string[] | null)[]): GridRow[] {
  return lines.map((values, index) => rowFromValues(name, index + 1, values ?? []));
}

const parties = (project: string): (string[] | null)[] => [
  ["Project", project],
  ["Client", "Genius"],
  ["Contractor", "Precious"],
  ["Consultant", "Ronin"],
];

const header = ["Item", "Description", "Unit", "Qty", "Rate (NGN)", "Amount (NGN)"];

export const blockARows: GridRow[] = sheet("BOQ", [
  ...parties("Lekki Duplex - Block A"),
  null,
  header,
  ["BILL NO. 1 - SUBSTRUCTURE"],
  ["1.1", "Site clearing and setting out", "m2", "2", "800", "1600"],
  ["1.2", "Excavation and blinding concrete to foundation", "m3", "1", "2400", "2400"],
  ["", "Total carried to summary - Bill 1", "", "", "", "4000"],
  null,
  ["BILL NO. 2 - GROUND FLOOR FRAME & BLOCKWORK"],
  ["2.1", "Reinforced concrete columns and beams", "m3", "1", "2000", "2000"],
  ["2.2", "225mm sandcrete blockwork", "m2", "2", "1000", "2000"],
  ["", "Total carried to summary - Bill 2", "", "", "", "4000"],
  null,
  ["BILL NO. 3 - ROOF"],
  ["3.1", "Roof timber trusses", "m2", "2", "1200", "2400"],
  ["3.2", "Aluminium roofing sheets", "m2", "2", "800", "1600"],
  ["", "Total carried to summary - Bill 3", "", "", "", "4000"],
  null,
  ["SUMMARY"],
  ["", "Bill 1 - Substructure", "", "", "", "4000"],
  ["", "Bill 2 - Ground floor frame & blockwork", "", "", "", "4000"],
  ["", "Bill 3 - Roof", "", "", "", "4000"],
  ["", "CONTRACT SUM", "", "", "", "12000"],
  ["Payment per completed bill (stage); no retention; contract period 6 weeks"],
]);

export const blockBRows: GridRow[] = sheet("BOQ", [
  ...parties("Lekki Duplex - Block B"),
  header,
  ["BILL NO. 1 - SUBSTRUCTURE"],
  ["1.1", "Site clearing and setting out", "m2", "2", "800", "1600"],
  ["1.2", "Excavation and blinding concrete to foundation", "m3", "1", "2400", "2400"],
  ["BILL NO. 2 - GROUND FLOOR FRAME & BLOCKWORK"],
  ["2.1", "Reinforced concrete columns and beams", "m3", "1", "2000", "2000"],
  ["2.2", "225mm sandcrete blockwork", "m2", "2", "1000", "2000"],
  ["BILL NO. 3 - ROOF"],
  ["3.1", "Roof timber trusses", "m2", "2", "1200", "2400"],
  ["3.2", "Aluminium roofing sheets", "m2", "2", "800", "1600"],
  ["", "CONTRACT SUM", "", "", "", "12000"],
]);

export const blockCRows: GridRow[] = sheet("BOQ", [
  ...parties("Lekki Duplex - Block C"),
  ["BILL NO. 1 - SUBSTRUCTURE"],
  header,
  ["1.1", "Site clearing and setting out", "m2", "2", "800", "1600"],
  ["1.2", "Excavation and blinding concrete to foundation", "m3", "1", "2400", "2400"],
  ["BILL NO. 2 - GROUND FLOOR FRAME & BLOCKWORK"],
  header,
  ["2.1", "Reinforced concrete columns and beams", "m3", "1", "2000", "2000"],
  ["2.2", "225mm sandcrete blockwork", "m2", "2", "1000", "2000"],
  ["BILL NO. 3 - ROOF"],
  header,
  ["3.1", "Roof timber trusses", "m2", "2", "1200", "2400"],
  ["3.2", "Aluminium roofing sheets", "m2", "2", "800", "1600"],
  ["", "CONTRACT SUM", "", "", "", "12000"],
]);

export const singleSheetRows: GridRow[] = sheet("BOQ", [
  ["Client", "Genius"],
  ["Contractor", "Precious"],
  null,
  header,
  ["1", "Site clearing and setting out (Stage 1)", "m2", "5", "800", "4000"],
  ["2", "Foundation blinding concrete (Stage 2)", "m3", "2", "2000", "4000"],
  ["3", "Blockwork to DPC level (Stage 3)", "m2", "4", "1000", "4000"],
  ["", "Total", "", "", "", "12000"],
  ["Three stages; payment on completion of each stage; no retention; contract period 3 weeks"],
]);

export function rowsToCsv(rows: GridRow[]): string {
  return rows.map((row) => {
    const width = row.cells.length;
    const values = Array.from({ length: width }, (_, index) => row.cells[index]?.text ?? "");
    return values.map(csvCell).join(",");
  }).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
