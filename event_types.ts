export type Events = {
    [event: string]: {
        version: string
        scopes: string[]
        conditions: {
            required: string[]
            optional: string[]
        }
        fields: {
            [name: string]: string
        }
    }
}
