FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bash \
       build-essential \
       ca-certificates \
       golang-go \
       openjdk-17-jdk-headless \
       php-cli \
       python3 \
       python3-pip \
       ruby \
       rustc \
       cargo \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin sandbox

WORKDIR /workspace
RUN chown 10001:10001 /workspace
USER 10001:10001

CMD ["node", "--version"]
