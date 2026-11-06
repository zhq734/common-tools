/** 统一接口响应包装 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export * from './toolbox'
