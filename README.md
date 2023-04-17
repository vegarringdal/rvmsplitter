# rvmsplitter

Helper to split large rvm filer, so I can use [rvmparser](https://github.com/cdyk/rvmparser) without using to much memory on Azure Container instance

> some asbuilt files have issues. not solved why rvmparser is unable to read them, it just says successfully parsed

## Development/run/debug
* add input/arg in .vscode/lunch.json to match your input and output file.
* then debug and run

## Build new executable
* `deno compile --allow-all --target=x86_64-unknown-linux-gnu --output ./dist/rvmsplitter ./src/main.ts`
* `deno compile --allow-all --target=x86_64-pc-windows-msvc --output ./dist/rvmsplitter ./src/main.ts`


## Usage splitting
* `./dist/rvmsplitter.exe --input=xyz.rvm --output=./temp/xyz.rvm`

Output will be `xyz_x_.rvm` where x utput is the site number in file/

Last `_` is to help overlap of filenames with using rvmparser and `output-gltf-split-level`


## Usage splitting and running rvm parser (for glb creation)
* `./dist/rvmsplitter.exe --input=xx.rvm --output=./temp/xyz.rvm --rvmparser=./dist/rvmparser.exe`



## All options

* `./dist/rvmsplitter.exe --help`

```bash
MANDATORY OPTIONS:
-----------------------------------------------
--input=somefile.rvm
--output=outputfile.rvm

Output will be formatted like this: 'outputfile_X_.rvm' where X is root number
It will also print title and date from header, with json extensionoutputfile.json

OPTIONAL OPTIONS:
-----------------------------------------------
--rvmparser=rvmparser.exe

These are set if --rvmparser is used
--output-gltf-split-level=3  default:3
--output-gltf-rotate-z-to-y=false default:false
--tolerance=0.01 default:0.01
-----------------------------------------------
```

