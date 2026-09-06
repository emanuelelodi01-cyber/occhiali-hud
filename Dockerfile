# syntax=docker/dockerfile:1
FROM rust:1-trixie AS builder

ARG DX_VERSION=0.7.10

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown \
    && curl -fsSL "https://github.com/dioxuslabs/dioxus/releases/download/v${DX_VERSION}/dx-x86_64-unknown-linux-gnu.tar.gz" \
       | tar -xz -C /usr/local/bin dx

WORKDIR /app

COPY Cargo.toml Cargo.lock Dioxus.toml index.html ./
COPY assets/ ./assets/
COPY src/ ./src/

RUN dx build --platform web --release

# Stage 2: Nginx Web Server + Node.js WebSocket Relay
FROM nginx:alpine

RUN apk add --no-cache nodejs npm

WORKDIR /app/server
COPY server/package.json ./
RUN npm install --production

COPY server/ ./
RUN chmod +x entrypoint.sh

COPY --from=builder /app/target/dx/occhiali-hud/release/web/public /usr/share/nginx/html
COPY assets/ /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 3001

CMD ["/app/server/entrypoint.sh"]
