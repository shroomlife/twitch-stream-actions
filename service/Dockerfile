FROM oven/bun:1.4.4
USER root
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=bun:bun service/server.ts service/stream-status.ts service/memories.ts ./service/
COPY --chown=bun:bun src/catalog.json ./src/catalog.json
COPY --chown=bun:bun stage-dist ./stage-dist
RUN mkdir /data && chown bun:bun /data
USER bun
ENV ACTIONS_HOST=0.0.0.0 PORT=27019 ACTIONS_DB=/data/actions.sqlite
EXPOSE 27019
CMD ["bun", "service/server.ts"]

