/** Standard pagination metadata returned by list endpoints. */
export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Generic API success wrapper. */
export interface ApiMessageResponse {
  message: string
}
