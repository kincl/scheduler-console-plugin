import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Checkbox, SearchInput } from '@patternfly/react-core';

// Resource Selector Component - Dropdown Multiselect
export const ResourceSelector: React.FC<{
  availableResources: string[];
  selectedResources: Set<string>;
  onResourceToggle: (resource: string) => void;
}> = ({ availableResources, selectedResources, onResourceToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position and width when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();

      // Calculate width based on longest resource name
      // Create a temporary element to measure text width
      const tempElement = document.createElement('span');
      tempElement.style.visibility = 'hidden';
      tempElement.style.position = 'absolute';
      tempElement.style.fontSize = '0.875rem';
      tempElement.style.padding = '0 1rem';
      document.body.appendChild(tempElement);

      let maxWidth = 200; // minimum width
      availableResources.forEach(resource => {
        const resourceText = resource.charAt(0).toUpperCase() + resource.slice(1);
        tempElement.textContent = resourceText;
        const textWidth = tempElement.offsetWidth;
        // Add space for checkbox (24px) + margin (0.5rem) + padding (2rem total)
        const totalWidth = textWidth + 24 + 16 + 32;
        maxWidth = Math.max(maxWidth, totalWidth);
      });

      document.body.removeChild(tempElement);

      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: maxWidth
      });
    }
  }, [isOpen, availableResources]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        buttonRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedCount = selectedResources.size;
  const buttonText = selectedCount === 0
    ? 'Select Resources'
    : `Resources (${selectedCount})`;

  return (
    <>
      <div style={{ display: 'inline-block' }}>
        <Button
          ref={buttonRef}
          variant="control"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            minWidth: '200px',
            textAlign: 'left',
            justifyContent: 'space-between'
          }}
        >
          <span>{buttonText}</span>
          <span style={{ marginLeft: '0.5rem' }}>{isOpen ? '▲' : '▼'}</span>
        </Button>
      </div>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="resource-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '300px',
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: 'var(--pf-v5-global--BackgroundColor--100, var(--pf-global--BackgroundColor--100, #fff))',
            boxShadow: '0 0.5rem 1rem 0 rgba(3, 3, 3, 0.16), 0 0 0.375rem 0 rgba(3, 3, 3, 0.08)',
            borderRadius: 'var(--pf-global--BorderRadius--sm)',
            zIndex: 9999,
            padding: 0,
            border: '1px solid var(--pf-global--BorderColor--100)'
          }}
        >
          <style>{`
            .resource-dropdown {
              background-color: #fff;
              background-color: var(--pf-global--BackgroundColor--100, #fff);
              background-color: var(--pf-v5-global--BackgroundColor--100, #fff);
            }
            .pf-theme-dark .resource-dropdown {
              background-color: #212427;
              background-color: var(--pf-global--BackgroundColor--100, #212427);
              background-color: var(--pf-v5-global--BackgroundColor--100, #212427);
            }
            .resource-dropdown::-webkit-scrollbar {
              width: 8px;
            }
            .resource-dropdown::-webkit-scrollbar-track {
              background: transparent;
            }
            .resource-dropdown::-webkit-scrollbar-thumb {
              background: var(--pf-global--palette--black-400);
              border-radius: 4px;
            }
            .resource-dropdown::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--palette--black-500);
            }
          `}</style>
          {availableResources.map(resource => {
            const isSelected = selectedResources.has(resource);
            return (
              <div
                key={resource}
                style={{
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: isSelected ? 'var(--pf-global--active-color--100)' : 'transparent',
                  borderBottom: '1px solid var(--pf-global--BorderColor--100)',
                  color: 'var(--pf-global--Color--100)'
                }}
                onClick={(e) => {
                  // Toggle when clicking anywhere on the row (div, label, or checkbox)
                  const target = e.target as HTMLElement;
                  if (target.tagName !== 'INPUT') {
                    onResourceToggle(resource);
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--pf-global--BackgroundColor--200)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  } else {
                    e.currentTarget.style.backgroundColor = 'var(--pf-global--active-color--100)';
                  }
                }}
              >
                <Checkbox
                  id={`resource-${resource}`}
                  isChecked={isSelected}
                  onChange={(checked) => {
                    onResourceToggle(resource);
                  }}
                  style={{ marginRight: '0.5rem', flexShrink: 0 }}
                />
                <label
                  htmlFor={`resource-${resource}`}
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    fontSize: '0.875rem',
                    fontWeight: 'normal',
                    margin: 0,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--pf-global--Color--100)'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onResourceToggle(resource);
                  }}
                >
                  {resource.charAt(0).toUpperCase() + resource.slice(1)}
                </label>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// Project Selector Component - Dropdown Multiselect for namespaces
export const ProjectSelector: React.FC<{
  availableNamespaces: string[];
  selectedNamespaces: Set<string>;
  onNamespaceToggle: (namespace: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}> = ({ availableNamespaces, selectedNamespaces, onNamespaceToggle, onSelectAll, onClearAll }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter namespaces based on search
  const filteredNamespaces = useMemo(() => {
    if (!searchValue) return availableNamespaces;
    const lowerSearch = searchValue.toLowerCase();
    return availableNamespaces.filter(ns => ns.toLowerCase().includes(lowerSearch));
  }, [availableNamespaces, searchValue]);

  // Calculate dropdown position and width when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 300)
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        buttonRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchValue('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedCount = selectedNamespaces.size;
  const allSelected = selectedCount === availableNamespaces.length && availableNamespaces.length > 0;
  const buttonText = selectedCount === 0
    ? 'All Projects'
    : allSelected
      ? 'All Projects'
      : `Projects (${selectedCount})`;

  return (
    <>
      <div style={{ display: 'inline-block' }}>
        <Button
          ref={buttonRef}
          variant="control"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            minWidth: '200px',
            textAlign: 'left',
            justifyContent: 'space-between'
          }}
        >
          <span>{buttonText}</span>
          <span style={{ marginLeft: '0.5rem' }}>{isOpen ? '▲' : '▼'}</span>
        </Button>
      </div>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="project-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--pf-v5-global--BackgroundColor--100, var(--pf-global--BackgroundColor--100, #fff))',
            boxShadow: '0 0.5rem 1rem 0 rgba(3, 3, 3, 0.16), 0 0 0.375rem 0 rgba(3, 3, 3, 0.08)',
            borderRadius: 'var(--pf-global--BorderRadius--sm)',
            zIndex: 9999,
            padding: 0,
            border: '1px solid var(--pf-global--BorderColor--100)'
          }}
        >
          <style>
            {`
            .project-dropdown {
              background-color: #fff;
              background-color: var(--pf-global--BackgroundColor--100, #fff);
              background-color: var(--pf-v5-global--BackgroundColor--100, #fff);
            }
            .pf-theme-dark .project-dropdown {
              background-color: #212427;
              background-color: var(--pf-global--BackgroundColor--100, #212427);
              background-color: var(--pf-v5-global--BackgroundColor--100, #212427);
            }
            .project-dropdown::-webkit-scrollbar {
              width: 8px;
            }
            .project-dropdown::-webkit-scrollbar-track {
              background: transparent;
            }
            .project-dropdown::-webkit-scrollbar-thumb {
              background: var(--pf-global--palette--black-400);
              border-radius: 4px;
            }
            .project-dropdown::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--palette--black-500);
            }
            .project-dropdown-list::-webkit-scrollbar {
              width: 8px;
            }
            .project-dropdown-list::-webkit-scrollbar-track {
              background: transparent;
            }
            .project-dropdown-list::-webkit-scrollbar-thumb {
              background: var(--pf-global--palette--black-400);
              border-radius: 4px;
            }
            .project-dropdown-list::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--palette--black-500);
            }
          `}
          </style>
          {/* Search input */}
          <div style={{
            padding: '0.5rem',
            borderBottom: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: 'transparent'
          }}>
            <SearchInput
              placeholder="Search projects..."
              value={searchValue}
              onChange={(_, value) => setSearchValue(value)}
              onClear={() => setSearchValue('')}
              style={{ width: '100%' }}
            />
          </div>
          {/* Select/Clear all buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.5rem',
            borderBottom: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: 'transparent'
          }}>
            <Button
              variant="link"
              onClick={onSelectAll}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            >
              Select All
            </Button>
            <Button
              variant="link"
              onClick={onClearAll}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            >
              Clear All
            </Button>
          </div>
          {/* Namespace list */}
          <div
            className="project-dropdown-list"
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1
            }}
          >
            {filteredNamespaces.length === 0 ? (
              <div style={{
                padding: '1rem',
                textAlign: 'center',
                color: 'var(--pf-global--Color--100)',
                fontSize: '0.875rem'
              }}>
                No projects found
              </div>
            ) : (
              filteredNamespaces.map(namespace => {
                const isSelected = selectedNamespaces.has(namespace);
                return (
                  <div
                    key={namespace}
                    style={{
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: isSelected ? 'var(--pf-global--active-color--100)' : 'transparent',
                      borderBottom: '1px solid var(--pf-global--BorderColor--100)',
                      color: 'var(--pf-global--Color--100)'
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.tagName !== 'INPUT') {
                        onNamespaceToggle(namespace);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--pf-global--BackgroundColor--200)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      } else {
                        e.currentTarget.style.backgroundColor = 'var(--pf-global--active-color--100)';
                      }
                    }}
                  >
                    <Checkbox
                      id={`namespace-${namespace}`}
                      isChecked={isSelected}
                      onChange={() => {
                        onNamespaceToggle(namespace);
                      }}
                      style={{ marginRight: '0.5rem', flexShrink: 0 }}
                    />
                    <label
                      htmlFor={`namespace-${namespace}`}
                      style={{
                        cursor: 'pointer',
                        flex: 1,
                        fontSize: '0.875rem',
                        fontWeight: 'normal',
                        margin: 0,
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--pf-global--Color--100)'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNamespaceToggle(namespace);
                      }}
                    >
                      {namespace}
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
};
