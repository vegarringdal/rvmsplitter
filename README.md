# rvmsplitter

Helper to split large rvm filer, so I can use [rvmparser](https://github.com/cdyk/rvmparser) without using to much memory on Azure Container instance


# Development/run/debug
* add input/arg in .vscode/lunch.json to match your input and output file.
* then debug and run

# Build new executable
* `deno compile --allow-all --target=x86_64-unknown-linux-gnu --output rvmsplitter main.ts`
* `deno compile --allow-all --target=x86_64-pc-windows-msvc --output rvmsplitter main.ts`


# Usage
* `./rvmsplitter --input=xyz.rvm --output=./temp/xyz.rvm`
* `./rvmsplitter.exe --input=xyz.rvm --output=./temp/xyz.rvm`

Output will be `xyz-x.rvm` where x utput is the site number in file


# Todo

Do I want to add a split lvl, atm its on top lvl of tree, usually "SITE"