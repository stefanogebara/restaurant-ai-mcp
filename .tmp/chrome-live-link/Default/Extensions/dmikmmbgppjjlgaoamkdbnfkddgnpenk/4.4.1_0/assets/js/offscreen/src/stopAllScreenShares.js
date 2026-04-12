export function stopAllScreenShares() {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            stream.getTracks().forEach(track => track.stop());
        })
        .catch(error => console.log("Cannot stop track:", error));
}