setTimeout(() => {
    const input = document.getElementById('rewardId');
    if (!input.value) {
        document.getElementById('rewardId').value = randomUuid();
    }
}, 100);

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
        "subscription_type": "channel.channel_points_custom_reward_redemption.add",
        "subscription_version": "1"
    },
    "payload": {
        "subscription": {
            "id": "${randomUuid()}",
            "status": "enabled",
            "type": "channel.channel_points_custom_reward_redemption.add",
            "version": "1",
            "cost": 0,
            "condition": {
                "broadcaster_user_id": "${data.channelId}",
                "reward_id": "${data.rewardId}"
            },
            "transport": {
                "method": "websocket",
                "session_id": "{SESSION_ID}"
            },
            "created_at": "${new Date().toISOString()}"
        },
        "event": {
            "id": "${data.rewardId}",
            "user_id": "${data.userId}",
            "user_login": "${data.userLogin}",
            "user_name": "${data.userName}",
            "broadcaster_user_id": "${data.channelId}",
            "broadcaster_user_login": "${data.channelLogin}",
            "broadcaster_user_name": "${data.channelName}",
            "status": "unfulfilled",
            "reward": {
                "id": "${data.rewardId}",
                "title": "${data.title}",
                "cost": ${parseInt(data.cost)}
            },
            "redeemed_at": "${new Date().toISOString()}"
        }
    }
}
    `)

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "http://0.0.0.0:3000/subs");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonPayload));

}