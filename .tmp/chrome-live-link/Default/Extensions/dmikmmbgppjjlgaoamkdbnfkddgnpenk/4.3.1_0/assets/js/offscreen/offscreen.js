import { takeBase64ImageFromVideoElement } from "./src/takeBase64ImageFromVideoElement.js";

let media;
let videoTrack;
let dispositivo;

// Sharing Config
let imageCaptureInterval
let isScreenShareOpen = false;
let notSharingAllowedTime // Allowed time to share again or the student will be expelled (30s by default on START_DESKTOP_CAPTURE, configurable) 
let notSharingTimeout


// Periodic Capture Config
let isPeriodicCaptureEnabled = false;
let freq
let expelIfNotShared

(() => { // Para que funcione la parte asíncrona y el sendResponse
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.target == "offscreen") {
            switch (message.id) {
                case 'START_DESKTOP_CAPTURE':
                    freq = message.freq
                    expelIfNotShared = message.expelIfNotShared
                    notSharingAllowedTime = message.screenNotSharedTime ?? 30000 // default value 30s
                    isPeriodicCaptureEnabled = true

                    if (!isMediaShared())
                        showScreenSharePrompt()

                    startImageCapture()
                    break;
                case 'STOP_DESKTOP_CAPTURE':
                    stopRecording();
                    chrome.runtime.sendMessage({ id: "STOPPED_RECORDING"});
                    return false;
                    break;
                case 'SHOW_SCREEN_SHARE_PROMPT':
                    showScreenSharePrompt()
                    return true; // async
                    break;
                case 'IMMEDIATE_DESKTOP_CAPTURE':
                    const allowNotShared = message.allowNotShared ?? false
                    if (!isMediaShared() && !allowNotShared)
                        showScreenSharePrompt()
                    inmediateDesktopCapture(sendResponse)
                    return true; // async
                    break;
                case 'SCREEN_SHARE_STATUS_CHECK_OFFSCREEN':
                    const isScreenSharedStatus = isMediaShared();
                    sendResponse(isScreenSharedStatus);
                    return false;
                    break;
                case 'RESETED_OFFSCREEN':
                    freq = message.freq
                    expelIfNotShared = message.expelIfNotShared
                    notSharingAllowedTime = message.screenNotSharedTime ?? 30000 // default value 30s
                    isPeriodicCaptureEnabled = message.isPeriodicCaptureEnabled ?? false
                    return false; // sync
                    break;
            }
        }
    });
})();

async function getDisplayMedia() {
    try {
        await chrome.runtime.sendMessage({ id: "SELECTING_DISPLAY", state: true });
        isScreenShareOpen = true
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: "monitor",
            },
            audio: false
        });
        await chrome.runtime.sendMessage({ id: "SELECTING_DISPLAY", state: false });
        return stream;
    } catch (error) {
        isScreenShareOpen = false
        await chrome.runtime.sendMessage({ id: "SELECTING_DISPLAY", state: false });
        console.error("Error getting display media:", error);
        if (error.name === 'NotAllowedError') {
            window.location.hash = 'screenCancelled';
            resetPermissionStates()
        }
        throw error;
    }
}

async function showScreenSharePrompt() {
    if (!notSharingTimeout) {
        clearTimeout(notSharingTimeout)
        notSharingTimeout = setTimeout(() => {
            if (expelIfNotShared) chrome.runtime.sendMessage({ id: "EXPEL_USER", type: 4 }); // Not sharing expel
            notSharingTimeout = null
        }, notSharingAllowedTime)
    }
    chrome.runtime.sendMessage({ id: "SHOW_ALERT", type: "screenShareInfo" });
    if (isScreenShareOpen) return
    stopVideoTrack()
    try {
        do {
            resetPermissionStates()
            media = await getDisplayMedia();

            isScreenShareOpen = false
            videoTrack = media.getVideoTracks()[0];
            dispositivo = videoTrack.label.split(':')[0];

            if (dispositivo !== 'screen') {
                chrome.runtime.sendMessage({ id: "SHOW_ALERT", type: "incorrectScreen" });
                videoTrack.stop();
            }
        } while (dispositivo !== 'screen');
        videoTrack?.addEventListener('ended', notSharingHandler); // detect if the screen sharing is stopped
        chrome.runtime.sendMessage({ id: "SHOW_ALERT", type: "correctScreen" });
        saveScreenSharing_offscreen(true)
        startCapturesFlow()
        clearTimeout(notSharingTimeout)
        notSharingTimeout = null
    } catch (error) {
        isScreenShareOpen = false
        // console.error("[showScreenSharePrompt()]", error)

        if (error.name === 'NotReadableError') showScreenSharePrompt();
    }
}

function startCapturesFlow() {
    if (isPeriodicCaptureEnabled) startImageCapture()
}

function stopVideoTrack() {
    if (videoTrack) videoTrack.stop() // to avoid multiple sharing
    resetPermissionStates()
}

async function startImageCapture() {
    const videoElement = document.querySelector('video')
    videoElement.srcObject = media;
    videoElement.play();

    clearInterval(imageCaptureInterval)

    videoElement.onloadedmetadata = () => {
        imageCaptureInterval = setInterval(() => {
            console.log("captura periódica", isPeriodicCaptureEnabled)
            if (!isPeriodicCaptureEnabled) return
            takeBase64ImageFromVideoElement(videoElement)
                .then((capture) => {
                    if (capture) {
                        chrome.runtime.sendMessage(
                            chrome.runtime.id,
                            {
                                id: "SAVE_PERIODIC_CAPTURE",
                                capture: capture
                            }
                        )
                    }
                })
        }, freq)
    }

}


async function inmediateDesktopCapture(sendResponse) {
    if (!media) sendResponse(undefined)
    const videoElement = document.querySelector('video')
    videoElement.srcObject = media;
    videoElement.onloadedmetadata = async () => {
        videoElement.play();
        const image = await takeBase64ImageFromVideoElement(videoElement)
        if (!image) console.error("CANNOT CAPTURE IMAGE:", image)
        sendResponse(image)
    }
}

function stopRecording() {
    // Clear image capture interval
    expelIfNotShared = false
    clearInterval(imageCaptureInterval)
    if (videoTrack) videoTrack.stop()
    isPeriodicCaptureEnabled = false

    window.location.hash = '';

    resetPermissionStates()
}

function notSharingHandler(event) {
    resetPermissionStates()

    clearInterval(imageCaptureInterval)

    saveScreenSharing_offscreen(false)
    chrome.runtime.sendMessage({ id: "SHOW_ALERT", type: "notSharing" });

    setTimeout(() => {
        clearTimeout(notSharingTimeout)
        notSharingTimeout = setTimeout(() => {
            if (expelIfNotShared) chrome.runtime.sendMessage({ id: "EXPEL_USER", type: 4 }); // Not sharing expel
            notSharingTimeout = null
        }, notSharingAllowedTime)
    }, 2000)
}

function isMediaShared() {
    return media ? true : false
}

function saveScreenSharing_offscreen(isSharing) {
    chrome.runtime.sendMessage({ id: "SAVE_SHARING_SCREEN", isSharing });
}

function resetPermissionStates() {
    media = null;
    videoTrack = null;
    dispositivo = null;
}