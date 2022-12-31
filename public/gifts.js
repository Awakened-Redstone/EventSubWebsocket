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
            "status": "enabled",
            "type": "channel.subscribe",
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
            "tier": "${data.tier}",
            "total": ${data.total},
            "cumulative_months": ${parseInt(data.cumulativeMonths)},
            "cumulative_total": ${data.streakMonths === "null" || parseBoolean(data.isAnonymous) ? "null" : parseInt(data.streakMonths)},
            "duration_months": ${parseInt(data.durationMonths)}
        }
    }
}
    `)

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "http://0.0.0.0:3000/subs");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonPayload));

}