FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/healthz',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "src/index.mjs"]
