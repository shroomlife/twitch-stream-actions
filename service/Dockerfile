FROM oven/bun:1.4.4
USER root
WORKDIR /app
COPY --chown=bun:bun service/server.ts service/config.ts service/stream-status.ts service/memories.ts ./service/
COPY --chown=bun:bun src/catalog.json ./src/catalog.json
COPY --chown=bun:bun stage-dist ./stage-dist
# /data holds the SQLite database and reaction-photos/; mount a persistent volume here.
RUN mkdir /data && chown bun:bun /data
USER bun
ENV ACTIONS_HOST=0.0.0.0 PORT=27019 ACTIONS_DB=/data/actions.sqlite
EXPOSE 27019
# The image has neither curl nor wget, so Bun itself probes the health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 27019) + '/stream-actions/health', { signal: AbortSignal.timeout(4000) }).then(res => process.exit(res.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "service/server.ts"]
