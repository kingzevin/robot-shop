const instana = require('@instana/collector');
// init tracing
// MUST be done before loading anything else!
instana({
    tracing: {
        enabled: true
    }
});

process.env["MONGO_URL"] = 'mongodb://172.19.0.1:27019/catalogue';
process.env["CATALOGUE_SERVER_PORT"] = '8081'; // 8080 is occupied by action image.
process.env['NODE_TLS_REJECT_UNAUTHORIZED']=0

const mongoClient = require('mongodb').MongoClient;
const mongoObjectID = require('mongodb').ObjectID;
const bodyParser = require('body-parser');
const express = require('express');
const pino = require('pino');
const expPino = require('express-pino-logger');

const logger = pino({
    level: 'info',
    prettyPrint: false,
    useLevelLabels: true
});
const expLogger = expPino({
    logger: logger
});

// MongoDB
var db;
var collection;
var mongoConnected = false;

const app = express();

app.use(expLogger);

app.use((req, res, next) => {
    res.set('Timing-Allow-Origin', '*');
    res.set('Access-Control-Allow-Origin', '*');
    next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/health', (req, res) => {
    var stat = {
        app: 'OK',
        mongo: mongoConnected
    };
    res.json(stat);
});

// all products
app.get('/products', (req, res) => {
    if(mongoConnected) {
        collection.find({}).toArray().then((products) => {
            res.json(products);
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not avaiable');
    }
});

// product by SKU
app.get('/product/:sku', (req, res) => {
    if(mongoConnected) {
        // optionally slow this down
        const delay = process.env.GO_SLOW || 0;
        setTimeout(() => {
        collection.findOne({sku: req.params.sku}).then((product) => {
            req.log.info('product', product);
            if(product) {
                res.json(product);
            } else {
                res.status(404).send('SKU not found');
            }
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
        }, delay);
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// products in a category
app.get('/products/:cat', (req, res) => {
    if(mongoConnected) {
        collection.find({ categories: req.params.cat }).sort({ name: 1 }).toArray().then((products) => {
            if(products) {
                res.json(products);
            } else {
                res.status(404).send('No products for ' + req.params.cat);
            }
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not avaiable');
    }
});

// all categories
app.get('/categories', (req, res) => {
    if(mongoConnected) {
        collection.distinct('categories').then((categories) => {
            res.json(categories);
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// search name and description
app.get('/search/:text', (req, res) => {
    if(mongoConnected) {
        collection.find({ '$text': { '$search': req.params.text }}).toArray().then((hits) => {
            res.json(hits);
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// set up Mongo
function mongoConnect() {
    return new Promise((resolve, reject) => {
        var mongoURL = process.env.MONGO_URL || 'mongodb://mongodb:27017/catalogue';
        mongoClient.connect(mongoURL, (error, client) => {
            if(error) {
                reject(error);
            } else {
                db = client.db('catalogue');
                collection = db.collection('products');
                resolve('connected');
            }
        });
    });
}

// mongodb connection retry loop
function mongoLoop() {
    mongoConnect().then((r) => {
        mongoConnected = true;
        logger.info('MongoDB connected');
    }).catch((e) => {
        logger.error('ERROR', e);
        setTimeout(mongoLoop, 2000);
    });
}

mongoLoop();

// fire it up!
const port = process.env.CATALOGUE_SERVER_PORT || '8080';
app.listen(port, () => {
    logger.info('Started on port', port);
});

exports.main = test

function test(params={}){
    const url = params.__ow_path || '/health';
    const method = params.__ow_method || 'get';
    const headers = params.__ow_headers || {
      'Connection': 'keep-alive',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36',
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,fr;q=0.6',
      'Cookie': 'sharelatex.sid=s%3AVVk1PqK4VnJLoGBMSFYwsoLT4W0yulti.JR4Yj544rl6yg%2BaOoLzky5ke8lS51jrYiYnpLN4MzU4'
    };
    
    const { promisify } = require('util')
    const request = require("request")
    const reqPromise = promisify(request[method]);
    return (async () => {
        let result;
        let opt={}
        opt['headers'] = headers;
        opt['url'] = `http://localhost:${port}${url}`;
        let str = params.__ow_body || '';
        if(str !== "" && Buffer.from(str, 'base64').toString('base64') === str){
          // base64
          params.__ow_body = Buffer.from(str, 'base64').toString('ascii');
        }
        opt['body'] = params.__ow_body;
        if(params.__ow_query !== ""){
          const qs = '?' + params.__ow_query;
          opt['url'] = opt['url'] + qs;
        }
        result = await reqPromise(opt);
        var response = JSON.parse(JSON.stringify(result));
        delete response.request
        return response
      })();
}

if (!module.parent) {
    (async () => {
      let result = await test();
      console.log(result);
    })();
}
  