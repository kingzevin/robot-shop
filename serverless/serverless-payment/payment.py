import instana
import os
import sys
import time
import logging
import uuid
import json
import requests
import traceback
import threading
import opentracing as ot
import opentracing.ext.tags as tags
from flask import Flask
from flask import Response
from flask import request
from flask import jsonify
# from rabbitmq import Publisher
# Prometheus
import prometheus_client
from prometheus_client import Counter, Histogram

print('name: ')
app = Flask('__main__')
app.logger.setLevel(logging.INFO)

CART = os.getenv('CART_HOST', 'cart')
USER = os.getenv('USER_HOST', 'user')
CART_URL = 'http://' + CART + ':8080'
USER_URL = 'http://' + USER + ':8080'
CART_URL = 'https://172.17.0.1/api/v1/web/guest/robotshop/cart'
USER_URL = 'https://172.17.0.1/api/v1/web/guest/robotshop/user'
os.environ['SHOP_PAYMENT_PORT'] = '8082'
PAYMENT_GATEWAY = os.getenv('PAYMENT_GATEWAY', 'https://paypal.com/')

# Prometheus
PromMetrics = {}
PromMetrics['SOLD_COUNTER'] = Counter('sold_count', 'Running count of items sold')
PromMetrics['AUS'] = Histogram('units_sold', 'Avergae Unit Sale', buckets=(1, 2, 5, 10, 100))
PromMetrics['AVS'] = Histogram('cart_value', 'Avergae Value Sale', buckets=(100, 200, 500, 1000, 2000, 5000, 10000))


@app.errorhandler(Exception)
def exception_handler(err):
    app.logger.error(str(err))
    return str(err), 500

@app.route('/health', methods=['GET'])
def health():
    return 'OK'

# Prometheus
@app.route('/metrics', methods=['GET'])
def metrics():
    res = []
    for m in PromMetrics.values():
        res.append(prometheus_client.generate_latest(m))

    return Response(res, mimetype='text/plain')


@app.route('/pay/<id>', methods=['POST'])
def pay(id):
    app.logger.info('payment for {}'.format(id))
    cart = request.get_json()
    app.logger.info(cart)

    anonymous_user = True

    # add some log info to the active trace
    span = ot.tracer.active_span
    span.log_kv({'id': id})
    span.log_kv({'cart': cart})

    # check user exists
    try:
        req = requests.get(USER_URL + '/check/' + id, verify = False)
    except requests.exceptions.RequestException as err:
        app.logger.error(err)
        return str(err), 500
    if req.status_code == 200:
        anonymous_user = False

    # check that the cart is valid
    # this will blow up if the cart is not valid
    has_shipping = False
    for item in cart.get('items'):
        if item.get('sku') == 'SHIP':
            has_shipping = True

    if cart.get('total', 0) == 0 or has_shipping == False:
        app.logger.warn('cart not valid')
        return 'cart not valid', 400

    # dummy call to payment gateway, hope they dont object
    try:
        req = requests.get(PAYMENT_GATEWAY)
        app.logger.info('{} returned {}'.format(PAYMENT_GATEWAY, req.status_code))
    except requests.exceptions.RequestException as err:
        app.logger.error(err)
        return str(err), 500
    if req.status_code != 200:
        return 'payment error', req.status_code

    # Prometheus
    # items purchased
    item_count = countItems(cart.get('items', []))
    PromMetrics['SOLD_COUNTER'].inc(item_count)
    PromMetrics['AUS'].observe(item_count)
    PromMetrics['AVS'].observe(cart.get('total', 0))

    # Generate order id
    orderid = str(uuid.uuid4())
    dispatch({ 'orderid': orderid, 'user': id, 'cart': cart })

    # add to order history
    if not anonymous_user:
        try:
            req = requests.post(USER_URL + '/order/' + id,
                    data=json.dumps({'orderid': orderid, 'cart': cart}),
                    headers={'Content-Type': 'application/json'}, verify = False)
            app.logger.info('order history returned {}'.format(req.status_code))
        except requests.exceptions.RequestException as err:
            app.logger.error(err)
            return str(err), 500

    # delete cart
    try:
        req = requests.delete(CART_URL + '/cart/' + id, verify = False);
        app.logger.info('cart delete returned {}'.format(req.status_code))
    except requests.exceptions.RequestException as err:
        app.logger.error(err)
        return str(err), 500
    if req.status_code != 200:
        return 'order history update error', req.status_code

    return jsonify({ 'orderid': orderid })

def dispatch(order):
    # no rabbitmq now
    app.logger.info('dispatch')
    DISPATCH_URL = 'https://172.17.0.1/api/v1/namespaces/guest/actions/robotshop/dispatch'
    user_pass = ('23bc46b1-71f6-4ed5-8c54-816aa4f8c502', '123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP')
    req = requests.post(DISPATCH_URL, json = {'orderid': order.get('orderid')}, params = {'blocking': 'false'}, auth = user_pass, verify = False)

def countItems(items):
    count = 0
    for item in items:
        if item.get('sku') != 'SHIP':
            count += item.get('qty')
    return count


sh = logging.StreamHandler(sys.stdout)
sh.setLevel(logging.INFO)
fmt = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
app.logger.info('Payment gateway {}'.format(PAYMENT_GATEWAY))
port = int(os.getenv("SHOP_PAYMENT_PORT", "8080"))
app.logger.info('Starting on port {}'.format(port))
print('here')
# app.run(host='0.0.0.0', port=port)

class myThread(threading.Thread):
    def __init__(self, port):
        threading.Thread.__init__(self)
        self.port = port

    def run(self):
        app.run(host='0.0.0.0', port = self.port)

thread = myThread(port)
thread.start()

def main(params):
    if params.get('__ow_method'):
        url = 'http://localhost:' + str(port) + params.get('__ow_path')
        if params.get('__ow_query'):
            url += '?' + params.get('__ow_query')
        headers = params.get('__ow_headers')
        body = params.get('__ow_body')
        if params.get('__ow_method') == 'get':
            req = requests.get(url, headers = headers) 
        elif params.get('__ow_method') == 'post':
            req = requests.post(url, headers = headers, data = body)  
        elif params.get('__ow_method') == 'delete':
            req = requests.delete(url, headers = headers) 
        elif params.get('__ow_method') == 'put':
            req = requests.put(url, headers = headers, data = body) 
        return {'body': req.text, 'heaers': str(req.headers)}
        # return {'body': req.text, heaers: req.headers}
    else:
        return {'body': 'error! no method'}