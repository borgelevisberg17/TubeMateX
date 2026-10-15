FROM ubuntu/squid:latest
COPY squid.conf /etc/squid/squid.conf
EXPOSE 3128
CMD ["-N", "-f", "/etc/squid/squid.conf"]
