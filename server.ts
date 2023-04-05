import fs from "fs";
import registerClasses, {Class} from "./register";
import {Condition, Metadata, NotificationMessage, Payload, Subscription, Transport} from "./eventsub_types";
import {Events} from "./event_types";
import Fastify, {FastifyReply, FastifyRequest} from "fastify";
import {SocketStream} from "@fastify/websocket";
import Handlebars from "handlebars";
import loki from "lokijs";
import ejs from "ejs";
import * as dotenv from "dotenv"
import * as path from "path"
import assert from "assert";
import {hashCode, hashId, safeString} from "./utils";

const database = new loki('database');
const fastify = Fastify({logger: false});
dotenv.config();

const events: Events = require("./src/events.json");
const types: string[] = [];
const translations: Translation = require("./src/translations.json");
const sessions: Collection<{
    id: string
    client: WebSocket
    interval: number
}> = database.addCollection("sessions", {
    unique: ['id', 'client']
});
const subscriptions: Collection<{
    sessionId: string
    id: string
    type: string
    version: string
    token: string
    clientId: string
    condition: EventSubCondition
    transport: EventSubTransport
}> = database.addCollection("subscriptions");
export const fieldCache: Collection<{
    fieldName: string
    parent: string
    parentHash: string
    alias: string
    hashId: string
}> = database.addCollection("fields");
export const typeCache: Collection<{
    alias: string
    type: Class<any>
}> = database.addCollection("types", {
    unique: ['alias']
});

export function registerClass(alias: string, clazz: Class<any>): void {
    if (typeCache.by("alias", alias) !== undefined) {
        throw `${alias} already has been registered!`;
    }
    typeCache.insert({"alias": alias, "type": clazz});
}

export function defaultParser(input: string): object {
    try {
        const value = JSON.parse(input);
        if (typeof value === "object") return value as object;
    } catch (e) {/**/
    }
    throw "Failed to parse value"
}

export function getTranslation(key: string): string {
    const translation = translations[key];
    return translation === undefined ? key : translation;
}

console.log("Registering classes");
registerClasses();

console.log("Registering children");
typeCache.data.forEach(value => {
    const parentHash = hashId(value.alias);
    const childs = value.type.buildChilds();
    for (const child of childs) {
        fieldCache.insert({
            alias: child.alias,
            parent: value.alias,
            parentHash: parentHash,
            fieldName: child.fieldName,
            hashId: child.id
        });
    }
});

type Obj = {
    [key: string]: any
}

type Translation = {
    [key: string]: string
}

type EventSubConnection = {
    transport: EventSubTransport
    subscriptions: EventSubSubscription[]
}

type EventSubSubscription = {
    id: string
    type: string
    version: string
    token: string
    condition: EventSubCondition
    transport: EventSubTransport
}

function sendNotification(id: string, notification: NotificationMessage) {
    sessions.by("id", id)?.client.send(JSON.stringify(notification));
}

console.log("Setting up fastify");
fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
    prefix: "/",
});

fastify.register(require("@fastify/formbody"));

fastify.register(require("@fastify/websocket"), {
    errorHandler: function (error: Error, conn: SocketStream, req: FastifyRequest, reply: FastifyReply) {
        console.log(error)
        conn.destroy(error)
    }
});

fastify.register(require("@fastify/view"), {
    engine: {
        handlebars: require("handlebars"),
    },
});

Handlebars.registerHelper("stringify", function (v) {
    return new Handlebars.SafeString(JSON.stringify(v));
});

function _keepAlive(socket: WebSocket): Function {
    return () => keepAlive(socket);
}

function keepAlive(socket: WebSocket): void {
    socket.send(`{
                    "metadata": {
                        "message_id": "${randomUuid()}",
                        "message_type": "session_keepalive",
                        "message_timestamp": "${new Date().toISOString()}"
                    },
                    "payload": {}
                }`);
}

fastify.register(async function () {
    fastify.route({
        method: 'GET',
        url: '/',
        handler: (req: FastifyRequest, reply: any) => {
            keepSystemSafe(req);
            const options: any = {events: []};
            for (let key in events) {
                options.events.push({val: key.split(".").join("/"), name: getTranslation(key)});
            }
            reply.view('/src/pages/index.hbs', options);
        },
        wsHandler: (connection: SocketStream, req: FastifyRequest) => {
            keepSystemSafe(req)
            connection.socket.on('message', function incoming(message: MessageEvent) {
                if (message.toString() === "list") {
                    sessions.data.forEach(v => connection.socket.send(v))
                    return;
                }

                console.log(`${sessions.by("client", connection.socket)}: ${message.toString()}`)
            });

            connection.socket.on('close', () => {
                const client = sessions.by("client", connection.socket);
                if (!client) {
                    console.error("Unknown client disconnected!");
                    return;
                }
                console.log(`${client.id} disconnected`)
                sessions.remove(client);
                clearInterval(client.interval);
                subscriptions.findAndRemove({"sessionId": client.id});
            });

            const client = connection.socket

            const sessionId = generateRandomString();
            console.log(`${sessionId} connected`)

            client.send(JSON.stringify(JSON.parse(`
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

            sessions.insert({
                id: sessionId,
                client: connection.socket,
                interval: setInterval(_keepAlive(client), 10_000)
            })
        }
    })
});

fastify.get("/local.js", (request: FastifyRequest, reply: FastifyReply) => {
    keepSystemSafe(request);
    const data: any = {fields: []};
    fieldCache.data.forEach(v => {
        const type = typeCache.by("alias", v.alias)?.type;
        if (!type) console.log("Type not found: " + v.alias);
        assert(type);
        if (!type.generatesFuncion()) return;

        const popout: string = fs.readFileSync("./src/pages/popout.hbs", "utf-8")
        const elements: any[] = []
        const childData = type.buildChilds();

        let content;
        if (childData.length > 1) {
            for (let child of childData) {
                elements.push({
                    id: child.id,
                    content: child.content
                });
            }

            content = Handlebars.compile(popout)({id: v.hashId, elements: elements})
        } else if (childData.length === 1) {
            content = childData[0].content;
        } else {
            //console.error("No child data found for " + v.alias);
            return;
        }

        data.fields.push({
            name: v.hashId,
            input: content.replace(/[\n\r]/g, "")
        });
    });

    const local: string = fs.readFileSync("./public/local.ejs", "utf-8");
    reply.status(200).type("application/javascript; charset=UTF-8").send(ejs.render(local, data));
});

type ChildMeta = {
    [field: string]: string
}

type SubType = {
    version: number
    scopes: string[]
    conditions: SubCondition
    elements: string[]
    "meta:nullable"?: string[]
    "meta:primitives"?: SubTypeMeta
    "meta:twitch_types"?: SubTypeMeta
    "meta:disabled"?: string[]
    "meta:default_value"?: { [field: string]: string }
}

type SubTypeMeta = {
    [type: string]: string[]
}

type SubCondition = {
    required?: string[]
    optional?: string[]
}

type TemplateOptions = {
    [type: string]: TemplateData
}

type TemplateData = {
    type: string
    type_name: string
    elements: {
        id: string
        content: string
    }[]
}

/** @deprecated **/
type TemplateElement = {
    translated_name: string
    element: string
    disabled: boolean
    value?: string
    child?: TemplateElement[]
}

const subTypes: { [subType: string]: SubType } = require("./src/sub_types.json");
const templateOptions: TemplateOptions = {};

type FieldMeta = {
    type: string
    nullable: boolean
    enabled: boolean
    defaultValue?: string
    child?: ChildMeta
}

console.log("Registering handlers")
for (const event in events) {
    const eventData = events[event]
    console.log("Registering handlers for " + event);
    // cacheSubData(event);
    // cacheFieldData();
    templateOptions[event] = buildTemplateOptions(event);
    for (let field in events[event].fields) {
        const alias = events[event].fields[field];
        fieldCache.insert({
            alias: alias,
            fieldName: field,
            parent: event,
            parentHash: safeString(hashCode(event)),
            hashId: safeString(hashCode(field))
        });
    }

    const path: string = event.split(".").join("/");
    fastify.get(`/${path}`, (request: FastifyRequest, reply: any) => {
        keepSystemSafe(request)
        reply.view(`/src/pages/event.hbs`, templateOptions[event]);
    });

    fastify.post(`/${path}`, (request: FastifyRequest, reply: FastifyReply) => {
        keepSystemSafe(request)
        try {
            let inputs = request.body as { [field: string]: any };
            validateInputs(event, safeString(hashCode(event)), inputs);
            const sessionId = request.headers.sessionId as string;
            assert(sessionId);
            reply.status(200).send();
            const obj: Obj = {};
            for (const field in inputs) {
                const input = inputs[field];
                const fieldData = fieldCache.by("hashId", field);
                obj[field] = (typeCache.by("alias", fieldData?.alias)?.type.parse || defaultParser)(input)
            }
            sendNotification(sessionId, {
                "metadata": {
                    message_id: "",
                    message_timestamp: "",
                    message_type: event,
                    subscription_type: event,
                    subscription_version: eventData.version
                },
                "payload": {
                    "subscription": {
                        condition: {

                        },
                        cost: "",
                        created_at: "",
                        id: "",
                        status: "",
                        transport: {
                            "method": "websocket",
                            session_id: ""
                        },
                        type: event,
                        version: eventData.version
                    },
                    event: undefined
                }
            });
        } catch (e) {
            if (e instanceof FieldValidateException) reply.status(400).send((e as FieldValidateException).getJson());
            else if (e instanceof Error) reply.status(500).send(e.message);
            else reply.status(500).send(e);
        }
    });

    types.push(event);
}
console.log("Handlers registered");

type FieldValidateError = {
    errorMessage: string
    field: string
}

class FieldValidateException {
    errors: FieldValidateError[]

    constructor(errors: FieldValidateError[]) {
        this.errors = errors
    }

    getJson() {
        return {
            "errors": this.errors
        }
    }
}

function validateInputs(event: string, hash: string, inputs: { [field: string]: any }): void | never {
    const errors: FieldValidateError[] = [];
    for (const field in inputs) {
        const input = inputs[field];
        const fieldData = fieldCache.find({"hashId": field, "parentHash": hash})[0];
        if (fieldData === undefined) {
            errors.push({errorMessage: `Unknown field "${field}"`, "field": field});
            continue;
        }
        const typeData = typeCache.by("alias", fieldData.alias);
        if (typeData === undefined) {
            errors.push({errorMessage: `Unknown alias "${fieldData?.alias}"`, "field": field});
            continue;
        }
        const typeClass = typeData?.type;
        if (!typeClass?.nullable && isNull(input)) {
            const skipFields: string[] = [
                "user_id",
                "user_login",
                "user_name"
            ];
            if (skipFields.includes(field) && inputs["is_anonymous"] !== undefined) {
                try {
                    if (typeCache.by("alias", "boolean")?.type.parse(inputs["is_anonymous"])) {
                        continue;
                    }
                } catch (e) {
                }
            }
            errors.push({errorMessage: "Null or empty value is not allowed", "field": field});
            continue;
        }
        try {
            const context: { field: string, [others: string]: any } = {"field": field};
            if (inputs["is_anonymous"] !== null) context["is_anonymous"] = inputs["is_anonymous"];

            (typeClass.parse || defaultParser).bind(typeClass)(input, context);
        } catch (e) {
            let message = e;
            if (e instanceof Error) message = e.message;
            else if (typeof e === "object") message = JSON.stringify(e);
            errors.push({errorMessage: message as string, "field": field});
        }
    }
    if (errors.length > 0) throw new FieldValidateException(errors);
    return;
}

function buildTemplateOptions(event: string): TemplateData {
    const elements: { id: string, content: string }[] = [];

    //const typeData = subTypeCache[type];

    function buildFieldTemplateOptions(fieldMeta: FieldMeta, field: string): TemplateElement {
        const data: TemplateElement = {translated_name: getTranslation(field), element: field, disabled: false};
        if (!fieldMeta.enabled) data.disabled = true;
        if (fieldMeta.defaultValue !== undefined) data.value = fieldMeta.defaultValue;
        if (fieldMeta.child !== undefined) {
            data.child = [];
            for (let childKey in fieldMeta.child) {
                //data.child.push(buildFieldTemplateOptions(fieldCache[childKey], childKey))
            }
        }
        return data;
    }

    const fields = events[event].fields;
    for (const fieldName in fields) {
        //elements.push(buildFieldTemplateOptions(typeData[field], field));
        const alias: string = fields[fieldName];
        const clazz = typeCache.by("alias", alias);
        assert(clazz);
        const type = clazz.type;

        elements.push({
            id: safeString(hashCode(fieldName)),
            content: type.buildInput(safeString(hashCode(fieldName)), alias, fieldName)
        });
    }
    return {"type": event, "type_name": getTranslation(event), "elements": elements};
}

fastify.post('/test', (request: FastifyRequest, reply: any) => {
    keepSystemSafe(request)
    try {
        const event: string = request.headers.referer ? new URL(request.headers.referer).pathname.substring(1).split("/").join(".") : "";
        validateInputs(event, request.headers.eventhash as string, request.body as { [field: string]: any });
        reply.status(200).send();
    } catch (e) {
        if (e instanceof FieldValidateException) reply.status(400).send((e as FieldValidateException).getJson());
        else if (e instanceof Error) reply.status(500).send(e.message);
        else reply.status(500).send(e);
    }
});

fastify.post('/popout', (request: FastifyRequest, reply: any) => {
    keepSystemSafe(request)
    const data: any = {
        id: (request.body as any).id,
        elements: []
    };
    const json: any = request.body;
    if (json.type === "helper_user_data") {
        data.elements = [
            {
                content: '<label for="username">User name</label>' +
                    '<input type="text" id="username" name="username" placeholder="User name" required>'
            }
        ]
    } else if (json.type === "child") {
        data.elements = json.data.children;
        data.parent = json.data.parent;
    }
    reply.view(`/src/pages/popout.hbs`, data);
})

type HelixRequest = {
    type: string
    version: string
    condition: EventSubCondition
    transport: EventSubTransport
}

type HelixResponse = {
    data: HelixResponseData[]
    total: number
    total_cost: number
    max_total_cost: number
}

type HelixResponseData = {
    id: string
    status: string
    type: string
    version: string
    condition: EventSubCondition
    transport: EventSubTransport
    created_at: string
    cost: number
}

type EventSubCondition = {
    [key: string]: string
}

type EventSubTransport = {
    method: "websocket" | "webhook"
    callback?: string
    secret?: string
    session_id?: string
}

fastify.post('/eventsub/subscriptions', (request: FastifyRequest, reply: FastifyReply) => {
    keepSystemSafe(request)
    const json: any = request.body;
    if (!isHelixRequest(json)) {
        reply.status(400).send();
        return;
    }
    const authorization = request.headers.authorization;
    const client_id = request.headers["client-id"];
    if (!authorization || !client_id) {
        reply.status(401).send();
        return;
    }
    const type = json.type;
    const session_id = json.transport.session_id;
    const broadcaster_id = json.condition.broadcaster_user_id;
    const typeData = subTypes[type];
    const client = sessions.by("id", session_id);
    if (!types.includes(type) || !Number.isInteger(broadcaster_id) || !session_id || !client) {
        reply.status(400).send();
        return;
    }
    if (subscriptions.find({"sessionId": session_id, "type": type, "condition": json.condition})) {
        reply.status(409).send();
        return;
    }
    const uuid: string = randomUuid();
    subscriptions.insert({
        sessionId: session_id,
        id: uuid,
        type: type,
        version: typeData.version.toString(),
        token: authorization,
        clientId: authorization,
        condition: json.condition,
        transport: json.transport
    });
    const data: HelixResponseData = {
        "id": uuid,
        "status": "enabled",
        "type": type,
        "version": typeData.version.toString(),
        "condition": json.condition,
        "transport": json.transport,
        "created_at": new Date().toISOString(),
        "cost": 0
    };
    const response: HelixResponse = {
        "data": [data],
        "total": 1,
        "total_cost": 0,
        "max_total_cost": 10000
    }
    console.log(`${session_id} subscribed to ${type}`);
    reply.status(202).send(JSON.stringify(response));
});

fastify.delete('/eventsub/subscriptions', (request: FastifyRequest, reply: FastifyReply) => {
    keepSystemSafe(request)
    const id = (request.query as any).id;
    if (!id || !isUuid(id)) {
        reply.status(400).send();
        return;
    }
    const authorization = request.headers.authorization;
    const client_id = request.headers["client-id"];
    if (!authorization || !client_id) {
        reply.status(401).send();
        return;
    }
    const subscription = subscriptions.by("id", id);
    if (!subscription) {
        reply.status(404).send();
        return;
    }
    if (subscription.token !== authorization || subscription.clientId !== client_id) {
        reply.status(401).send();
        return;
    }
    if (subscriptions.remove(subscription)) {
        reply.status(204).send();
    }
    reply.status(403).send();
});

console.log("Starting server");
fastify.listen({
        port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
        host: "0.0.0.0"
    },
    function (err: Error | null, address: string): void {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log(`Your app is listening on ${address}`);
    }
);

function isHelixRequest(object: any): object is HelixRequest {
    return (object as HelixRequest).type !== undefined;
}

function isUuid(uuid: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

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

export function isNull(obj: string): boolean {
    return obj === "" || obj === "null";
}

export function parseBoolean(obj: string): boolean {
    try {
        const value: any = JSON.parse(obj.toLowerCase());
        if (typeof value === "boolean") return value as boolean;
    } catch (e) {
        throw "The passed value is not of type boolean"
    }
    throw "The passed value is not of type boolean"
}

function keepSystemSafe(req: FastifyRequest) {
    if (req.hostname !== "localhost:3000" && !process.env.ALLOW_OUTSIDE_ACCESS) {
        console.error("NOPE! NO OUTSIDE ACCESS HERE!");
        process.exit(0);
    }
}
