function handleSubmit() {
    const inputs = document.querySelectorAll('input');
    const data = {};
    inputs.forEach((input) => {
        data[input.name] = input.value;
    });

    // noinspection JSUnresolvedVariable
    const jsonPayload = JSON.parse(`
{
    "metadata": {
        "message_id": "${randomUuid()}",
        "message_type": "notification",
        "message_timestamp": "${new Date().toISOString()}",
        "subscription_type": "channel.subscribe",
        "subscription_version": "1"
    },
    "payload": {
        "subscription": {
            "id": "${randomUuid()}",
            "type": "channel.subscription.gift",
            "status": "enabled",
            "version": "1",
            "cost": 0,
            "condition": {
                "broadcaster_user_id": "${data.channelId}"
            },
            "transport": {
                "method": "websocket",
                "session_id": "{SESSION_ID}"
            },
            "created_at": "${new Date().toISOString()}"
        },
        "event": {
            "user_id": "${parseBoolean(data.isAnonymous) ? "274598607" : data.userId}",
            "user_login": "${parseBoolean(data.isAnonymous) ? "ananonymousgifter" : data.userLogin}",
            "user_name": "${parseBoolean(data.isAnonymous) ? "AnAnonymousGifter" : data.userName}",
            "broadcaster_user_id": "${data.channelId}",
            "broadcaster_user_login": "${data.channelLogin}",
            "broadcaster_user_name": "${data.channelName}",
            "total": ${parseInt(data.total)},
            "tier": "${data.tier}",
            "cumulative_total": ${data.cumulativeTotal === "null" || parseBoolean(data.isAnonymous) ? "null" : parseInt(data.cumulativeTotal)},
            "is_anonymous": ${parseBoolean(data.isAnonymous)}
        }
    }
}
    `)

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "http://0.0.0.0:3000/subs");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonPayload));

}