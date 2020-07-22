FROM golang:1.14

WORKDIR /go/src/app

COPY . .
# zevin: proxy
RUN go env -w GO111MODULE=on && go env -w  GOPROXY=https://goproxy.io
RUN go get -d -v ./...
RUN go install -v ./...

CMD dispatch
