function noop() {
}

function userIdHelper() {
    // noinspection JSJQueryEfficiency
    let $user = $("#user-info");
    if ($user.length) {
        $user.remove();
        return;
    }

    $("#content").append(`
      <form class="form-container" method="post" id="user-info">
        <button class="close-popup small-button" id="close-popup" type="button" style="background-color: var(--color-background-base);" onclick="$('#user-info').remove()">
          <i class="fa-solid fa-xmark"></i></button>
        <div class="form-group" id="user-info-group">
          <label for="username">User name</label>
          <input type="text" id="username" name="username" placeholder="User name">
          <div id="username-error" class="error-message"></div>
        </div>
        <button id="user-info-submit">Submit</button>
        <div id="user-info-submit-error" class="error-message"></div>
        <div class="output" id="user-info-output"></div>
      </form>
    `);

    // noinspection JSJQueryEfficiency
    $user = $("#user-info");
    const $group = $("#user-info-group");
    const $username = $("#username");
    const $error = $("#username-error");
    const $output = $("#user-info-output");
    const submitButton = button("#user-info-submit");
    $user.submit(async (event) => {
        $group.removeClass('error');
        $error.text("");
        event.preventDefault();
        submitButton.disable();
        if (!$username.val().trim()) {
            $group.addClass('error');
            $error.text('Please insert the username');
            submitButton.enable();
            return;
        }
        const response = await fetch(`https://api.awakenedredstone.com/v2/twitch/user/${$username.val().trim()}?type=user`);
        if ((response.status === 200)) {
            const json = await response.json();
            if (json.data.length === 0) {
                $group.addClass('error');
                $error.text('Invalid username');
            } else {
                const userInfo = json.data[0];
                $output.html(`Id: ${userInfo.id}<br>Login: ${userInfo.login}<br>Display name: ${userInfo.display_name}`);
            }
        } else {
            submitButton.error("Failed to fetch user info");
        }
        submitButton.enable();
    });
}

// A wrapper for a button to disable, enable and show errors
function button(buttonId) {
    const button = $(buttonId);
    const error = $(buttonId + "-error");
    const html = button.html();
    const spinner = '<div class="loading"><div class="loadingCircle"></div></div>';
    return {
        disable: () => { // Disables the button and shows a spinner
            error.text("");
            button.removeClass("error");
            button.attr("disabled", true);
            button.html(spinner);
        },
        enable: () => { // Enables the button and removes the spinner
            button.removeAttr("disabled");
            button.html(html);
        },
        error: (errorMessage) => { // Shows an error message on the button
            button.addClass("error");
            error.text(errorMessage);
        }
    }
}

let popupIndex = 0;

// noinspection JSUnusedGlobalSymbols
function generatePopup(content, parentId) {
    const popup = $(`#popout-${createPopup()}`);
    popup.html(content)
    $('#close-popup').click(() => {
        closePopup();
    });


    const submitButton = button(`#${parentId}-submit`);
    popup.find(".form-container").submit(async (event) => {
        submitButton.disable();
        event.preventDefault();
        const formData = {};

        for (const element of popup.find(".form-group")) {
            const group = $("#" + element.id);
            const error = group.find(".error-message");
            const input = group.find("input");

            formData[input.attr('id')] = input.val();

            group.removeClass("error");
            error.text("");
        }

        let hasError = false;
        console.log(parentId)
        await $.ajax({
            type: "POST",
            data: formData,
            headers: {'eventhash': parentId},
            url: "/test",
            timeout: 2000,
            encode: true,
            success: function (data, status) {
                $(`#${parentId}`).val(JSON.stringify(formData));
            },
            error: function (response, err) {
                if (response.responseJSON) {
                    for (const error of response.responseJSON.errors) {
                        const id = `#${error.field}`;
                        $(id + "-group").addClass("error")
                        $(id + "-error").text(error.errorMessage)
                        hasError = true;
                    }
                } else {
                    submitButton.error("Incomplete data or timeout!");
                    hasError = true;
                }
            }
        }).catch(noop);

        submitButton.enable();
        if (!hasError) closePopup();
    });
}

function createPopup() {
    const wrapper = $('#popout-wrapper');
    if (popupIndex < 0) popupIndex = 0;
    if (popupIndex === 0) wrapper.removeClass('hidden');
    else $(`#popout-${popupIndex}`).addClass('hidden');
    wrapper.append(`<div class="popout" id="popout-${++popupIndex}"></div>`)
    return popupIndex;
}

function closePopup() {
    $(`#popout-${popupIndex--}`).remove();
    if (popupIndex < 0) return;
    if (popupIndex === 0) {
        $('#popout-wrapper').addClass('hidden');
    } else {
        $(`#popout-${popupIndex}`).removeClass('hidden');
    }
}

// Update remove buttons
function updateRemoveButtons(listId) {
    const list = $("#" + listId + "-list");
    const items = list.find("li");
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const button = item.querySelector("button");
        button.setAttribute("onclick", `removeListItem('${listId}', ${i})`);
    }
}

function updateListInput(listId) {
    const input = $("#" + listId);
    const list = $("#" + listId + "-list");
    const items = list.find("li");
    const values = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const value = item.querySelector("input").value;
        values.push(value);
    }
    input.val(JSON.stringify(values));
}

// Updates the content of the input to have the content of the list inputs, input val is a stingified JSON array on JSON objects
// We have to also update the remove buttons as the indexes likely changed
function updateList(listId) {
    updateListInput(listId);
    updateRemoveButtons(listId);
    // Add a change listener to the inputs, so we update the main val when we need, just make it call
    // updateListInput(listId) when the input changes
    const list = $("#" + listId + "-list");
    const items = list.find("li");
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const input = item.querySelector("input");
        //Update in real time
        input.addEventListener("input", () => updateListInput(listId));
        //On change too
        input.addEventListener("change", () => updateListInput(listId));
    }
}

//Removes the item with the given index from the list with the given id (the actual list id has a -list after the given id)
function removeListItem(listId, itemIndex) {
    const list = $("#" + listId + "-list");
    const item = list.find("li")[itemIndex];
    item.remove();
    // Update the list
    updateList(listId);
}

/*
* Adds a new item to the list with the given id (the actual list id has a -list after the given id)
* To get the html content we call a function that is the same name as the list id with a _content on the end
* Altho we have to wrap it on a div, so we can add the remove button before it
* The button must have a distinct class as it is different from the other buttons, since this one is small and
* shouldn't have a 100% width, and the content is a - to be small and take less space
*/
function addListItem(listId) {
    const list = $("#" + listId + "-list");
    const itemIndex = list.find("li").length;
    const div = $(`<li class="list-item"></li>`)
    const item = $('<input type="text" style="width: 100%;">')/*$(`${window[listId + "_content"]()}`)*/;
    const removeButton = $(`<button class="remove-list-item small-button" type="button" onclick="removeListItem('${listId}', ${itemIndex})"><i class="fa-solid fa-minus"></i></button>`);
    div.append(removeButton);
    div.append(item);
    list.append(div);
    // Update the list
    updateList(listId);
}

$(window).on("load", () => {
    const submitButton = button('#submit');
    const $form = $("#form");
    $form.submit((event) => {
        submitButton.disable(); // Disable the submit button so we can't spam it
        const formData = {}; // Create a new object to store the data
        /*$form.find(".form-group").each((_, _element) => {
            const element = $(_element);
            if (element.hasClass("form-group")) {
                console.log(element.find('input').val());
            }
        })*/

        for (const element of elements) {
            formData[element] = $("#" + element)[0].value; // Add the value of the element to the object

            // Clear the error messages
            $("#" + element + "-group").removeClass("error");
            $("#" + element + "-error").text("");
        }

        // Send the data to the server
        $.ajax({
            type: "POST",
            data: formData,
            headers: {'sessionId': sessionId},
            encode: true,
            timeout: 2000, // Set a timeout so we don't wait forever
            success: function (data, status) {
                //alert("something!");
                submitButton.enable(); // Enable the button again
            },
            error: function (response, error) {
                if (response.responseJSON) {
                    for (const error of response.responseJSON.errors) {
                        // Add the errors to the fields
                        $("#" + error.field + "-group").addClass("error")
                        $("#" + error.field + "-error").text(error.errorMessage)
                    }
                } else {
                    // If we get here, the server is down
                    submitButton.error("Incomplete data or timeout!");
                }
                submitButton.enable(); // Enable the button again
            }
        });

        event.preventDefault(); // Prevent the form from submitting
    });

    /*// Lock the broadcaster input if broadcaster_user_id isn't present
    if (!$('#broadcaster_user_id').length && !$('#user_id').length) {
        $('#broadcaster_id_helper').attr("disabled", true)
    }*/

    const is_anonymous = $('#is_anonymous'); // Get the field
    if (is_anonymous.length) { // If the field is present
        // Try lock the user input
        tryLockUserInput();
        // When the value of the field changes, try lock the user input
        is_anonymous.on('input propertychange', tryLockUserInput);
    }

    // When we load we read the input of all lists (the id is suffixed with -list) and build its children
    // We also add a change listener to the inputs, so we update the main val when we need, just make it call
    // updateListInput(listId) when the input changes
    // We use the same function the add button does, and we know somewhere in the children there is an input,
    // so we find it, and set its value to the value of the list on that index
    // So we remember that the content of the list input field is a stringified JSON array of strings
    // The input has the same id as the list, but with -list suffixed
    const lists = document.querySelectorAll("ul[id$='-list']");
    for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        const listId = list.id.substring(0, list.id.length - 5);
        // We now add the childrens with addListItem
        const listInput = $("#" + listId);
        const listInputValue = listInput.val();
        if (listInputValue) {
            const items = JSON.parse(listInputValue);
            for (let j = 0; j < items.length; j++) {
                addListItem(listId);
                // Set the value of the input
                // Use JQuery
                const input = $(`#${listId}-list li:nth-child(${j + 1}) input`);
                input.val(items[j]);
            }
        }
        //Now update the list
        updateList(listId);
    }

    $(document.body).removeClass("no-scroll");
    $("#page_loading").remove();
});

/*form.children().each((_, element) => {
   var e = $(element);
	if (e.hasClass("form-group")) {
      console.log(e.find('input').val())
	}
});*/

function tryLockUserInput() {
    let value;
    try {
        value = JSON.parse($('#is_anonymous').val()); // Try to parse the value as JSON
    } catch (e) {
    } // If it fails, it's not JSON, so we don't do anything as it's not a boolean, and so it will reach the else

    // If the value is true, lock the user input
    if (value === true) {
        // Lock the user input
        $('#user_id').attr("disabled", true)
        $('#user_id-label').attr("disabled", true)
        $('#user_login').attr("disabled", true)
        $('#user_login-label').attr("disabled", true)
        $('#user_name').attr("disabled", true)
        $('#user_name-label').attr("disabled", true)
    } else {
        // Unlock the user input
        $('#user_id').removeAttr("disabled")
        $('#user_id-label').removeAttr("disabled")
        $('#user_login').removeAttr("disabled")
        $('#user_login-label').removeAttr("disabled")
        $('#user_name').removeAttr("disabled")
        $('#user_name-label').removeAttr("disabled")
    }
}