//const httpProxy = require('http-proxy');

//const proxy = httpProxy.createProxyServer();

/*const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');*/

const dotenv = require('dotenv');
dotenv.config();

/*httpProxy.createServer({
    target: 'ws://localhost:3001',
    ws: true
}).listen(3000);*/

const options = {
    key: process.env.KEY_PEM,
    cert: process.env.CRT_PEM
};

const sessions = new Map();
const sessionIntervals = new Map();

function broadcast(consumer) {
    sessions.forEach(function each(session, client) {
        if (client.readyState === 1) {
            consumer(client);
        }
    });
}

function broadcastEvent(data) {
    broadcast((client) => {
        data.payload.subscription.transport.session_id = sessions.get(client);
        client.send(JSON.stringify(data));
    })
}


const path = require("path");
const fastify = require("fastify")({
    logger: false,
    //https: options,
});

fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
    prefix: "/",
});

fastify.register(require("@fastify/formbody"));

fastify.register(require("@fastify/websocket"), {
    errorHandler: function (error, conn /* SocketStream */, req /* FastifyRequest */, reply /* FastifyReply */) {
        console.log(error)
        conn.destroy(error)
    }
});

fastify.register(require("@fastify/view"), {
    engine: {
        handlebars: require("handlebars"),
    },
});

fastify.register(async function () {
    fastify.route({
        method: 'GET',
        url: '/',
        handler: (req, reply) => {
            reply.type('text/html').send(`
                <html>
                    <head>
                        <title>Eventsub Websocket</title>
                    </head>
                    <body>
                        <h1>Welcome to the Eventsub Websocket website</h1>
                    </body>
                </html>
            `);
        },
        wsHandler: (connection, req) => {
            connection.socket.on('message', function incoming(message) {
                if (message.toString() === "list") {
                    broadcast((client) => connection.socket.send(sessions.get(client)));
                    return;
                }

                console.log(`${sessions.get(connection.socket)}: ${message.toString()}`)
            });

            connection.socket.on('close', () => {
                console.log(`${sessions.get(connection.socket)} disconnected`)
                sessions.delete(connection.socket);
                clearInterval(sessionIntervals.get(connection.socket));
                sessionIntervals.delete(connection.socket);
            });

            const sessionId = generateRandomString();
            console.log(`${sessionId} connected`)

            connection.socket.send(JSON.stringify(JSON.parse(`
{
  "metadata": {
    "message_id": "${randomUuid()}",
    "message_type": "session_welcome",
    "message_timestamp": "${new Date().toISOString()}"
  },
  "payload": {
    "session": {
      "id": "${sessionId}",
      "status": "connected",
      "connected_at": "${new Date().toISOString()}",
      "keepalive_timeout_seconds": 10,
      "reconnect_url": null
    }
  }
}
    `)));

            sessions.set(connection.socket, sessionId);

            sessionIntervals.set(connection.socket, setInterval(() => {
                connection.socket.send(`{
                    "metadata": {
                        "message_id": "${randomUuid()}",
                        "message_type": "session_keepalive",
                        "message_timestamp": "${new Date().toISOString()}"
                    },
                    "payload": {}
                }`);
            }, 10_000));
        }
    })
})

const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
    seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}


//region Subs
fastify.get('/subs', (request, reply) => {
    reply.view('/src/pages/subs.hbs', {});
});

fastify.post('/subs', (request, reply) => {
    broadcastEvent(request.body)
    reply.redirect('/subs');
});
//endregion

//region Resubs
fastify.get('/resubs', (request, reply) => {
    reply.view('/src/pages/resubs.hbs', {});
});

fastify.post('/resubs', (request, reply) => {
    broadcastEvent(request.body)
    reply.redirect('/resubs');
});
//endregion

//region Gifts
fastify.get('/gifts', (request, reply) => {
    reply.view('/src/pages/gifts.hbs', {});
});

fastify.post('/gifts', (request, reply) => {
    broadcastEvent(request.body)
    reply.redirect('/gifts');
});
//endregion

//region Bits
fastify.get('/bits', (request, reply) => {
    reply.view('/src/pages/bits.hbs', {});
});

fastify.post('/bits', (request, reply) => {
    broadcastEvent(request.body)
    reply.redirect('/bits');
});
//endregion

//region Rewards
fastify.get('/rewards', (request, reply) => {
    reply.view('/src/pages/rewards.hbs', {});
});

fastify.post('/rewards', (request, reply) => {
    broadcastEvent(request.body)
    reply.redirect('/rewards');
});
//endregion

fastify.post('/eventsub/subscriptions', (request, reply) => {
    const json = request.body;
    console.log(`${json.transport.session_id} subscribed to ${json.type}`);
    reply.send(JSON.stringify(JSON.parse(`
{
  "data": [
    {
      "id": "${randomUuid()}",
      "status": "enabled",
      "type": "${json.type}",
      "version": "1",
      "cost": 0,
      "condition": {
        "broadcaster_user_id": "${json.condition.broadcaster_user_id}"
      },
      "transport": {
        "method": "websocket",
        "session_id": "${json.transport.session_id}"
      },
      "created_at": "${new Date().toISOString()}"
    }
  ],
  "total": 1,
  "total_cost": 0,
  "max_total_cost": 10000
}
    `)));
});

fastify.delete('/eventsub/subscriptions', (request, reply) => {
    request.send();
});

fastify.listen(
    {port: process.env.PORT, host: "0.0.0.0"},
    function (err, address) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log(`Your app is listening on ${address}`);
    }
);

function randomUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateRandomString() {
    const possibleCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";
    const length = Math.floor(Math.random() * (30 - 20 + 1)) + 20; // Generates a random number between 20 and 30
    for (let i = 0; i < length; i++) {
        randomString += possibleCharacters.charAt(Math.floor(Math.random() * possibleCharacters.length));
    }
    return randomString;
}
/*
const json1 = JSON.parse();
console.log(JSON.parse(`
{
  "data": [
    {
      "id": "${randomUuid()}",
      "status": "enabled",
      "type": "${json1.type}",
      "version": "1",
      "cost": 0,
      "condition": {
        "broadcaster_user_id": "${json1.condition.broadcaster_user_id}"
      },
      "transport": {
        "method": "websocket",
        "session_id": "${json1.transport.session_id}"
      },
      "created_at": "${new Date().toISOString()}"
    }
  ],
  "total": 1,
  "total_cost": 0,
  "max_total_cost": 10000
}
`))*/
