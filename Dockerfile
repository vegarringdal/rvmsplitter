# just to be able to try out linux version in docker
FROM ubuntu

WORKDIR /usr/src/app
COPY dist/* ./
COPY zz.rvm ./zz.rvm
RUN mkdir temp
ENTRYPOINT ["./rvmsplitter", "--input=./xyz.rvm", "--output=./temp/xyz.rvm", "--rvmparser=./rvmparser"]