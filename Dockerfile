# Stage 1: Build Rust WASM with Dioxus CLI
FROM rust:1.85-bookworm AS builder

# Install pre-built cargo-binstall for lightning-fast dx installation
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
RUN cargo binstall --no-confirm dioxus-cli@0.7.10
RUN rustup target add wasm32-unknown-unknown

WORKDIR /app

# Copy dependency definitions and source
COPY Cargo.toml Dioxus.toml index.html ./
COPY assets/ ./assets/
COPY src/ ./src/

# Build optimized WebAssembly PWA
RUN dx build --platform web --release

# Stage 2: Ultra-lightweight Nginx runtime (< 20MB)
FROM nginx:alpine

COPY --from=builder /app/target/dx/occhiali-hud/release/web/public /usr/share/nginx/html
COPY assets/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
