# Risk Register & KRI — Cloud Run (ใช้ business logic ชุดเดียวกับ Apps Script ใน src/)
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY cloud/package.json cloud/package-lock.json cloud/
RUN cd cloud && npm ci --omit=dev --no-audit --no-fund
COPY src/ src/
COPY cloud/ cloud/
WORKDIR /app/cloud
USER node
CMD ["node", "server.js"]
