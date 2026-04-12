// Change elements texts
const texts = document.texts;
document.title = texts["You have been expelled"];
document.getElementById('title').innerHTML = texts["You have been expelled"];
document.getElementById('explanation').innerHTML = "";
var imageIcon = document.createElement('img');
imageIcon.src = "./img/smowl_128.png";
imageIcon.alt = "Smowl icon";
imageIcon.id = "smowl-icon";
var boldText = document.createElement('b');
boldText.innerHTML = texts["Rules breached"];
var nonBoldText = document.createTextNode(" " + texts["Contact your manager"]);
document.getElementById('explanation').appendChild(imageIcon);
document.getElementById('explanation').appendChild(boldText);
document.getElementById('explanation').appendChild(nonBoldText);
document.getElementById('accept').innerHTML = texts["Accept and close"];

let params = new URLSearchParams(document.location.search);
let reason = params.get("reason");

if (reason && texts["reason"]) {

    nonBoldText = document.createTextNode(`${texts["reason"]}: ${texts[reason]}`);
    document.getElementById('reason').appendChild(nonBoldText);

}

// When button is pressed, close the window
document.getElementById('accept').onclick = function () {
    window.close();
}