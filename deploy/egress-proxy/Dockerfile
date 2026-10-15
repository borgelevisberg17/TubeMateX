FROM ubuntu:24.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends squid ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/cache/squid /var/log/squid \
    && chown -R proxy:proxy /var/cache/squid /var/log/squid /etc/squid
COPY squid.conf /etc/squid/squid.conf
RUN /usr/sbin/squid -k parse -f /etc/squid/squid.conf
USER proxy
EXPOSE 3128
CMD ["/usr/sbin/squid", "-N", "-f", "/etc/squid/squid.conf"]
