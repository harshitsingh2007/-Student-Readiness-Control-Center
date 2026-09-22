/**
 * URL State Synchronization Utility
 * 
 * WHAT: Manages URL query parameter synchronization for search, status, sort, and pagination.
 * WHY: Section 16 requirement:
 *      Refreshing the browser should preserve the query state.
 *      Search/filter state must not exist only inside React memory.
 *      Example URL: /students?search=rahul&status=READY&page=2&sort=name
 */

export interface UrlQueryState {
  search: string;
  status: string;
  sort: string;
  order: 'ASC' | 'DESC';
  page: number;
}

export function parseUrlQueryState(searchString: string): UrlQueryState {
  const params = new URLSearchParams(searchString);
  const page = parseInt(params.get('page') || '1', 10);

  return {
    search: params.get('search') || '',
    status: params.get('status') || '',
    sort: params.get('sort') || 'name',
    order: (params.get('order')?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
    page: isNaN(page) || page < 1 ? 1 : page,
  };
}

export function buildUrlQueryString(state: Partial<UrlQueryState>): string {
  const params = new URLSearchParams();

  if (state.search && state.search.trim()) {
    params.set('search', state.search.trim());
  }

  if (state.status && state.status.trim()) {
    params.set('status', state.status.trim());
  }

  if (state.sort && state.sort !== 'name') {
    params.set('sort', state.sort);
  }

  if (state.order && state.order !== 'ASC') {
    params.set('order', state.order);
  }

  if (state.page && state.page > 1) {
    params.set('page', String(state.page));
  }

  const res = params.toString();
  return res ? `?${res}` : '';
}
