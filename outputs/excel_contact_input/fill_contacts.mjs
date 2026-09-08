import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("contacts.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const contacts = workbook.worksheets.getItem("Contacts");

contacts.getRange("A2:D6").values = [
  ["Carlo Khatchi", "Montclair Construction", null, null],
  ["Kelly McReynolds", "Texas Plumbing and Drain", null, null],
  ["Gary Davis", "Piedmont Plumbing and Fuel Piping", "Concord, NC", null],
  ["Angela Hartman", "Specialized Plumbing and Sewer Repair", "Roseville, CA", null],
  ["Chris Tucker", "Tucker 1 Handyman", "Joplin", null],
];

const check = await workbook.inspect({
  kind: "table",
  range: "Contacts!A1:D7",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 4,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir("outputs/01a05852-6315-70c3-b0d8-72cc446bc75a", { recursive: true });
for (const sheetName of ["Contacts", "Instructions"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    `outputs/01a05852-6315-70c3-b0d8-72cc446bc75a/${sheetName.toLowerCase()}_filled.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("contacts_filled.xlsx");
