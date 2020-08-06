FROM nginx:1.16

EXPOSE 8080 8079

ENV CATALOGUE_HOST=catalogue \
    USER_HOST=user \
    CART_HOST=cart \
    SHIPPING_HOST=shipping \
    PAYMENT_HOST=payment \
    RATINGS_HOST=ratings

COPY entrypoint.sh /root/
ENTRYPOINT ["/root/entrypoint.sh"]

COPY default.conf.template /etc/nginx/conf.d/default.conf.template
COPY static /usr/share/nginx/html
COPY openwhisk-server-cert.pem /etc/nginx/openwhisk-server-cert.pem
COPY openwhisk-server-key.pem /etc/nginx/openwhisk-server-key.pem
COPY openwhisk-client-ca-cert.pem /etc/nginx/openwhisk-client-ca-cert.pem