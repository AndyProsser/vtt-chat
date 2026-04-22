interface AdminPaginationProps {
  page: number
  totalPages: number
  loading?: boolean
  onPrevious: () => void
  onNext: () => void
}

export function AdminPagination({
  page,
  totalPages,
  loading = false,
  onPrevious,
  onNext,
}: AdminPaginationProps) {
  return (
    <div className="admin-pagination">
      <button className="admin-btn admin-btn-ghost" disabled={page <= 1 || loading} onClick={onPrevious}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        className="admin-btn admin-btn-ghost"
        disabled={page >= totalPages || loading}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  )
}
