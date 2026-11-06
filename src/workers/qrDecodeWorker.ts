import jsQR from 'jsqr'

type DecodeMessage = {
  type: 'decode'
  file: File
}

type WorkerMessage = DecodeMessage

type ProgressMessage = {
  type: 'progress'
  progress: number
  stage: string
}

type SuccessMessage = {
  type: 'decode:success'
  text: string
}

type ErrorMessage = {
  type: 'error'
  message: string
}

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope
const MAX_DIMENSION = 2048

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type !== 'decode') {
    return
  }

  try {
    postProgress(20, '正在加载图片')
    const bitmap = await createImageBitmap(message.file)
    const { width, height } = fitSize(bitmap.width, bitmap.height)

    postProgress(55, '正在解析二维码')
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('无法创建离屏画布')
    }

    context.drawImage(bitmap, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    const result = jsQR(imageData.data, width, height, {
      inversionAttempts: 'attemptBoth',
    })

    bitmap.close()

    if (!result?.data) {
      throw new Error('未识别到有效二维码内容')
    }

    ctx.postMessage({
      type: 'decode:success',
      text: result.data,
    } satisfies SuccessMessage)
  } catch (error: any) {
    ctx.postMessage({
      type: 'error',
      message: error?.message || '二维码识别失败',
    } satisfies ErrorMessage)
  }
}

function fitSize(width: number, height: number) {
  const longest = Math.max(width, height)
  if (longest <= MAX_DIMENSION) {
    return { width, height }
  }

  const scale = MAX_DIMENSION / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function postProgress(progress: number, stage: string) {
  ctx.postMessage({
    type: 'progress',
    progress,
    stage,
  } satisfies ProgressMessage)
}

export {}
