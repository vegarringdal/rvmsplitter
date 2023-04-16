import { readRange } from "https://deno.land/std@0.183.0/io/read_range.ts";
import { parse } from "https://deno.land/std@0.182.0/flags/mod.ts";

// timer
console.time("Execution time");

const flags = parse(Deno.args, {
  string: ["input", "output", "help"],
});

if (flags.help) {
  console.log(
    "----------------------------------------------------------------------------------------------"
  );
  console.log("linux:");
  console.log("rvmsplitter --input=somefile.rmv --output=outputfile.rvm");
  console.log(
    "----------------------------------------------------------------------------------------------"
  );
  console.log("windows:");
  console.log("rvmsplitter.exe --input=somefile.rmv --output=outputfile.rvm");
  console.log(
    "----------------------------------------------------------------------------------------------"
  );
  console.log(
    "outputfile.rvm will be converted into outputfile-X.rvm, where x is the site number"
  );
  console.log(
    "----------------------------------------------------------------------------------------------"
  );
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

// file info
const file = await Deno.open(flags.input, { read: true });
const stats = await file.stat();

//chunks we are reading
let chunkStart = 0;
let chunkEnd = 0;
const chunckReadSize = 25_000_000;

// parse info
let threeLvl = 0;
let siteCount = 0;
let groupStart = 0;
let headerBuffer = new Uint8Array();
const blockParsed = new Set();

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
  for (let i = 0; i < bytes.length - 12; i++) {
    // we will look for three structures in file "SITES"
    // these begin with CNTB and end with CNTE
    // there is also groups inside groups

    const a = bytes[i];
    const b = bytes[i + 4];
    const c = bytes[i + 8];
    const d = bytes[i + 12];

    switch (true) {
      // CNTB
      case a === 67 && b === 78 && c === 84 && d === 66:
        // since we do start-50 we might get overlast, if we do we need to check
        // if it handled, then we break
        if (blockParsed.has(chunkStart + i)) {
          break;
        }
        blockParsed.add(chunkStart + i);

        // extract header if no site count
        if (threeLvl === 0 && siteCount === 0) {
          headerBuffer = await readRange(file, { start: 0, end: i - 4 });
        }

        // log from where we need to extract tree from
        if (threeLvl === 0) {
          groupStart = chunkStart + (i - 3);
        }

        threeLvl++;

        break;

      // CNTE
      case a === 67 && b === 78 && c === 84 && d === 69:
        // since we do start-50 we might get overlast, if we do we need to check
        // if it handled, then we break
        if (blockParsed.has(chunkStart + i)) {
          break;
        }
        blockParsed.add(chunkStart + i);

        threeLvl--;

        if (threeLvl === 0) {
          // group done

          siteCount++;

          // extract three
          const buffer = await readRange(file, {
            start: groupStart,
            end: chunkStart + i + 20, //+20 to get extra bytes rvm parser expects to find, like version
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

            switch (true) {
              // CNTB
              case a === 67 && b === 78 && c === 84 && d === 66:
                startPositions.push(y - 3);
                types.push("CNTB");
                break;

              // PRIM
              case a === 80 && b === 82 && c === 73 && d === 77:
                startPositions.push(y - 3);
                types.push("PRIM");
                break;

              // COLR
              case a === 67 && b === 79 && c === 76 && d === 82:
                startPositions.push(y - 3);
                types.push("COLR");
                break;

              // CNTE
              case a === 67 && b === 78 && c === 84 && d === 69:
                startPositions.push(y - 3);
                types.push("CNTE");
                break;
            }
          }

          // now we have all locations, lets update buffer

          let fromLocation = startPositions.shift() || 0;
          const dummyFloat32Buffer = new Uint8Array(4);
          startPositions.forEach((x, i) => {
            // just for debug
            const _type = types[i];

            new DataView(dummyFloat32Buffer.buffer).setInt32(
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
            `${flags.output.split(".rvm")[0]}-${siteCount}.rvm`,
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

console.timeEnd("Execution time");
