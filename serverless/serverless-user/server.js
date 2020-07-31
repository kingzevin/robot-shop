const instana = require('@instana/collector');
// init tracing
// MUST be done before loading anything else!
instana({
    tracing: {
        enabled: true
    }
});

process.env["REDIS_HOST"] = '172.17.0.1';
process.env["REDIS_PORT"] = '6381';
process.env["MONGO_URL"] = 'mongodb://172.17.0.1:27019/users';
process.env["USER_SERVER_PORT"] = '8081'; // 8080 is occupied by action image.
process.env['NODE_TLS_REJECT_UNAUTHORIZED']=0

const mongoClient = require('mongodb').MongoClient;
const mongoObjectID = require('mongodb').ObjectID;
const redis = require('redis');
const bodyParser = require('body-parser');
const express = require('express');
const pino = require('pino');
const expPino = require('express-pino-logger');

// MongoDB
var db;
var usersCollection;
var ordersCollection;
var mongoConnected = false;

const logger = pino({
    level: 'info',
    prettyPrint: false,
    useLevelLabels: true
});
const expLogger = expPino({
    logger: logger

});

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

// use REDIS INCR to track anonymous users
app.get('/uniqueid', (req, res) => {
    // get number from Redis
    redisClient.incr('anonymous-counter', (err, r) => {
        if(!err) {
            res.json({
                uuid: 'anonymous-' + r
            });
        } else {
            req.log.error('ERROR', err);
            res.status(500).send(err);
        }
    });
});

// check user exists
app.get('/check/:id', (req, res) => {
    if(mongoConnected) {
        usersCollection.findOne({name: req.params.id}).then((user) => {
            if(user) {
                res.send('OK');
            } else {
                res.status(404).send('user not found');
            }
        }).catch((e) => {
            req.log.error(e);
            res.send(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// return all users for debugging only
app.get('/users', (req, res) => {
    if(mongoConnected) {
        usersCollection.find().toArray().then((users) => {
            res.json(users);
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

app.post('/login', (req, res) => {
    req.log.info('login', req.body);
    if(req.body.name === undefined || req.body.password === undefined) {
        req.log.warn('credentails not complete');
        res.status(400).send('name or passowrd not supplied');
    } else if(mongoConnected) {
        usersCollection.findOne({
            name: req.body.name,
        }).then((user) => {
            req.log.info('user', user);
            if(user) {
                if(user.password == req.body.password) {
                    res.json(user);
                } else {
                    res.status(404).send('incorrect password');
                }
            } else {
                res.status(404).send('name not found');
            }
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// TODO - validate email address format
app.post('/register', (req, res) => {
    req.log.info('register', req.body);
    if(req.body.name === undefined || req.body.password === undefined || req.body.email === undefined) {
        req.log.warn('insufficient data');
        res.status(400).send('insufficient data');
    } else if(mongoConnected) {
        // check if name already exists
        usersCollection.findOne({name: req.body.name}).then((user) => {
            if(user) {
                req.log.warn('user already exists');
                res.status(400).send('name already exists');
            } else {
                // create new user
                usersCollection.insertOne({
                    name: req.body.name,
                    password: req.body.password,
                    email: req.body.email
                }).then((r) => {
                    req.log.info('inserted', r.result);
                    res.send('OK');
                }).catch((e) => {
                    req.log.error('ERROR', e);
                    res.status(500).send(e);
                });
            }
        }).catch((e) => {
            req.log.error('ERROR', e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

app.post('/order/:id', (req, res) => {
    req.log.info('order', req.body);
    // only for registered users
    if(mongoConnected) {
        usersCollection.findOne({
            name: req.params.id
        }).then((user) => {
            if(user) {
                // found user record
                // get orders
                ordersCollection.findOne({
                    name: req.params.id
                }).then((history) => {
                    if(history) {
                        var list = history.history;
                        list.push(req.body);
                        ordersCollection.updateOne(
                            { name: req.params.id },
                            { $set: { history: list }}
                        ).then((r) => {
                            res.send('OK');
                        }).catch((e) => {
                            req.log.error(e);
                            res.status(500).send(e);
                        });
                    } else {
                        // no history
                        ordersCollection.insertOne({
                            name: req.params.id,
                            history: [ req.body ]
                        }).then((r) => {
                            res.send('OK');
                        }).catch((e) => {
                            req.log.error(e);
                            res.status(500).send(e);
                        });
                    }
                }).catch((e) => {
                    req.log.error(e);
                    res.status(500).send(e);
                });
            } else {
                res.status(404).send('name not found');
            }
        }).catch((e) => {
            req.log.error(e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

app.get('/history/:id', (req, res) => {
    if(mongoConnected) {
        ordersCollection.findOne({
            name: req.params.id
        }).then((history) => {
            if(history) {
                res.json(history);
            } else {
                res.status(404).send('history not found');
            }
        }).catch((e) => {
            req.log.error(e);
            res.status(500).send(e);
        });
    } else {
        req.log.error('database not available');
        res.status(500).send('database not available');
    }
});

// connect to Redis
var redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || '6379'
});

redisClient.on('error', (e) => {
    logger.error('Redis ERROR', e);
});
redisClient.on('ready', (r) => {
    logger.info('Redis READY', r);
});

// set up Mongo
function mongoConnect() {
    return new Promise((resolve, reject) => {
        var mongoURL = process.env.MONGO_URL || 'mongodb://mongodb:27017/users';
        mongoClient.connect(mongoURL, (error, client) => {
            if(error) {
                reject(error);
            } else {
                db = client.db('users');
                usersCollection = db.collection('users');
                ordersCollection = db.collection('orders');
                resolve('connected');
            }
        });
    });
}

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
const port = process.env.USER_SERVER_PORT || '8080';
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
  