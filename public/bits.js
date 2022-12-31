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
        "subscription_type": "channel.cheer",
        "subscription_version": "1"
    },
    "payload": {
        "subscription": {
            "id": "${randomUuid()}",
            "status": "enabled",
            "type": "channel.cheer",
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
            "is_anonymous": ${parseBoolean(data.isAnonymous)},
            "user_id": "${parseBoolean(data.isAnonymous) ? null : data.userId}",
            "user_login": "${parseBoolean(data.isAnonymous) ? null : data.userLogin}",
            "user_name": "${parseBoolean(data.isAnonymous) ? null : data.userName}",
            "broadcaster_user_id": "${data.channelId}",
            "broadcaster_user_login": "${data.channelLogin}",
            "broadcaster_user_name": "${data.channelName}",
            "message": ${data.message},
            "bits": ${data.total}
        }
    }
}
    `)

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "http://0.0.0.0:3000/subs");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonPayload));

}