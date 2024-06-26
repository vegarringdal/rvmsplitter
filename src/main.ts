import { readRange } from "https://deno.land/std@0.183.0/io/read_range.ts";
import { parse } from "https://deno.land/std@0.182.0/flags/mod.ts";
import { dirname } from "https://deno.land/std@0.183.0/path/mod.ts";
import * as path from "https://deno.land/std@0.183.0/path/mod.ts";

performance.mark("START");

/*******************************************************************************
 * FLAGS
 */

const flags = parse(Deno.args, {
  string: [
    "input",
    "output",
    "help",
    "split-lvl",
    "rvmparser-executable",
    "output-gltf-split-level",
    "output-gltf-rotate-z-to-y",
    "tolerance",
    "output-gltf",
    "output-gltf-center",
  ],
});

if (Object.keys(flags).includes("help")) {
  console.log("");
  console.log("MANDATORY OPTIONS:");
  console.log("-----------------------------------------------");
  console.log("--input=somefile.rvm ");
  console.log("--output=outputfile.rvm");
  console.log("");
  console.log(
    "Output will be formatted like this: 'outputfile_X_.rvm' where X is root number"
  );
  console.log(
    "It will also print title and date from header, with json extension 'outputfile.json'"
  );
  console.log("");
  console.log("OPTIONAL OPTIONS:");
  console.log("-----------------------------------------------");
  console.log("--split-lvl                          default=0");
  console.log(
    "   This will extract files at this lvl, this also remove parents and set lvl as root"
  );
  console.log("--rvmparser=rvmparser.exe");
  console.log("");
  console.log("These are set if --rvmparser is used");
  console.log("--output-gltf-split-level=3          default: 3");
  console.log("--output-gltf-rotate-z-to-y=false    default: false");
  console.log("--tolerance=0.01                     default: 0.01");
  console.log("-----------------------------------------------");
  console.log("");
  Deno.exit(5);
}

if (!flags.input) {
  console.log("missing --input");
  Deno.exit(5);
}
if (!flags.output) {
  console.log("missing --output");
  Deno.exit(5);
}

/*******************************************************************************
 * MISC VARIABLES
 */

// file info
const file = await Deno.open(flags.input, { read: true });
const stats = await file.stat();
const outputFolder = path.resolve(dirname(flags.output));

//chunks we are reading
let chunkStart = 0;
let chunkEnd = 0;
const chunckReadSize = 25_000_000;

// parse info
let treeLvl = 0;
let siteCount = 0;
let groupStart = 0;
let splitLvl = parseInt(flags["split-lvl"] || "") || 0;
if (isNaN(splitLvl)) {
  splitLvl = 0;
}
let headerBuffer = new Uint8Array();
const blockParsed = new Set();
const endBuffer = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 78, 0, 0, 0, 68, 0, 0, 0, 58, 0, 0, 0, 0, 0,
  0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
]).reverse();

let date, title;
let endtagMissing = true;
let sitesWithoutPrim = 0;

/*******************************************************************************
 * RVM SPLITTER
 */
try {
  while (true) {
    if (chunkEnd + chunckReadSize < stats.size) {
      chunkEnd += chunckReadSize;
    } else if (chunkEnd + chunckReadSize >= stats.size) {
      chunkEnd = stats.size - 1;
    }

    // just to give some status
    console.log(
      `Working from ${Math.floor(chunkStart / 1_000_000)} - ${Math.floor(
        chunkEnd / 1_000_000
      )} MB, of total: ${Math.floor(stats.size / 1_000_000)} MB`
    );

    // we want to go back, so we dont cut middle of blocks we are looking for
    if (chunkStart > 0) {
      chunkStart = chunkStart - 50;
    }

    const bytes = await readRange(file, { start: chunkStart, end: chunkEnd });

    // -12, since we search i+12
    for (let i = 0; i < bytes.length - 20; i++) {
      // we will look for three structures in file "SITES"
      // these begin with CNTB and end with CNTE
      // there is also groups inside groups

      const a = bytes[i];
      const b = bytes[i + 4];
      const c = bytes[i + 8];
      const d = bytes[i + 12];
      // I prob should read out number in 13-16 and jump
      const e = bytes[i + 17]; // always 0
      const f = bytes[i + 18]; // always 0
      const g = bytes[i + 19]; // always 0
      const h = bytes[i + 20]; // always 1

      switch (true) {
        // CNTB
        case a === 67 &&
          b === 78 &&
          c === 84 &&
          d === 66 &&
          e === 0 &&
          f === 0 &&
          g === 0 &&
          h === 1:
          // since we do start-50 we might get overlast, if we do we need to check
          // if it handled, then we break
          if (blockParsed.has(chunkStart + i)) {
            break;
          }
          blockParsed.add(chunkStart + i);

          // extract header if no site count
          if (treeLvl === 0 && siteCount === 0) {
            headerBuffer = await readRange(file, { start: 0, end: i - 4 });

            // read out title and date to json file

            const titleStart = 32;
            const titleLength =
              new DataView(headerBuffer.buffer).getUint32(
                titleStart - 4, //there is a uint32 before header telling us how long it is
                false
              ) * 4;

            const noteStart = titleStart + titleLength;
            const noteLength =
              new DataView(headerBuffer.buffer).getUint32(noteStart, false) * 4;

            const dateStart = noteStart + noteLength + 8;

            const dateLength =
              new DataView(headerBuffer.buffer).getUint32(
                dateStart - 4, //there is a uint32 before date telling us how long it is
                false
              ) * 4;

            title = new TextDecoder().decode(
              headerBuffer.slice(titleStart, titleStart + titleLength)
            );
            date = new TextDecoder().decode(
              headerBuffer.slice(dateStart, dateStart + dateLength)
            );
          }

          // log from where we need to extract tree from
          if (treeLvl === splitLvl) {
            groupStart = chunkStart + (i - 3);
          }

          if (treeLvl < 0) {
            // file is not balanced, not sure why I got middle if file
            // more CNTE than CNTB
            treeLvl === 0;
          } else {
            treeLvl++;
          }

          break;

        case a === 69 &&
          b === 78 &&
          c === 68 &&
          d === 58 &&
          e === 0 &&
          f === 0 &&
          g === 0 &&
          h === 1:
          endtagMissing = false;
          break;

        // CNTE
        case a === 67 &&
          b === 78 &&
          c === 84 &&
          d === 69 &&
          e === 0 &&
          f === 0 &&
          g === 0 &&
          h === 1:
          // since we do start-50 we might get overlast, if we do we need to check
          // if it handled, then we break
          if (blockParsed.has(chunkStart + i)) {
            break;
          }
          blockParsed.add(chunkStart + i);

          treeLvl--;

          if (treeLvl === splitLvl) {
            // group done

            siteCount++;

            // extract three
            const buffer = await readRange(file, {
              start: groupStart,
              end: chunkStart + i + 20 + endBuffer.length, //+20 to get extra bytes rvm parser expects to find, like version + endbuffer we will add
            });

            // we need to update with "default END:" tag, so naviswork will be able to read it
            const at = buffer.length - 1;
            endBuffer.forEach((x, i) => {
              buffer[at - i] = x;
            });

            // we will now collect all locations of CNTB/CNTE/PRIM/CNTE
            // Since we need to rewrite buffe to contain correct location

            const startPositions = [];
            const types: string[] = [];

            for (let y = 0; y < buffer.length; y++) {
              const a = buffer[y];
              const b = buffer[y + 4];
              const c = buffer[y + 8];
              const d = buffer[y + 12];
              // I prob should read out number in 13-16 and jump
              const e = buffer[y + 17];
              const f = buffer[y + 18];
              const g = buffer[y + 19];
              const h = buffer[y + 20];

              switch (true) {
                // CNTB
                case a === 67 &&
                  b === 78 &&
                  c === 84 &&
                  d === 66 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("CNTB");
                  break;

                // PRIM
                case a === 80 &&
                  b === 82 &&
                  c === 73 &&
                  d === 77 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("PRIM");
                  break;

                // OBST
                case a === 79 &&
                  b === 66 &&
                  c === 83 &&
                  d === 84 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("OBST");
                  break;

                // INSU
                case a === 73 &&
                  b === 78 &&
                  c === 83 &&
                  d === 85 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("INSU");
                  break;

                // COLR
                case a === 67 &&
                  b === 79 &&
                  c === 76 &&
                  d === 82 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("COLR");
                  break;

                // CNTE
                case a === 67 &&
                  b === 78 &&
                  c === 84 &&
                  d === 69 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("CNTE");
                  break;

                // END:
                case a === 69 &&
                  b === 78 &&
                  c === 68 &&
                  d === 58 &&
                  e === 0 &&
                  f === 0 &&
                  g === 0 &&
                  h === 1:
                  startPositions.push(y - 3);
                  types.push("END:");
                  break;
              }
            }
            // add as last "expected pointer"
            startPositions.push(buffer.length - 4);
            // now we have all locations, lets update buffer

            let fromLocation = startPositions.shift() || 0;
            const dummyFloat32Buffer = new Uint8Array(4);

            const typeSet = new Set(types);
            typeSet.delete("HEAD");
            typeSet.delete("MODL");
            typeSet.delete("CNTB");
            typeSet.delete("CNTE");
            typeSet.delete("END:");

            if (typeSet.size === 0) {
              sitesWithoutPrim++;
            }

            startPositions.forEach((x, i) => {
              // just for debug
              const _type = types[i];

              new DataView(dummyFloat32Buffer.buffer).setUint32(
                0,
                headerBuffer.length + x,
                false // important, needs to be in BIG endian
              );

              buffer[fromLocation + 16] = dummyFloat32Buffer[0];
              buffer[fromLocation + 17] = dummyFloat32Buffer[1];
              buffer[fromLocation + 18] = dummyFloat32Buffer[2];
              buffer[fromLocation + 19] = dummyFloat32Buffer[3];
              fromLocation = x;
            });

            // buffer is updated, lets combine it with header and save

            const tempBuffer = new Uint8Array(
              headerBuffer.length + buffer.length
            );
            tempBuffer.set(new Uint8Array(headerBuffer.slice()), 0);
            tempBuffer.set(new Uint8Array(buffer), headerBuffer.length);

            await Deno.writeFile(
              `${flags.output.split(".rvm")[0]}_${siteCount}_.rvm`,
              tempBuffer
            );

            break;
          }
      }
    }

    chunkStart = chunkEnd;
    if (chunkEnd === stats.size - 1) {
      break;
    }
  }
} catch (e) {
  console.log(e);
}

performance.mark("MIDDLE");

/*******************************************************************************
 * RVM PARSER
 */

if (flags.rvmparser) {
  const defaultCmd = [path.resolve(flags.rvmparser as string)] as string[];

  if (flags["tolerance"]) {
    defaultCmd.push(`--tolerance=${flags["tolerance"]}`);
  } else {
    defaultCmd.push(`--tolerance=${0.01}`);
  }

  if (flags["output-gltf-rotate-z-to-y"]) {
    defaultCmd.push(
      `output-gltf-rotate-z-to-y=${flags["output-gltf-rotate-z-to-y"]}`
    );
  } else {
    defaultCmd.push(`--output-gltf-rotate-z-to-y=${false}`);
  }

  if (flags["output-gltf-split-level"]) {
    defaultCmd.push(
      `--output-gltf-split-level=${flags["output-gltf-split-level"]}`
    );
  } else {
    defaultCmd.push(`--output-gltf-split-level=${3}`);
  }

  for await (const dirEntry of Deno.readDir(outputFolder)) {
    if (dirEntry.isFile && dirEntry.name?.toLowerCase().includes(".rvm")) {
      const filePath = path.join(outputFolder, dirEntry.name);
      const cmd = defaultCmd.concat([
        `--output-gltf=${filePath.toLowerCase().replace(".rvm", ".glb")}`,
        filePath,
      ]);
      console.log("-----------------------------------------------");
      console.log("About to run", cmd.join("  "));
      console.log("-----------------------------------------------");
      const p = Deno.run({ cmd, stderr: "inherit", stdout: "inherit" });
      await p.status().catch((e) => {
        console.log(e);
      });
    }
  }
}

let warnings = "";
if (endtagMissing) {
  warnings = "Endtag missing, file might be corrupt. ";
}

// print info
await Deno.writeFile(
  `${flags.output.split(".rvm")[0]}.json`,
  new TextEncoder().encode(
    JSON.stringify({
      title,
      date,
      warning: warnings === "" ? null : warnings,
    })
  )
);

performance.mark("END");

// print runtime

const splitterPerformace = performance.measure(
  "RVMSPLITTER",
  "START",
  "MIDDLE"
);
const parserPerformace = performance.measure("RVMPARSER", "MIDDLE", "END");
const allPerformace = performance.measure("ALL", "START", "END");
console.log("-----------------------------------------------");
console.log("files:", siteCount);
console.log(
  "files without prim:",
  sitesWithoutPrim,
  `(${siteCount - sitesWithoutPrim})`
);

console.log(
  "RVM SPLITTER runtime ms:",
  Math.floor(splitterPerformace.duration)
);
console.log("RVM PARSER runtime ms:", Math.floor(parserPerformace.duration));
console.log("TOTAL runtime ms:", Math.floor(allPerformace.duration));
console.log("-----------------------------------------------");
