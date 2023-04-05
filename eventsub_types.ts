export type NotificationMessage = {
    metadata: Metadata
    payload: Payload
}

export type Metadata = {
    message_id: string
    message_type: string
    message_timestamp: string
    subscription_type: string
    subscription_version: string
}

export type Payload = {
    subscription: Subscription
    event: any
}

export type Event = {
    [id: string]: any
}

export type Subscription = {
    id: string
    status: string
    type: string
    version: string
    cost: string
    condition: Condition
    transport: Transport
    created_at: string
}

export type Condition = {
    [key: string]: string
}

export type Transport = {
    method: "websocket" | "webhook"
    callback?: string
    secret?: string
    session_id?: string
}

