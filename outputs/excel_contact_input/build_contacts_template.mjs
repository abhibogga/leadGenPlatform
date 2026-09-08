import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
const contacts = workbook.worksheets.add("Contacts");
const instructions = workbook.worksheets.add("Instructions");

contacts.showGridLines = false;
contacts.freezePanes.freezeRows(1);
contacts.getRange("A1:D101").values = [
  ["Person Name", "Company", "Location", "Website"],
  ...Array.from({ length: 100 }, () => [null, null, null, null]),
];
contacts.getRange("A1:D1").format = {
  fill: "#17324D",
  font: { bold: true, color: "#FFFFFF", size: 11 },
  rowHeight: 26,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#17324D" },
};
contacts.getRange("A2:D101").format = {
  font: { color: "#1F2937", size: 10 },
  rowHeight: 22,
  borders: {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
  },
};
contacts.getRange("A2:B101").format.fill = "#FFFDF5";
contacts.getRange("C2:D101").format.fill = "#F8FAFC";
contacts.getRange("A1:A101").format.columnWidth = 24;
contacts.getRange("B1:B101").format.columnWidth = 28;
contacts.getRange("C1:C101").format.columnWidth = 24;
contacts.getRange("D1:D101").format.columnWidth = 38;
const table = contacts.tables.add("A1:D101", true, "ContactsTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

instructions.showGridLines = false;
instructions.getRange("A1:D1").merge();
instructions.getRange("A1:D1").values = [["Client Contact Import"]];
instructions.getRange("A1:D1").format = {
  fill: "#17324D",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  rowHeight: 38,
  verticalAlignment: "center",
};
instructions.getRange("A3:B8").values = [
  ["How to use", "Enter one contact per row on the Contacts sheet."],
  ["Required", "Person Name and Company"],
  ["Optional", "Location and Website help identify the correct person."],
  ["Run", "Save this file as contacts.xlsx, then double-click run_windows.bat."],
  ["Blank rows", "Ignored automatically."],
  ["Tip", "You may paste a whole list directly under the headers."],
];
instructions.getRange("A3:A8").format = {
  fill: "#DCEAF7",
  font: { bold: true, color: "#17324D" },
  verticalAlignment: "top",
};
instructions.getRange("B3:B8").format = {
  fill: "#F8FAFC",
  font: { color: "#1F2937" },
  wrapText: true,
  verticalAlignment: "top",
};
instructions.getRange("A3:B8").format.borders = {
  preset: "all",
  style: "thin",
  color: "#D1D5DB",
};
instructions.getRange("A1:A8").format.columnWidth = 18;
instructions.getRange("B1:B8").format.columnWidth = 68;
instructions.getRange("A3:B8").format.rowHeight = 30;

const inspection = await workbook.inspect({
  kind: "table",
  range: "Contacts!A1:D6",
  include: "values,formulas",
  tableMaxRows: 6,
  tableMaxCols: 4,
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir("outputs/excel_contact_input", { recursive: true });
for (const sheetName of ["Contacts", "Instructions"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    `outputs/excel_contact_input/${sheetName.toLowerCase()}_preview.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("contacts.xlsx");
