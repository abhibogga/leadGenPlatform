import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("contacts.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table,computedStyle",
  sheetId: "Contacts",
  range: "A1:D8",
  maxChars: 6000,
  tableMaxRows: 8,
  tableMaxCols: 4,
});
console.log(summary.ndjson);
const preview = await workbook.render({
  sheetName: "Contacts",
  range: "A1:D8",
  scale: 2,
  format: "png",
});
await fs.writeFile(
  "outputs/excel_contact_input/before_fill.png",
  new Uint8Array(await preview.arrayBuffer()),
);
