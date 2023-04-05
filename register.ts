import assert from "assert";
import {fieldCache, getTranslation, isNull, parseBoolean, registerClass, typeCache} from "./server";
import Handlebars from "handlebars";
import {hashId} from "./utils";
import fs from "fs";

export default function () {
    registerClass("string", new _String());
    registerClass("string?", new _String(true));

    registerClass("boolean", new _Boolean());
    registerClass("boolean?", new _Boolean(true));

    registerClass("integer", new Integer());
    registerClass("integer?", new Integer(true));

    registerClass("outcome", new Outcome());
    registerClass("outcomes[]", new OutcomeArray());
    registerClass("top_predictor", new TopPredictors());
    registerClass("top_predictors[]", new TopPredictorsArray());
    registerClass("bits_voting", new BitsVoting(false, false, "false"));
    registerClass("channel_points_voting", new ChannelPointsVoting());
    registerClass("max_per_stream", new MaxPerStream());
    registerClass("max_per_user_per_stream", new MaxPerStream());
    registerClass("image", new Image());
    registerClass("image?", new Image(true));
    registerClass("global_cooldown", new GlobalCooldown());
    registerClass("reward", new Reward());
    registerClass("choices[]", new ChoiceArray());
    registerClass("choice", new Choice());
    registerClass("money_amount", new MoneyAmount());
    registerClass("top_contribution", new TopContribution());
    registerClass("top_contributions[]", new TopContributionsArray());
    registerClass("last_contribution", new TopContribution());
}

function unHash(input: string, self: Class<any>) {
    const object: any = {}
    const value: any = JSON.parse(input);

    const type = typeCache.where(obj => obj.type === self)[0];

    for (let key in value) {
        const fieldData = fieldCache.find({"hashId": key, "parent": type.alias})[0];
        object[fieldData.fieldName] = value[key];
    }

    return object;
}

function join(separator: string, ...values: string[]): string {
    let val = ""
    for (let i = 0; i < values.length; i++) {
        val += values[i];
        if (i < values.length - 1) val += separator;
    }
    return val.trimEnd();
}

function compile(input: string, context: any) {
    const local: string = fs.readFileSync(`./src/templates/${input}.hbs`, "utf-8");
    return Handlebars.compile(local)(context);
}

export function basicInputField(clazz: Class<any, string>, id: string, labelName: string): string {
    const options: any = {
        id: id,
        disabled: !clazz.enabled,
        value: clazz.defaultValue
    };

    return compile("basicInputField", options);
}

export function listInputField(clazz: Class<any[], any>, id: string, laeblName: string): string {
    const options: any = {
        id: id,
        disabled: !clazz.enabled,
        value: clazz.defaultValue,
        label: laeblName
    };

    return compile("listInputField", options);
}

export function parentInputField(clazz: Class<any>, id: string, labelName: string): string {
    const options: any = {
        id: id,
        disabled: !clazz.enabled || clazz.buildChilds().length === 0,
        value: clazz.defaultValue
    };

    return compile('parentInputField', options);
}

type ChildData = {
    id: string
    alias: string
    fieldName: string
    content: string
}

export abstract class Class<T, I = T> {
    static class = Class<any>;
    public readonly nullable: boolean;
    public readonly enabled: boolean;
    public readonly defaultValue: I | null;
    protected generatesFunction = true;
    protected primary = false;

    constructor(nullable: boolean = false, enabled: boolean = true, defaultValue: I | null = null) {
        this.nullable = nullable;
        this.enabled = enabled;
        this.defaultValue = defaultValue;
    }

    public isPrimary(): boolean {
        return this.primary;
    }

    public generatesFuncion(): boolean {
        return this.generatesFunction;
    }

    public buildInput(id: string, alias: string, fieldName: string): string {
        const options: any = {
            id: id,
            disabled: !this.enabled,
            translated_name: getTranslation(fieldName)
        };

        const field = this.createInput(id, options.translated_name).trim();
        let label = "";
        if (!field.includes("<label") && !fieldName.startsWith("~")) {
            // noinspection HtmlUnknownAttribute
             label = Handlebars.compile('<label for="{{id}}" id="{{id}}-label" {{#if disabled}}disabled{{/if}}>{{translated_name}}:</label>')(options);
        }
        return join("", label, field);
    }

    protected abstract createInput(id: string, labelName: string): string;

    protected getChilds(): { [name: string]: string } | null {
        return null;
    }

    public buildChilds(): ChildData[] {
        const childs = this.getChilds();
        if (childs) {
            let content: ChildData[] = [];
            for (let fieldName in childs) {
                const alias = childs[fieldName];
                const clazz = typeCache.by("alias", alias);
                assert(clazz);
                const id = hashId(fieldName);
                content.push({
                    id: id,
                    alias: alias,
                    fieldName: fieldName,
                    content: clazz.type.buildInput(id, alias, fieldName)
                });
            }
            return content;
        } else return [];
    }

    public parse(input: string, context: any = undefined): T | never {
        if (!this.nullable && isNull(input)) throw "Null or empty value is not allowed"
        try {
            return this._parse(input, context);
        } catch (e) {
            console.error(e)
            if (typeof e !== "string") throw "Failed to parse value";
            else throw e;
        }
    }

    protected abstract _parse(input: string, context: any): T | never
}

class _String extends Class<string, string> {
    protected readonly generatesFunction = false;
    protected readonly primary = true;

    _parse(input: string, context: any): string {
        return input;
    }

    protected createInput(id: string, label: string): string {
        return basicInputField(this, id, label);
    }
}

class _Boolean extends Class<boolean, string> {
    protected readonly generatesFunction = false;
    protected readonly primary = true;

    _parse(input: string): boolean {
        return parseBoolean(input);
    }

    protected createInput(id: string, label: string): string {
        return basicInputField(this, id, label);
    }
}

class Integer extends Class<number, string> {
    protected readonly generatesFunction = false;
    protected readonly primary = true;

    _parse(input: string): number {
        const number = parseInt(input);
        if (Number.isNaN(number)) throw 'Value must be an integer'
        return number;
    }

    protected createInput(id: string, label: string): string {
        return basicInputField(this, id, label);
    }
}

type top_predictors = {
    user_id: string
    user_login: string
    user_name: string
    channel_points_won: number | null
    channel_points_used: number
}

class TopPredictors extends Class<top_predictors> {
    _parse(input: string): top_predictors {
        const value = JSON.parse(input);
        return {
            user_id: value.user_id,
            user_login: value.user_login,
            user_name: value.user_name,
            channel_points_won: isNull(value.channel_points_won) ? null : new Integer().parse(value.channel_points_won),
            channel_points_used: new Integer().parse(value.channel_points_used)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

class TopPredictorsArray extends Class<top_predictors[]> {
    _parse(input: string): top_predictors[] {
        const value = JSON.parse(input);
        assert(Array.isArray(value));
        const result: top_predictors[] = [];

        for (const object of value) {
            result.push(new TopPredictors(false, true, null)._parse(JSON.stringify(object)));
        }

        return result;
    }

    protected createInput(id: string, label: string): string {
        return listInputField(this, id, label);
    }
}

type outcome = {
    id: string
    title: string
    color: string
    users: number
    channel_points: number
    top_predictors: top_predictors
}

export class Outcome extends Class<outcome> {
    _parse(input: string): outcome {
        const value = JSON.parse(input);
        return {
            id: value.id,
            title: value.title,
            color: value.color,
            users: new Integer().parse(value.users),
            channel_points: new Integer().parse(value.channel_points),
            top_predictors: new TopPredictors(false, true, null)._parse(JSON.stringify(value.top_predictors))
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }

    protected getChilds(): { [p: string]: string } | null {
        return {
            id: "string",
            title: "string",
            color: "string",
            users: "integer",
            channel_points: "integer",
            top_predictors: "top_predictors[]"
        };
    }
}

class OutcomeArray extends Class<outcome[]> {
    _parse(input: string): outcome[] {
        const value = JSON.parse(input);
        assert(Array.isArray(value));
        const result: outcome[] = [];

        for (const object of value) {
            result.push(new Outcome(false, true, null)._parse(JSON.stringify(object)));
        }

        return result;
    }

    protected createInput(id: string, label: string): string {
        return listInputField(this, id, label);
    }
}

type bits_voting = {
    is_enabled: boolean
    amount_per_vote: number
}

export class BitsVoting extends Class<bits_voting, string> {
    protected readonly generatesFunction = false;

    _parse(input: string): bits_voting {
        return {is_enabled: false, amount_per_vote: 0};
    }

    protected createInput(id: string, label: string): string {
        return basicInputField(this, id, label);
    }
}

type channel_points_voting = {
    is_enabled: boolean
    amount_per_vote: number
}

export class ChannelPointsVoting extends Class<channel_points_voting> {
    _parse(input: string): channel_points_voting {
        const value = unHash(input, this);
        console.log(value)
        return {
            is_enabled: parseBoolean(value.is_enabled),
            amount_per_vote: new Integer().parse(value.amount_per_vote)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }

    protected getChilds(): { [p: string]: string } | null {
        return {
            is_enabled: "boolean",
            amount_per_vote: "integer"
        };
    }
}

type max_per_stream = {
    is_enabled: boolean
    value: number
}

export class MaxPerStream extends Class<max_per_stream> {
    _parse(input: string): max_per_stream {
        const value = JSON.parse(input);
        return {
            is_enabled: parseBoolean(value.is_enabled),
            value: new Integer().parse(value.value)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

type image = {
    url_1x: string
    url_2x: string
    url_4x: string
}

export class Image extends Class<image> {
    _parse(input: string): image {
        return JSON.parse(input);
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

type global_cooldown = {
    is_enabled: boolean
    seconds: number
}

export class GlobalCooldown extends Class<global_cooldown> {
    _parse(input: string): global_cooldown {
        const value = JSON.parse(input);
        return {
            is_enabled: parseBoolean(value.is_enabled),
            seconds: new Integer().parse(value.seconds)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

type reward = {
    id: string
    title: string
    cost: number
    prompt: string
}

export class Reward extends Class<reward> {
    _parse(input: string): reward {
        const value = JSON.parse(input);
        return {
            id: value.id,
            title: value.title,
            cost: new Integer().parse(value.cost),
            prompt: value.prompt
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

type choice = {
    id: string
    title: string
    bits_votes: number
    channel_points_votes: number
    votes: number
}

export class Choice extends Class<choice> {
    _parse(input: string): choice {
        const value = JSON.parse(input);
        return {
            id: value.id,
            title: value.title,
            bits_votes: 0,
            channel_points_votes: new Integer().parse(value.users),
            votes: new Integer().parse(value.channel_points)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }

    protected getChilds(): { [p: string]: string } | null {
        return {
            id: "string",
            title: "string",
            bits_votes: "integer",
            channel_points_votes: "integer",
            votes: "integer"
        };
    }
}

class ChoiceArray extends Class<choice[]> {
    _parse(input: string): choice[] {
        const value = JSON.parse(input);
        assert(Array.isArray(value));
        const result: choice[] = [];

        for (const object of value) {
            result.push(new Choice(false, true, null)._parse(JSON.stringify(object)));
        }

        return result;
    }

    protected createInput(id: string, label: string): string {
        return listInputField(this, id, label);
    }

    protected getChilds(): { [p: string]: string } | null {
        return {
            "~value": "choice",
        };
    }
}

type money_amount = {
    value: number
    decimal_places: number
    currency: string
}

export class MoneyAmount extends Class<money_amount> {
    _parse(input: string): money_amount {
        const value = JSON.parse(input);
        return {
            value: new Integer().parse(value.value),
            decimal_places: new Integer().parse(value.decimal_places),
            currency: value.currency
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

type top_contributions = {
    user_id: string
    user_login: string
    user_name: number
    type: "bits" | "subscription" | "other"
    total: number
}

export class TopContribution extends Class<top_contributions> {
    _parse(input: string): top_contributions {
        const value = JSON.parse(input);
        return {
            user_id: value.user_id,
            user_login: value.user_login,
            user_name: value.user_name,
            type: value.type,
            total: new Integer().parse(value.total)
        };
    }

    protected createInput(id: string, label: string): string {
        return parentInputField(this, id, label);
    }
}

class TopContributionsArray extends Class<top_contributions[]> {
    _parse(input: string): top_contributions[] {
        const value = JSON.parse(input);
        assert(Array.isArray(value));
        const result: top_contributions[] = [];

        for (const object of value) {
            result.push(new TopContribution(false, true, null)._parse(JSON.stringify(object)));
        }

        return result;
    }

    protected createInput(id: string, label: string): string {
        return listInputField(this, id, label);
    }
}

