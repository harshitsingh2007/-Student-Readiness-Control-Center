/**
 * StudentFilters Component
 * 
 * WHAT: Search input, status filter dropdown, sort field selection, and order toggle.
 * WHY: Section 16 requirement:
 *      Server-driven search, status filter, stable sorting, pagination, and URL-persisted query state.
 */

import React from 'react';
import { StudentQueryFilters } from '../services/studentApi';

interface StudentFiltersProps {
  filters: StudentQueryFilters;
  onChange: (newFilters: Partial<StudentQueryFilters>) => void;
  disabled?: boolean;
}

export const StudentFilters: React.FC<StudentFiltersProps> = ({
  filters,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="filters-card">
      <div className="filter-item search-filter">
        <label htmlFor="search-input" className="filter-label">Search Students</label>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            id="search-input"
            type="text"
            className="input-text"
            placeholder="Search by name or email (debounced)..."
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value })}
            disabled={disabled}
          />
          {filters.search && (
            <button
              type="button"
              className="btn-clear"
              onClick={() => onChange({ search: '' })}
              aria-label="Clear search input"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="filter-item">
        <label htmlFor="status-select" className="filter-label">Readiness Status</label>
        <select
          id="status-select"
          className="select-dropdown"
          value={filters.status || ''}
          onChange={(e) => onChange({ status: e.target.value })}
          disabled={disabled}
        >
          <option value="">All Readiness States</option>
          <option value="READY">Ready (&gt;= 80%)</option>
          <option value="NEARLY_READY">Nearly Ready (65-79%)</option>
          <option value="DEVELOPING">Developing (50-64%)</option>
          <option value="NEEDS_PREPARATION">Needs Preparation (&lt; 50%)</option>
          <option value="INCOMPLETE">Incomplete (Missing Competencies)</option>
        </select>
      </div>

      <div className="filter-item">
        <label htmlFor="sort-select" className="filter-label">Sort By</label>
        <div className="sort-group">
          <select
            id="sort-select"
            className="select-dropdown"
            value={filters.sort || 'name'}
            onChange={(e) => onChange({ sort: e.target.value })}
            disabled={disabled}
          >
            <option value="name">Name</option>
            <option value="current_score">Readiness Score</option>
            <option value="current_readiness">Status</option>
            <option value="updated_at">Last Updated</option>
          </select>
          <button
            type="button"
            className="btn-sort-order"
            onClick={() => onChange({ order: filters.order === 'DESC' ? 'ASC' : 'DESC' })}
            disabled={disabled}
            aria-label={`Toggle sort order, currently ${filters.order || 'ASC'}`}
            title={`Sort order: ${filters.order || 'ASC'}`}
          >
            {filters.order === 'DESC' ? '↓ DESC' : '↑ ASC'}
          </button>
        </div>
      </div>
    </div>
  );
};
