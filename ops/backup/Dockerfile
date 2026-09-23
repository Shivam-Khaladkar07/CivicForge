FROM alpine:3.21

RUN apk add --no-cache bash ca-certificates postgresql-client restic tzdata
COPY backup-loop.sh restore-drill.sh /usr/local/bin/
RUN chmod 0555 /usr/local/bin/backup-loop.sh /usr/local/bin/restore-drill.sh \
    && addgroup -S backup && adduser -S backup -G backup \
    && mkdir -p /backup-state /restic-cache /restore-work \
    && chown -R backup:backup /backup-state /restic-cache /restore-work

USER backup
ENV RESTIC_CACHE_DIR=/restic-cache
ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]
