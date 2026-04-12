/**
 * Take a picture from a video element
 * @param {HTMLVideoElement} videoElement Video element
 * @returns {Promise<string>} Base64 image
 */
export const takeBase64ImageFromVideoElement = async (videoElement) => {
    if (!videoElement) {
      console.error('SMOWL: Video element not found')
      return
    }
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    // Image max size 480x640 so contain video to canvas, and not stretch
    const videoWidth = videoElement.videoWidth
    const videoHeight = videoElement.videoHeight
    const videoProportion = videoWidth / videoHeight
  
    const canvasMaxDimension = 1280// default: 1920
    if (Math.max(videoWidth, videoHeight) > canvasMaxDimension) {
      if (videoProportion > 1) {
        canvas.width = canvasMaxDimension
        canvas.height = canvasMaxDimension / videoProportion
      } else {
        canvas.width = canvasMaxDimension * videoProportion
        canvas.height = canvasMaxDimension
      }
    } else {
      canvas.width = videoWidth
      canvas.height = videoHeight
    }
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
  
    let videoCaptureBase64 = canvas.toDataURL('image/jpeg', 1.0)
  
    videoCaptureBase64 = videoCaptureBase64.replace('data:image/jpeg;base64,', '')
  
    canvas.remove()
    return videoCaptureBase64
  }
  