FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl
COPY --from=bluenviron/mediamtx:1.11.3 /mediamtx /mediamtx
EXPOSE 1935 8888 9997 9998
ENTRYPOINT ["/mediamtx"]
