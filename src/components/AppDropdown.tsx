import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MaterialIcon, type MaterialIconName } from './MaterialIcon';

export interface AppDropdownOption {
  value: string;
  label: string;
  icon?: MaterialIconName;
  disabled?: boolean;
}

interface AppDropdownProps {
  value: string;
  options: readonly AppDropdownOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function nextEnabledIndex(
  options: readonly AppDropdownOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (currentIndex + direction * offset + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function AppDropdown({
  value,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  onChange,
}: AppDropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => options.findIndex((option) => option.value === value));
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const updatePosition = () => {
      if (!menuRef.current || !triggerRef.current) return;
      const menuBounds = menuRef.current.getBoundingClientRect();
      const triggerBounds = triggerRef.current.getBoundingClientRect();
      const spaceBelow = document.documentElement.clientHeight - triggerBounds.bottom;
      const spaceAbove = triggerBounds.top;
      setOpensUp(menuBounds.height > spaceBelow && spaceAbove > spaceBelow);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const activeOption = document.getElementById(`${listboxId}-option-${activeIndex}`);
    if (typeof activeOption?.scrollIntoView === 'function') activeOption.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listboxId, open]);

  const openMenu = () => {
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabledIndex(options, -1, 1));
    setOpensUp(false);
    setOpen(true);
  };

  const selectOption = (option: AppDropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((index) => nextEnabledIndex(options, index, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open && activeIndex >= 0) {
      event.preventDefault();
      selectOption(options[activeIndex]);
      return;
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      const startingIndex = event.key === 'Home' ? -1 : 0;
      setActiveIndex(nextEnabledIndex(options, startingIndex, event.key === 'Home' ? 1 : -1));
      return;
    }
    if (open && event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`app-dropdown ${open ? 'is-open' : ''} ${opensUp ? 'opens-up' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="app-dropdown-trigger gemini-control"
        aria-label={`${ariaLabel}: ${selectedOption?.label ?? placeholder}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={selectedOption ? '' : 'app-dropdown-placeholder'}>
          {selectedOption?.label ?? placeholder}
        </span>
        <MaterialIcon name="expand_more" className="app-dropdown-chevron" />
      </button>

      {open ? (
        <div ref={menuRef} id={listboxId} className="app-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                tabIndex={-1}
                className={`app-dropdown-option ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`}
                onPointerEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                onClick={() => selectOption(option)}
              >
                {option.icon ? <MaterialIcon name={option.icon} className="app-dropdown-option-icon" /> : null}
                <span>{option.label}</span>
                {selected ? <MaterialIcon name="check" className="app-dropdown-check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
