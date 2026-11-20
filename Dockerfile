# Works on Railway, Fly.io, a VPS, or any Docker host.
#   docker build -t campusflow .
#   docker run -p 3000:3000 -v campusflow-data:/data campusflow
FROM node:22-slim
ENV NODE_ENV=production \
    TZ=Asia/Manila \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY . .
RUN rm -rf data && mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "backend/server.js"]
